import { and, asc, desc, eq, notInArray, sql } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { householdScope } from '#/core/db/household-scope'
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

export interface ItemView {
  id: string
  name: string
  quantity: number | null
  unit: string | null
  note: string | null
  categoryId: string | null
  isChecked: boolean
  addedBy: string | null
}

export async function listItems(
  householdId: string,
  listId: string,
): Promise<ItemView[]> {
  return db
    .select({
      id: shoppingItems.id,
      name: shoppingItems.name,
      quantity: shoppingItems.quantity,
      unit: shoppingItems.unit,
      note: shoppingItems.note,
      categoryId: shoppingItems.categoryId,
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
    .orderBy(asc(shoppingItems.createdAt))
}

export interface AddItemInput {
  householdId: string
  listId: string
  name: string
  quantity?: number
  unit?: string
  note?: string
  categoryName?: string
  addedBy: string
}

export async function addItem(input: AddItemInput): Promise<string> {
  const categoryId = input.categoryName
    ? await getOrCreateCategory(input.householdId, input.categoryName)
    : null

  const [row] = await db
    .insert(shoppingItems)
    .values({
      householdId: input.householdId,
      listId: input.listId,
      name: input.name.trim(),
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      note: input.note ?? null,
      categoryId,
      addedBy: input.addedBy,
    })
    .returning({ id: shoppingItems.id })
  if (!row) throw new Error('Insert did not return a row')
  return row.id
}

export interface UpdateItemInput {
  householdId: string
  itemId: string
  name: string
  quantity?: number
  unit?: string
  note?: string
  categoryName?: string
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
    })
    .where(
      householdScope(
        shoppingItems,
        input.householdId,
        eq(shoppingItems.id, input.itemId),
      ),
    )
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
  await db
    .delete(shoppingItems)
    .where(
      householdScope(shoppingItems, householdId, eq(shoppingItems.id, itemId)),
    )
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
