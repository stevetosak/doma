import { getBoss } from './boss'
import {
  CHORES_MATERIALIZE_QUEUE,
  NOTIFY_DISPATCH_QUEUE,
  NOTIFY_RETRY_FAILED_QUEUE,
} from './queue-names'
import { dispatchNotification } from '#/core/notify/dispatch'
import { retryFailedNotifications } from '#/core/notify/sweep'
import {
  configureTelegramWebhookIfNeeded,
  startTelegramPollingIfEnabled,
} from '#/core/notify/telegram-bot'
import { materializeAllHouseholds } from '#/modules/chores/jobs'
import type { NotifyJobData } from '#/core/notify/notify'

let started = false

/**
 * Registers every pg-boss queue/worker/schedule and starts Telegram
 * long-polling if the dev flag is set (§5.5, §7 M8). Single-replica only
 * (the k8s overlay runs `replicas: 1`, same assumption src/core/events/hub
 * already makes) — called once from src/start.ts, whose module is
 * evaluated exactly once when the server process boots.
 */
export async function startBackgroundJobs(): Promise<void> {
  if (started) return
  started = true

  try {
    const boss = await getBoss()

    // dispatchNotification never throws on a send failure (it marks the
    // outbox row 'failed' and returns) — retries are entirely the 15-minute
    // sweep's job (sweep.ts), not pg-boss's, since a pg-boss retry would
    // just re-run dispatchNotification, find the dedupe_key already
    // claimed, and no-op. No retryLimit/retryBackoff here on purpose.
    await boss.createQueue(NOTIFY_DISPATCH_QUEUE)
    await boss.work<NotifyJobData>(NOTIFY_DISPATCH_QUEUE, async (jobs) => {
      for (const job of jobs) {
        await dispatchNotification(job.data)
      }
    })

    await boss.createQueue(NOTIFY_RETRY_FAILED_QUEUE, { retryLimit: 1 })
    await boss.work(NOTIFY_RETRY_FAILED_QUEUE, async () => {
      await retryFailedNotifications()
    })
    await boss.schedule(NOTIFY_RETRY_FAILED_QUEUE, '*/15 * * * *')

    await boss.createQueue(CHORES_MATERIALIZE_QUEUE, { retryLimit: 1 })
    await boss.work(CHORES_MATERIALIZE_QUEUE, async () => {
      await materializeAllHouseholds()
    })
    await boss.schedule(CHORES_MATERIALIZE_QUEUE, '0 3 * * *')

    startTelegramPollingIfEnabled()
    // Isolated from the try/catch below on purpose — a webhook
    // registration hiccup shouldn't be treated as "background jobs failed
    // to start" (it doesn't retry startBackgroundJobs itself).
    configureTelegramWebhookIfNeeded().catch((err) => {
      console.error('Failed to configure Telegram webhook:', err)
    })
  } catch (err) {
    console.error('Failed to start background jobs:', err)
    started = false
  }
}
