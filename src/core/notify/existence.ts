import { eq } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { reminders } from '#/core/items/schema'

/**
 * Per-table existence checks a notify() caller can attach via
 * existenceCheck (see notify.ts). Now that every reminder definition
 * lives in the one shared `reminders` table (M9), there's only ever one
 * underlying table — this stays a lookup keyed by table name (rather than
 * an unconditional single query) only because notify.ts's public shape
 * hasn't changed yet, and because in-flight jobs from before this
 * migration still carry the old table name; Phase 2 drops the table
 * discriminator entirely.
 */
const checkReminderExists = async (id: string) => {
  const [row] = await db
    .select({ id: reminders.id })
    .from(reminders)
    .where(eq(reminders.id, id))
  return Boolean(row)
}

const CHECKS: Record<string, (id: string) => Promise<boolean>> = {
  reminders: checkReminderExists,
  // Legacy key: pg-boss jobs and notifications rows scheduled before this
  // migration deployed still carry the old table name in their stored
  // existenceCheck payload. The migration preserved reminder ids exactly
  // when backfilling from chore_reminders, so they resolve correctly
  // against the same `reminders` table via this alias. Safe to drop once
  // the pre-migration queue has fully drained (a later phase removes this
  // whole table-keyed map anyway).
  chore_reminders: checkReminderExists,
}

/** True if there's nothing to check, or the checked row still exists. */
export async function stillExists(
  check: { table: string; id: string } | null | undefined,
): Promise<boolean> {
  if (!check) return true
  const fn = CHECKS[check.table]
  return fn ? fn(check.id) : true
}
