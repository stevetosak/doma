import { useEffect } from 'react'

/**
 * Registers public/sw.js once, client-side only. Rendered once from the
 * root shell. The kill switch is `/unregister-sw` (§5.7) — a route users
 * can be pointed to if a bad service worker version ever needs pulling.
 */
export function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }
    navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
      console.error('Service worker registration failed:', err)
    })
  }, [])

  return null
}
