import { eq } from 'drizzle-orm'
import { db } from '#/core/db/client'
import type { Transaction } from '#/core/db/client'
import { householdScope } from '#/core/db/household-scope'
import { items, reminders } from './schema'

/**
 * The only way to create a polymorphic item (§ data model in the M9 spec):
 * the module's own row insert only ever happens inside `insertRecord`, so
 * there's no code path that creates a chore/shopping-item row without also
 * creating its `items` row — a structural guarantee, not just the DB's FK.
 */
export async function createItemRecord<T>(
  householdId: string,
  itemType: string,
  insertRecord: (tx: Transaction, itemId: string) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(items)
      .values({ householdId, itemType })
      .returning({ id: items.id })
    if (!row) throw new Error('Insert did not return a row')
    return insertRecord(tx, row.id)
  })
}

/**
 * The only way to remove a polymorphic item — cascades to the module row
 * (chores.id/shopping_items.id both reference items.id ON DELETE CASCADE)
 * and any reminders in one statement.
 */
export async function deleteItemRecord(
  itemId: string,
  householdId: string,
): Promise<void> {
  await db
    .delete(items)
    .where(householdScope(items, householdId, eq(items.id, itemId)))
}

export interface ReminderInput {
  offsetDays?: number
  hour?: number
  minute?: number
  fireAt?: Date
}

export interface ReminderRow {
  id: string
  offsetDays: number | null
  hour: number | null
  minute: number | null
  fireAt: Date | null
}

/**
 * Wipe-and-recreate, matching the chores-only version this replaces
 * (replaceChoreReminders) — the caller always submits the whole desired
 * set in one shot. Transactional so a failed insert never leaves an
 * item's reminders deleted-but-not-replaced. Callers pass only the fields
 * for their own mode (relative or absolute) — the rest default to null,
 * which is what the DB's CHECK constraint requires.
 */
export async function replaceRemindersForItem(
  itemId: string,
  householdId: string,
  rows: ReminderInput[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(reminders)
      .where(householdScope(reminders, householdId, eq(reminders.itemId, itemId)))
    if (rows.length === 0) return
    await tx.insert(reminders).values(
      rows.map((r) => ({
        householdId,
        itemId,
        offsetDays: r.offsetDays ?? null,
        hour: r.hour ?? null,
        minute: r.minute ?? null,
        fireAt: r.fireAt ?? null,
      })),
    )
  })
}

export async function listRemindersForItem(
  itemId: string,
  householdId: string,
): Promise<ReminderRow[]> {
  return db
    .select({
      id: reminders.id,
      offsetDays: reminders.offsetDays,
      hour: reminders.hour,
      minute: reminders.minute,
      fireAt: reminders.fireAt,
    })
    .from(reminders)
    .where(householdScope(reminders, householdId, eq(reminders.itemId, itemId)))
    .orderBy(reminders.offsetDays, reminders.hour, reminders.minute, reminders.fireAt)
}
