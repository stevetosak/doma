import { and, eq, lt } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { notifications } from './schema'

const MAX_RETRY_ATTEMPTS = 8

export interface NewOutboxRow {
  householdId: string
  userId: string
  moduleId: string
  kind: string
  subjectId: string
  title: string
  body: string
  deepLink: string
  scheduledFor: Date
  dedupeKey: string
}

/**
 * The exactly-once claim (§5.5): the caller only proceeds to actually send
 * once this returns a row. `dedupeKey`'s UNIQUE constraint means at most one
 * caller across any number of concurrent attempts (a deferred job, the
 * retry sweep, a re-run of chore materialization) ever gets one back for a
 * given key.
 */
export async function claimOutboxRow(
  input: NewOutboxRow,
): Promise<{ id: string } | null> {
  const [row] = await db
    .insert(notifications)
    .values({ ...input, status: 'pending' })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id })
  return row ?? null
}

export async function markSent(id: string): Promise<void> {
  await db
    .update(notifications)
    .set({ status: 'sent', sentAt: new Date() })
    .where(eq(notifications.id, id))
}

export async function markFailed(id: string, attempts: number): Promise<void> {
  await db
    .update(notifications)
    .set({ status: 'failed', attempts })
    .where(eq(notifications.id, id))
}

export interface RetryableOutboxRow {
  id: string
  userId: string
  title: string
  body: string
  attempts: number
}

/**
 * The 15-minute sweep's retry set (§5.5's "safety net"): rows that already
 * failed at least once and haven't exhausted their attempt budget. Capped
 * so a permanently-unreachable chat (e.g. the user blocked the bot) doesn't
 * retry forever.
 */
export async function findRetryableFailed(): Promise<RetryableOutboxRow[]> {
  return db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      title: notifications.title,
      body: notifications.body,
      attempts: notifications.attempts,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.status, 'failed'),
        lt(notifications.attempts, MAX_RETRY_ATTEMPTS),
      ),
    )
}
