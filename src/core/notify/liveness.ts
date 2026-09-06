import { eq } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { choreOccurrences } from '#/modules/chores/schema'
import { shoppingItems } from '#/modules/shopping/schema'

/**
 * Is the thing a reminder is *about* still actionable — not just whether
 * the reminder definition exists (existence.ts), but whether marking it
 * done anywhere (the app, or Telegram's mark-done button) should stop
 * further reminders about it. Keyed by `notifications.kind`, same small
 * lookup-table style as existence.ts's old CHECKS map. Both 'chore_reminder'
 * and 'shopping_item_reminder' are registered below.
 */
const LIVENESS: Record<string, (subjectId: string) => Promise<boolean>> = {
  chore_reminder: async (occurrenceId) => {
    const [occ] = await db
      .select({ status: choreOccurrences.status })
      .from(choreOccurrences)
      .where(eq(choreOccurrences.id, occurrenceId))
    return occ?.status === 'pending'
  },
  shopping_item_reminder: async (itemId) => {
    const [item] = await db
      .select({ isChecked: shoppingItems.isChecked })
      .from(shoppingItems)
      .where(eq(shoppingItems.id, itemId))
    return item ? !item.isChecked : false
  },
}

/** True if there's no registered check for this kind, or the check passes. */
export async function isStillLive(
  kind: string,
  subjectId: string,
): Promise<boolean> {
  const fn = LIVENESS[kind]
  return fn ? fn(subjectId) : true
}
