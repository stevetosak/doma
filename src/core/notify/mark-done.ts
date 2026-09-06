import { eq } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { setOccurrenceStatus } from '#/modules/chores/repo'
import { setItemChecked } from '#/modules/shopping/repo'
import { isStillLive } from './liveness'
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
 * recipient — the caller restricts this to private chats first (a
 * private chat's id is the same as its one member's Telegram user id),
 * so "the linked chat" and "the presser" are the same person. Idempotent:
 * skips the write entirely if the subject is no longer live (already
 * done/checked, e.g. from a Telegram redelivery or a double-tap) rather
 * than re-running a non-idempotent update. Returns 'skipped' for any
 * no-op case (unknown notification, wrong chat, unrecognized kind,
 * already done) — the caller uses this only to decide what to tell the
 * button presser, never to distinguish "unauthorized" from "already
 * done" in the response itself (no information leak either way).
 */
export async function handleMarkDoneCallback(
  notificationId: string,
  chatId: string,
): Promise<'completed' | 'skipped'> {
  const [notification] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, notificationId))
  if (!notification) return 'skipped'

  const link = await getLinkByChatId(chatId)
  if (!link || link.userId !== notification.userId) return 'skipped'

  const complete = COMPLETIONS[notification.kind]
  if (!complete) return 'skipped'

  if (!(await isStillLive(notification.kind, notification.subjectId))) {
    return 'skipped'
  }

  await complete(
    notification.subjectId,
    notification.householdId,
    notification.userId,
  )
  return 'completed'
}
