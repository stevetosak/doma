import { describe, expect, it } from 'vitest'
import { nextThrottleState } from './throttle'

const WINDOW_MS = 60_000
const LIMIT = 5

describe('nextThrottleState', () => {
  it('allows and starts a fresh window on the first request for a key', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const { allowed, next } = nextThrottleState(
      undefined,
      now,
      WINDOW_MS,
      LIMIT,
    )
    expect(allowed).toBe(true)
    expect(next).toEqual({ windowStart: now, count: 1 })
  })

  it('accumulates within the same window', () => {
    const windowStart = new Date('2026-01-01T00:00:00Z')
    const now = new Date(windowStart.getTime() + 10_000)
    const { allowed, next } = nextThrottleState(
      { windowStart, count: 3 },
      now,
      WINDOW_MS,
      LIMIT,
    )
    expect(allowed).toBe(true)
    expect(next).toEqual({ windowStart, count: 4 })
  })

  it('blocks once the count exceeds the limit, within the window', () => {
    const windowStart = new Date('2026-01-01T00:00:00Z')
    const now = new Date(windowStart.getTime() + 10_000)
    const { allowed, next } = nextThrottleState(
      { windowStart, count: LIMIT },
      now,
      WINDOW_MS,
      LIMIT,
    )
    expect(allowed).toBe(false)
    expect(next.count).toBe(LIMIT + 1)
  })

  it('resets once the window has elapsed, even after being blocked', () => {
    const windowStart = new Date('2026-01-01T00:00:00Z')
    const now = new Date(windowStart.getTime() + WINDOW_MS + 1)
    const { allowed, next } = nextThrottleState(
      { windowStart, count: 99 },
      now,
      WINDOW_MS,
      LIMIT,
    )
    expect(allowed).toBe(true)
    expect(next).toEqual({ windowStart: now, count: 1 })
  })

  it('treats a window exactly at the boundary as stale (>=), not still-open', () => {
    const windowStart = new Date('2026-01-01T00:00:00Z')
    const now = new Date(windowStart.getTime() + WINDOW_MS)
    const { next } = nextThrottleState(
      { windowStart, count: 2 },
      now,
      WINDOW_MS,
      LIMIT,
    )
    expect(next).toEqual({ windowStart: now, count: 1 })
  })
})
