import { eq } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { reminders } from '#/core/items/schema'

/**
 * Per-table existence checks a notify() caller can attach via
 * existenceCheck (see notify.ts). Now that every reminder definition
 * lives in the one shared `reminders` table (M9), there's only ever one
 * possible table — this stays a lookup keyed by table name (rather than
 * an unconditional single query) only because notify.ts's public shape
 * hasn't changed yet; Phase 2 drops the table discriminator entirely.
 */
const CHECKS: Record<string, (id: string) => Promise<boolean>> = {
  reminders: async (id) => {
    const [row] = await db.select({ id: reminders.id }).from(reminders).where(eq(reminders.id, id))
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
