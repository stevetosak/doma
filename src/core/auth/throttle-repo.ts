import { eq } from 'drizzle-orm'
import { authThrottle } from '#/core/auth/schema'
import { db } from '#/core/db/client'
import { nextThrottleState } from '#/core/auth/throttle'

/**
 * Read-decide-write against auth_throttle. Not perfectly atomic under
 * concurrent requests for the same key, but doma has at most a couple of
 * real users hammering login/register at once — the fixed-window
 * approximation this buys is worth the simplicity over a stored procedure
 * or SELECT ... FOR UPDATE.
 */
export async function checkThrottle(
  key: string,
  windowMs: number,
  limit: number,
): Promise<boolean> {
  const now = new Date()
  const rows = await db
    .select()
    .from(authThrottle)
    .where(eq(authThrottle.key, key))
    .limit(1)
  const current = rows[0]

  const { allowed, next } = nextThrottleState(
    current
      ? { windowStart: current.windowStart, count: current.count }
      : undefined,
    now,
    windowMs,
    limit,
  )

  await db
    .insert(authThrottle)
    .values({ key, windowStart: next.windowStart, count: next.count })
    .onConflictDoUpdate({
      target: authThrottle.key,
      set: { windowStart: next.windowStart, count: next.count },
    })

  return allowed
}
