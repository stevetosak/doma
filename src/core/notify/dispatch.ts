import { claimOutboxRow, markFailed, markSent } from './outbox-repo'
import { getTelegramLink } from './telegram-links-repo'
import { sendTelegramMessage } from './telegram-bot'
import type { NotifyJobData } from './notify'

/**
 * The `notify.dispatch` job handler (registered in
 * src/core/jobs/bootstrap.ts) and the entry point the 15-minute sweep
 * (sweep.ts) shares its claim step with.
 */
export async function dispatchNotification(data: NotifyJobData): Promise<void> {
  const link = await getTelegramLink(data.userId)
  if (!link) {
    // No channel to send through yet. Deliberately don't claim the outbox
    // row here — if they link Telegram later, the next time this
    // dedupeKey is scheduled (chores' nightly materialize re-runs this for
    // every still-pending occurrence) it'll go through normally.
    return
  }

  const claimed = await claimOutboxRow({
    householdId: data.householdId,
    userId: data.userId,
    moduleId: data.moduleId,
    kind: data.kind,
    subjectId: data.subjectId,
    title: data.title,
    body: data.body,
    deepLink: data.deepLink,
    scheduledFor: new Date(data.at),
    dedupeKey: data.dedupeKey,
  })
  if (!claimed) return // already sent, already failed-and-tracked, or in flight elsewhere

  try {
    await sendTelegramMessage(link.chatId, `${data.title}\n\n${data.body}`)
    await markSent(claimed.id)
  } catch (err) {
    console.error('Telegram send failed:', err)
    await markFailed(claimed.id, 1)
  }
}
