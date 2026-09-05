import { eq } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { reminders } from '#/core/items/schema'

/** True if there's nothing to check, or the reminder still exists. */
export async function stillExists(
  reminderId: string | null | undefined,
): Promise<boolean> {
  if (!reminderId) return true
  const [row] = await db
    .select({ id: reminders.id })
    .from(reminders)
    .where(eq(reminders.id, reminderId))
  return Boolean(row)
}
