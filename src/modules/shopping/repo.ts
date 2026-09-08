import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  notInArray,
  sql,
} from 'drizzle-orm'
import { db } from '#/core/db/client'
import { householdScope } from '#/core/db/household-scope'
import { createItemRecord, deleteItemRecord } from '#/core/items/repo'
import { reminders } from '#/core/items/schema'
import { moveCategory, normalizeItemName } from './list-logic'
import {
  shoppingCategories,
  shoppingItemHistory,
  shoppingItems,
  shoppingLists,
} from './schema'

/**
 * v1 auto-provisions one list per household (§11 risk 9: keep M6 small —
 * no multi-list management UI yet). Idempotent: returns the existing list
 * if one is already there.
 */
export async function getOrCreateDefaultList(
  householdId: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: shoppingLists.id })
    .from(shoppingLists)
    .where(
      householdScope(
        shoppingLists,
        householdId,
        eq(shoppingLists.isArchived, false),
      ),
    )
    .limit(1)
  if (existing) return existing.id

  const [created] = await db
    .insert(shoppingLists)
    .values({ householdId, name: 'Shopping list' })
    .returning({ id: shoppingLists.id })
  if (!created) throw new Error('Insert did not return a row')
  return created.id
}

export interface CategoryView {
  id: string
  name: string
  sort: number
}

export async function listCategories(
  householdId: string,
): Promise<CategoryView[]> {
  return db
    .select({
      id: shoppingCategories.id,
      name: shoppingCategories.name,
      sort: shoppingCategories.sort,
    })
    .from(shoppingCategories)
    .where(householdScope(shoppingCategories, householdId))
    .orderBy(asc(shoppingCategories.sort))
}

async function getOrCreateCategory(
  householdId: string,
  name: string,
): Promise<string> {
  const trimmed = name.trim()
  const [existing] = await db
    .select({ id: shoppingCategories.id })
    .from(shoppingCategories)
    .where(
      householdScope(
        shoppingCategories,
        householdId,
        eq(shoppingCategories.name, trimmed),
      ),
    )
    .limit(1)
  if (existing) return existing.id

  const categories = await listCategories(householdId)
  const nextSort =
    categories.length > 0 ? Math.max(...categories.map((c) => c.sort)) + 1 : 0

  const [created] = await db
    .insert(shoppingCategories)
    .values({ householdId, name: trimmed, sort: nextSort })
    .returning({ id: shoppingCategories.id })
  if (!created) throw new Error('Insert did not return a row')
  return created.id
}

/**
 * Items pointing at the deleted category fall back to Uncategorized via the
 * column's own `onDelete: 'set null'` FK — no extra cleanup needed here.
 */
export async function deleteCategory(
  householdId: string,
  categoryId: string,
): Promise<void> {
  await db
    .delete(shoppingCategories)
    .where(
      householdScope(
        shoppingCategories,
        householdId,
        eq(shoppingCategories.id, categoryId),
      ),
    )
}

export async function reorderCategory(
  householdId: string,
  categoryId: string,
  direction: 'up' | 'down',
): Promise<void> {
  const categories = await listCategories(householdId)
  const updates = moveCategory(categories, categoryId, direction)
  if (!updates) return
  for (const update of updates) {
    await db
      .update(shoppingCategories)
      .set({ sort: update.sort })
      .where(
        householdScope(
          shoppingCategories,
          householdId,
          eq(shoppingCategories.id, update.id),
        ),
      )
  }
}

/**
 * The one write path for a drag drop. Sets the moved item's category,
 * rewrites the destination bucket's `sort` from `orderedItemIds`, and — if
 * the item changed buckets — closes the gap it left in the source bucket.
 * `orderedItemIds` is the full final order of the destination bucket's
 * unchecked items and includes `itemId`.
 */
export async function moveItem(
  householdId: string,
  input: {
    itemId: string
    categoryId: string | null
    orderedItemIds: string[]
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        categoryId: shoppingItems.categoryId,
        listId: shoppingItems.listId,
      })
      .from(shoppingItems)
      .where(
        householdScope(
          shoppingItems,
          householdId,
          eq(shoppingItems.id, input.itemId),
        ),
      )
    if (!current) throw new Error('Item not found')

    const owned = await tx
      .select({ id: shoppingItems.id })
      .from(shoppingItems)
      .where(
        householdScope(
          shoppingItems,
          householdId,
          and(
            eq(shoppingItems.listId, current.listId),
            inArray(shoppingItems.id, input.orderedItemIds),
          ),
        ),
      )
    if (owned.length !== input.orderedItemIds.length) {
      throw new Error('orderedItemIds does not match this list')
    }

    await tx
      .update(shoppingItems)
      .set({ categoryId: input.categoryId })
      .where(
        householdScope(
          shoppingItems,
          householdId,
          eq(shoppingItems.id, input.itemId),
        ),
      )

    for (const [index, id] of input.orderedItemIds.entries()) {
      await tx
        .update(shoppingItems)
        .set({ sort: index })
        .where(
          householdScope(shoppingItems, householdId, eq(shoppingItems.id, id)),
        )
    }

    if (current.categoryId !== input.categoryId) {
      const sourceRows = await tx
        .select({ id: shoppingItems.id })
        .from(shoppingItems)
        .where(
          householdScope(
            shoppingItems,
            householdId,
            and(
              eq(shoppingItems.listId, current.listId),
              eq(shoppingItems.isChecked, false),
              current.categoryId === null
                ? isNull(shoppingItems.categoryId)
                : eq(shoppingItems.categoryId, current.categoryId),
            ),
          ),
        )
        .orderBy(asc(shoppingItems.sort), asc(shoppingItems.createdAt))
      for (const [index, row] of sourceRows.entries()) {
        await tx
          .update(shoppingItems)
          .set({ sort: index })
          .where(
            householdScope(
              shoppingItems,
              householdId,
              eq(shoppingItems.id, row.id),
            ),
          )
      }
    }
  })
}

export interface ItemReminderView {
  id: string
  fireAt: string
}

export type ItemPriority = 'low' | 'medium' | 'high'

export interface ItemView {
  id: string
  name: string
  quantity: number | null
  unit: string | null
  note: string | null
  categoryId: string | null
  priority: ItemPriority | null
  isChecked: boolean
  addedBy: string | null
  reminders: ItemReminderView[]
}

export async function listItems(
  householdId: string,
  listId: string,
): Promise<ItemView[]> {
  const itemRows = await db
    .select({
      id: shoppingItems.id,
      name: shoppingItems.name,
      quantity: shoppingItems.quantity,
      unit: shoppingItems.unit,
      note: shoppingItems.note,
      categoryId: shoppingItems.categoryId,
      priority: shoppingItems.priority,
      isChecked: shoppingItems.isChecked,
      addedBy: shoppingItems.addedBy,
    })
    .from(shoppingItems)
    .where(
      householdScope(
        shoppingItems,
        householdId,
        eq(shoppingItems.listId, listId),
      ),
    )
    .orderBy(asc(shoppingItems.sort), asc(shoppingItems.createdAt))

  const itemIds = itemRows.map((i) => i.id)
  const reminderRows =
    itemIds.length > 0
      ? await db
          .select({
            id: reminders.id,
            itemId: reminders.itemId,
            fireAt: reminders.fireAt,
          })
          .from(reminders)
          .where(
            householdScope(
              reminders,
              householdId,
              inArray(reminders.itemId, itemIds),
            ),
          )
          .orderBy(reminders.fireAt)
      : []

  const remindersByItem = new Map<string, ItemReminderView[]>()
  for (const r of reminderRows) {
    if (r.fireAt == null) continue
    const list = remindersByItem.get(r.itemId) ?? []
    list.push({ id: r.id, fireAt: r.fireAt.toISOString() })
    remindersByItem.set(r.itemId, list)
  }

  return itemRows.map((item) => ({
    ...item,
    reminders: remindersByItem.get(item.id) ?? [],
  }))
}

export interface AddItemInput {
  householdId: string
  listId: string
  name: string
  quantity?: number
  unit?: string
  note?: string
  categoryName?: string
  priority?: ItemPriority
  addedBy: string
}

export async function addItem(input: AddItemInput): Promise<string> {
  const categoryId = input.categoryName
    ? await getOrCreateCategory(input.householdId, input.categoryName)
    : null

  return createItemRecord(
    input.householdId,
    'shopping_item',
    async (tx, id) => {
      const [row] = await tx
        .insert(shoppingItems)
        .values({
          id,
          householdId: input.householdId,
          listId: input.listId,
          name: input.name.trim(),
          quantity: input.quantity ?? null,
          unit: input.unit ?? null,
          note: input.note ?? null,
          categoryId,
          priority: input.priority ?? null,
          addedBy: input.addedBy,
        })
        .returning({ id: shoppingItems.id })
      if (!row) throw new Error('Insert did not return a row')
      return row.id
    },
  )
}

export interface UpdateItemInput {
  householdId: string
  itemId: string
  name: string
  quantity?: number
  unit?: string
  note?: string
  categoryName?: string
  priority?: ItemPriority
}

export async function updateItem(input: UpdateItemInput): Promise<void> {
  const categoryId = input.categoryName
    ? await getOrCreateCategory(input.householdId, input.categoryName)
    : null

  await db
    .update(shoppingItems)
    .set({
      name: input.name.trim(),
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      note: input.note ?? null,
      categoryId,
      priority: input.priority ?? null,
    })
    .where(
      householdScope(
        shoppingItems,
        input.householdId,
        eq(shoppingItems.id, input.itemId),
      ),
    )
}

/**
 * The dedicated priority sheet (§2.12) sets this independently of the
 * full edit form — a lighter write than routing through `updateItem`.
 */
export async function setItemPriority(
  itemId: string,
  householdId: string,
  priority: ItemPriority | null,
): Promise<void> {
  await db
    .update(shoppingItems)
    .set({ priority })
    .where(
      householdScope(shoppingItems, householdId, eq(shoppingItems.id, itemId)),
    )
}

export async function getItem(
  itemId: string,
  householdId: string,
): Promise<{ name: string } | undefined> {
  const [row] = await db
    .select({ name: shoppingItems.name })
    .from(shoppingItems)
    .where(
      householdScope(shoppingItems, householdId, eq(shoppingItems.id, itemId)),
    )
  return row
}

export async function setItemChecked(
  itemId: string,
  householdId: string,
  checked: boolean,
  actingUserId: string,
): Promise<void> {
  const [item] = await db
    .update(shoppingItems)
    .set({
      isChecked: checked,
      checkedBy: checked ? actingUserId : null,
      checkedAt: checked ? new Date() : null,
    })
    .where(
      householdScope(shoppingItems, householdId, eq(shoppingItems.id, itemId)),
    )
    .returning({ name: shoppingItems.name })
  if (!item || !checked) return

  const nameNormalized = normalizeItemName(item.name)
  await db
    .insert(shoppingItemHistory)
    .values({ householdId, nameNormalized, useCount: 1 })
    .onConflictDoUpdate({
      target: [
        shoppingItemHistory.householdId,
        shoppingItemHistory.nameNormalized,
      ],
      set: {
        lastUsedAt: new Date(),
        useCount: sql`${shoppingItemHistory.useCount} + 1`,
      },
    })
}

export async function removeItem(
  itemId: string,
  householdId: string,
): Promise<void> {
  await deleteItemRecord(itemId, householdId, 'shopping_item')
}

export interface RecentlyBoughtView {
  nameNormalized: string
  lastUsedAt: string
}

/**
 * Recently-bought suggestions, excluding anything already sitting
 * unchecked on the active list (no point suggesting a re-add of an item
 * that's already there to check off).
 */
export async function listRecentlyBought(
  householdId: string,
  listId: string,
  limit = 12,
): Promise<RecentlyBoughtView[]> {
  const activeItems = await db
    .select({ name: shoppingItems.name })
    .from(shoppingItems)
    .where(
      householdScope(
        shoppingItems,
        householdId,
        and(
          eq(shoppingItems.listId, listId),
          eq(shoppingItems.isChecked, false),
        ),
      ),
    )
  const activeNormalized = activeItems.map((i) => normalizeItemName(i.name))

  const rows = await db
    .select({
      nameNormalized: shoppingItemHistory.nameNormalized,
      lastUsedAt: shoppingItemHistory.lastUsedAt,
    })
    .from(shoppingItemHistory)
    .where(
      householdScope(
        shoppingItemHistory,
        householdId,
        activeNormalized.length > 0
          ? notInArray(shoppingItemHistory.nameNormalized, activeNormalized)
          : undefined,
      ),
    )
    .orderBy(desc(shoppingItemHistory.lastUsedAt))
    .limit(limit)

  return rows.map((r) => ({
    nameNormalized: r.nameNormalized,
    lastUsedAt: r.lastUsedAt.toISOString(),
  }))
}
