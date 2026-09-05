import { eq } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { choreReminders } from '#/modules/chores/schema'

/**
 * Per-table existence checks a notify() caller can attach via
 * existenceCheck (see notify.ts). Deliberately a small lookup table, not a
 * generic registry — chores is the only consumer today; extend this if a
 * second module needs the same capability.
 */
const CHECKS: Record<string, (id: string) => Promise<boolean>> = {
  chore_reminders: async (id) => {
    const [row] = await db
      .select({ id: choreReminders.id })
      .from(choreReminders)
      .where(eq(choreReminders.id, id))
    return Boolean(row)
  },
}

/** True if there's nothing to check, or the checked row still exists. */
export async function stillExists(
  check: { table: string; id: string } | null | undefined,
): Promise<boolean> {
  if (!check) return true
  const fn = CHECKS[check.table]
  return fn ? fn(check.id) : true
}
