import { stillExists } from './existence'
import { findRetryableFailed, markFailed, markSent } from './outbox-repo'
import { getTelegramLink } from './telegram-links-repo'
import { sendTelegramMessage } from './telegram-bot'

/**
 * The 15-minute safety net (§5.5): retries outbox rows that already failed
 * a send, up to a capped attempt count (findRetryableFailed). This is the
 * only thing the sweep does — a reminder that was never scheduled at all
 * (no outbox row exists yet) is instead caught by the next nightly
 * `chores.materialize` run, which re-schedules every still-pending
 * occurrence's reminder unconditionally (safe: see notify()'s dedupe note).
 */
export async function retryFailedNotifications(): Promise<void> {
  const rows = await findRetryableFailed()
  for (const row of rows) {
    const stale = !(await stillExists(
      row.existenceCheckTable && row.existenceCheckId
        ? { table: row.existenceCheckTable, id: row.existenceCheckId }
        : null,
    ))
    if (stale) continue // deleted or replaced since scheduling — leave it 'failed', the attempts cap eventually stops revisiting it

    const link = await getTelegramLink(row.userId)
    if (!link) continue // still not linked — leave it failed, try again next sweep

    try {
      await sendTelegramMessage(link.chatId, `${row.title}\n\n${row.body}`)
      await markSent(row.id)
    } catch (err) {
      console.error('Telegram retry failed:', err)
      await markFailed(row.id, row.attempts + 1)
    }
  }
}
