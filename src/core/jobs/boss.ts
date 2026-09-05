import { PgBoss } from 'pg-boss'
import { requireEnv } from '#/core/env'

/**
 * pg-boss on the same Postgres (§5.5) — the shared cluster Redis is
 * cache-only so it can't be a queue of record, and a durable Postgres queue
 * needs no extra infrastructure. Lazily started, memoized so every caller
 * in this process shares one instance and one `start()` call.
 */
let bossPromise: Promise<PgBoss> | undefined

export function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const boss = new PgBoss(requireEnv('DATABASE_URL'))
      boss.on('error', (err) => console.error('pg-boss error:', err))
      await boss.start()
      return boss
    })()
  }
  return bossPromise
}
