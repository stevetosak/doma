import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

/**
 * The service worker kill switch (§5.7). Unregisters every controller
 * for this origin and clears the caches it owns — visit this page if a
 * bad `sw.js` version ever needs pulling from a device.
 */
export const Route = createFileRoute('/unregister-sw')({
  component: UnregisterServiceWorker,
})

function UnregisterServiceWorker() {
  const [status, setStatus] = useState<'working' | 'done' | 'unsupported'>(
    'working',
  )

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      setStatus('unsupported')
      return
    }
    void (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const registration of registrations) {
        registration.active?.postMessage({ type: 'unregister' })
        await registration.unregister()
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      }
      setStatus('done')
    })()
  }, [])

  return (
    <div className="p-8 max-w-md">
      <h1 className="text-2xl font-bold">Service worker</h1>
      {status === 'working' && <p className="mt-4">Removing…</p>}
      {status === 'done' && (
        <p className="mt-4">
          Done — the service worker and its caches are removed. Reload the app
          to fetch a fresh copy.
        </p>
      )}
      {status === 'unsupported' && (
        <p className="mt-4">
          This browser doesn't support service workers — nothing to remove.
        </p>
      )}
    </div>
  )
}
