// Hand-written service worker (§5.7). Deliberately few rules — SW + SSR
// is subtle, and a wrong rule risks serving a stale or, worse, another
// household member's authenticated page (see the M7 offline-caching
// decision in project memory for the full reasoning).
//
// Rules:
//  - cache-first for content-hashed /assets/* (immutable — safe to cache hard)
//  - stale-while-revalidate for GET server-function data reads (/_serverFn/*)
//  - navigations (HTML documents) always hit the network, no caching at
//    all — authenticated-route HTML is never cached, full stop; a cold
//    app-open while offline shows a plain offline page instead of a
//    possibly-stale-or-cross-account cached page
//  - never intercepted: /api/events (SSE — cloning/caching an event
//    stream breaks it), /auth/* (session-mutating), and every non-GET
//    request

const VERSION = 'v2'
const ASSET_CACHE = `doma-assets-${VERSION}`
const DATA_CACHE = `doma-data-${VERSION}`
const OWN_CACHES = [ASSET_CACHE, DATA_CACHE]

const NEVER_INTERCEPT_PREFIXES = ['/api/events', '/auth/']

const OFFLINE_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>doma — offline</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#eadfc6;color:#2a241c;font-family:system-ui,sans-serif">
<div style="max-width:24rem;padding:2rem;text-align:center;background:#faf6ea;border-top:4px solid #a1401a;border-radius:0.85rem;box-shadow:0 8px 20px -6px rgba(74,54,32,0.28)">
<h1 style="margin:0;font-size:1.5rem">The box needs a signal</h1>
<p style="margin-top:0.75rem;color:#6f6353">doma needs a connection to load this page. Reconnect and reload.</p>
</div>
</body>
</html>`

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => !OWN_CACHES.includes(key))
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

// Kill switch (day-one requirement, §5.7): postMessage({type: 'unregister'})
// to a controlled client tears the worker down and clears its caches.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'unregister') {
    event.waitUntil(
      (async () => {
        await Promise.all(OWN_CACHES.map((name) => caches.delete(name)))
        await self.registration.unregister()
      })(),
    )
  }
})

function isNeverIntercepted(pathname) {
  return NEVER_INTERCEPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return // never intercept non-GET

  const url = new URL(request.url)
  if (isNeverIntercepted(url.pathname)) return

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkOnlyWithOfflineFallback(request))
    return
  }

  if (url.pathname.startsWith('/_serverFn/')) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }
})

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function networkOnlyWithOfflineFallback(request) {
  try {
    return await fetch(request)
  } catch {
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'content-type': 'text/html' },
    })
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DATA_CACHE)
  const cached = await cache.match(request)
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)

  if (cached) return cached
  const fresh = await networkFetch
  return fresh ?? new Response('Offline', { status: 503 })
}
