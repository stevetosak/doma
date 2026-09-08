import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  notInArray,
  sql,
} from 'drizzle-orm'
import { db } from '#/core/db/client'
import { householdScope } from '#/core/db/household-scope'
import { createItemRecord, deleteItemRecord } from '#/core/items/repo'
import { reminders } from '#/core/items/schema'
import { normalizeItemName } from './list-logic'
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

/**
 * Create a category, or return the existing one if the exact trimmed name
 * is already taken. Idempotent so a "+ New category" click that repeats a
 * name is a harmless no-op.
 */
export async function createCategory(
  householdId: string,
  name: string,
): Promise<{ id: string }> {
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
  if (existing) return { id: existing.id }

  const categories = await listCategories(householdId)
  const nextSort =
    categories.length > 0 ? Math.max(...categories.map((c) => c.sort)) + 1 : 0
  const [created] = await db
    .insert(shoppingCategories)
    .values({ householdId, name: trimmed, sort: nextSort })
    .returning({ id: shoppingCategories.id })
  if (!created) throw new Error('Insert did not return a row')
  return { id: created.id }
}

/**
 * Rename a category. Rejects a collision with another category's exact
 * name — a merge would look right on screen but not in the data.
 */
export async function renameCategory(
  householdId: string,
  categoryId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Category name cannot be empty')
  const [clash] = await db
    .select({ id: shoppingCategories.id })
    .from(shoppingCategories)
    .where(
      householdScope(
        shoppingCategories,
        householdId,
        and(
          eq(shoppingCategories.name, trimmed),
          ne(shoppingCategories.id, categoryId),
        ),
      ),
    )
    .limit(1)
  if (clash) throw new Error('A category with that name already exists.')
  await db
    .update(shoppingCategories)
    .set({ name: trimmed })
    .where(
      householdScope(
        shoppingCategories,
        householdId,
        eq(shoppingCategories.id, categoryId),
      ),
    )
}

/**
 * Delete a category. Its items fall to the uncategorized bucket via the
 * column's `onDelete: 'set null'` FK; they keep their old per-category
 * `sort`, which can now collide, so renumber the bucket. v1 has one list
 * per household, so household scope is enough here.
 */
export async function deleteCategory(
  householdId: string,
  categoryId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(shoppingCategories)
      .where(
        householdScope(
          shoppingCategories,
          householdId,
          eq(shoppingCategories.id, categoryId),
        ),
      )
    const rows = await tx
      .select({ id: shoppingItems.id })
      .from(shoppingItems)
      .where(
        householdScope(
          shoppingItems,
          householdId,
          and(
            isNull(shoppingItems.categoryId),
            eq(shoppingItems.isChecked, false),
          ),
        ),
      )
      .orderBy(asc(shoppingItems.sort), asc(shoppingItems.createdAt))
    for (const [index, row] of rows.entries()) {
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
  })
}

export async function reorderCategories(
  householdId: string,
  orderedIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: shoppingCategories.id })
      .from(shoppingCategories)
      .where(householdScope(shoppingCategories, householdId))
    const existingIds = new Set(existing.map((c) => c.id))
    if (
      existingIds.size !== orderedIds.length ||
      !orderedIds.every((id) => existingIds.has(id))
    ) {
      throw new Error('orderedIds does not match this household')
    }
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(shoppingCategories)
        .set({ sort: index })
        .where(
          householdScope(
            shoppingCategories,
            householdId,
            eq(shoppingCategories.id, id),
          ),
        )
    }
  })
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
  priority?: ItemPriority
  addedBy: string
}

export async function addItem(input: AddItemInput): Promise<string> {
  return createItemRecord(
    input.householdId,
    'shopping_item',
    async (tx, id) => {
      const [maxRow] = await tx
        .select({
          max: sql<number>`coalesce(max(${shoppingItems.sort}), -1)`,
        })
        .from(shoppingItems)
        .where(
          householdScope(
            shoppingItems,
            input.householdId,
            and(
              eq(shoppingItems.listId, input.listId),
              isNull(shoppingItems.categoryId),
              eq(shoppingItems.isChecked, false),
            ),
          ),
        )
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
          categoryId: null,
          priority: input.priority ?? null,
          sort: (maxRow?.max ?? -1) + 1,
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
  priority?: ItemPriority
}

export async function updateItem(input: UpdateItemInput): Promise<void> {
  await db
    .update(shoppingItems)
    .set({
      name: input.name.trim(),
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      note: input.note ?? null,
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
