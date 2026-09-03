/**
 * Fixed-window rate limiting for register/login, keyed by `email:<addr>`
 * and `ip:<addr>` (§5.4). Pure decision logic — the DB read/write around it
 * lives in throttle-repo.ts.
 */

export interface ThrottleWindow {
  windowStart: Date
  count: number
}

export interface ThrottleDecision {
  allowed: boolean
  next: ThrottleWindow
}

/**
 * Given the current window for a key (or none, if this is its first
 * request ever) decide whether this request is allowed, and what the
 * window should be persisted as afterward. A stale window (older than
 * `windowMs`) resets rather than accumulating forever.
 */
export function nextThrottleState(
  current: ThrottleWindow | undefined,
  now: Date,
  windowMs: number,
  limit: number,
): ThrottleDecision {
  const windowIsStale =
    !current || now.getTime() - current.windowStart.getTime() >= windowMs

  const next: ThrottleWindow = windowIsStale
    ? { windowStart: now, count: 1 }
    : { windowStart: current.windowStart, count: current.count + 1 }

  return { allowed: next.count <= limit, next }
}
