import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000

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
        void router.invalidate({ sync: true })
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
