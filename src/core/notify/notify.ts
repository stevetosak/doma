import { getBoss } from '#/core/jobs/boss'
import { NOTIFY_DISPATCH_QUEUE } from '#/core/jobs/queue-names'

export interface NotifyInput {
  householdId: string
  userId: string
  moduleId: string
  kind: string
  subjectId: string
  title: string
  body: string
  deepLink: string
  /** When to send. Past-due is fine — pg-boss makes it immediately eligible. */
  at: Date
  /** UNIQUE across `notifications` — see outbox-repo.ts's claimOutboxRow. */
  dedupeKey: string
  /**
   * If set, dispatch and the retry sweep re-verify this row still exists
   * before sending (existence.ts) — a job whose backing row was deleted
   * or replaced (e.g. a chore reminder that was edited or removed) since
   * this was scheduled is silently dropped instead of sent. Omit for a
   * notification with nothing that can go stale.
   */
  existenceCheck?: { table: string; id: string }
}

/** What the `notify.dispatch` job handler (dispatch.ts) actually receives. */
export interface NotifyJobData {
  householdId: string
  userId: string
  moduleId: string
  kind: string
  subjectId: string
  title: string
  body: string
  deepLink: string
  at: string
  dedupeKey: string
  existenceCheck?: { table: string; id: string }
}

/**
 * The one entry point any module uses to reach Telegram (§5.5) — a module
 * never touches the bot or the outbox directly. Safe to call repeatedly for
 * the same `dedupeKey` (e.g. a re-run of nightly chore materialization):
 * `singletonKey` is a best-effort hint to pg-boss to avoid piling up
 * redundant queued jobs, but the outbox's UNIQUE `dedupe_key` (dispatch.ts)
 * is the actual exactly-once guarantee, so duplicate scheduling here is
 * harmless either way.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const boss = await getBoss()
  const data: NotifyJobData = {
    householdId: input.householdId,
    userId: input.userId,
    moduleId: input.moduleId,
    kind: input.kind,
    subjectId: input.subjectId,
    title: input.title,
    body: input.body,
    deepLink: input.deepLink,
    at: input.at.toISOString(),
    dedupeKey: input.dedupeKey,
    existenceCheck: input.existenceCheck,
  }
  await boss.send(NOTIFY_DISPATCH_QUEUE, data, {
    startAfter: input.at,
    singletonKey: input.dedupeKey,
  })
}
