import { eq } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { setOccurrenceStatus } from '#/modules/chores/repo'
import { setItemChecked } from '#/modules/shopping/repo'
import { getLinkByChatId } from './telegram-links-repo'
import { notifications } from './schema'

/**
 * Same small lookup-table style as existence.ts/liveness.ts, keyed by
 * notifications.kind — what "mark done" means differs per module (a
 * chore occurrence's status vs a shopping item's checked flag).
 */
const COMPLETIONS: Record<
  string,
  (subjectId: string, householdId: string, userId: string) => Promise<void>
> = {
  chore_reminder: (occurrenceId, householdId, userId) =>
    setOccurrenceStatus(occurrenceId, householdId, 'done', userId),
  shopping_item_reminder: (itemId, householdId, userId) =>
    setItemChecked(itemId, householdId, true, userId),
}

/**
 * Handles a "✅ Mark done" button press. Authorizes by confirming the
 * pressing chat is the exact one linked to this notification's own
 * recipient — a forged callback_data can't act on someone else's
 * reminder. Silently no-ops on any mismatch (unknown notification, wrong
 * chat, unrecognized kind) rather than surfacing an error to the button
 * presser — there's nothing actionable they could do about it.
 */
export async function handleMarkDoneCallback(
  notificationId: string,
  chatId: string,
): Promise<void> {
  const [notification] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, notificationId))
  if (!notification) return

  const link = await getLinkByChatId(chatId)
  if (!link || link.userId !== notification.userId) return

  const complete = COMPLETIONS[notification.kind]
  if (!complete) return
  await complete(
    notification.subjectId,
    notification.householdId,
    notification.userId,
  )
}
