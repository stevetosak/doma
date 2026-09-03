import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000

/**
 * The focal moment (§3 of the direction brief): a live update arriving
 * from the other person settles in with an unhurried, disciplined cascade
 * — never an abrupt snap. Backed by the View Transitions API where the
 * browser supports it; falls straight through to a plain invalidate
 * otherwise (and respects prefers-reduced-motion, since a view transition
 * still runs a snapshot crossfade the browser doesn't itself suppress).
 */
function settledInvalidate(router: ReturnType<typeof useRouter>) {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (
    prefersReducedMotion ||
    typeof document === 'undefined' ||
    !('startViewTransition' in document)
  ) {
    void router.invalidate({ sync: true })
    return
  }

  document.startViewTransition(async () => {
    await router.invalidate({ sync: true })
  })
}

/**
 * Subscribes to `/api/events` for as long as the calling component is
 * mounted, invalidating the router (§5.6 — plain `router.invalidate()`,
 * not TanStack Query key targeting; see the M7 architecture decision in
 * project memory for why) on every event. Hand-rolled reconnect with
 * exponential backoff — native `EventSource` retries on its own, but at
 * a fixed short delay with no backoff, which the plan explicitly calls
 * for.
 */
export function useLiveSync(): void {
  const router = useRouter()

  useEffect(() => {
    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let reconnectDelay = RECONNECT_BASE_MS
    let stopped = false

    function connect() {
      if (stopped) return
      source = new EventSource('/api/events')

      source.onopen = () => {
        reconnectDelay = RECONNECT_BASE_MS
      }

      source.onmessage = () => {
        settledInvalidate(router)
      }

      source.onerror = () => {
        source?.close()
        source = null
        if (stopped) return
        reconnectTimer = setTimeout(connect, reconnectDelay)
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
      }
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      source?.close()
    }
  }, [router])
}
