// Hand-written service worker (§5.7). Deliberately few rules — SW + SSR
// is subtle, and a wrong rule risks serving a stale or, worse, another
// household member's authenticated page (see the M7 offline-caching
// decision in project memory for the full reasoning).
//
// Rules:
//  - cache-first for content-hashed /assets/* (immutable — safe to cache hard)
//  - network-first (falling back to the cache only when the network fails)
//    for GET server-function data reads (/_serverFn/*) — these back the
//    app's own auth/session and list state, so a client that's online
//    must always see the current answer (stale-while-revalidate served a
//    round-trip-old cached response first, which read as "have to
//    refresh to see it" after sign-in or after any list mutation); the
//    cache fallback keeps last-known reads working while offline
//  - navigations (HTML documents) always hit the network, no caching at
//    all — authenticated-route HTML is never cached, full stop; a cold
//    app-open while offline shows a plain offline page instead of a
//    possibly-stale-or-cross-account cached page
//  - never intercepted: /api/events (SSE — cloning/caching an event
//    stream breaks it), /auth/* (session-mutating), and every non-GET
//    request

const VERSION = 'v4'
const ASSET_CACHE = `doma-assets-${VERSION}`
const DATA_CACHE = `doma-data-${VERSION}`
const OWN_CACHES = [ASSET_CACHE, DATA_CACHE]

const NEVER_INTERCEPT_PREFIXES = ['/api/events', '/auth/']

const OFFLINE_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>doma — offline</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#e9e4d8;color:#1d2320;font-family:system-ui,sans-serif">
<div style="max-width:24rem;padding:2rem;text-align:center;background:#f6f3ec;border-top:4px solid #8c2f24;border-radius:18px;box-shadow:0 10px 26px -12px rgb(29 35 32 / 0.35)">
<svg width="52" height="52" viewBox="0 0 64 64" style="margin-bottom:0.75rem" aria-hidden="true"><path d="M9 34 L32 13 L55 34" fill="none" stroke="#1d2320" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="25" cy="47" r="9.5" fill="#1d2320"/><circle cx="39" cy="47" r="9.5" fill="#8c2f24"/></svg>
<h1 style="margin:0;font-size:1.5rem">No connection</h1>
<p style="margin-top:0.75rem;color:#6f6a5f">doma needs a connection to load this page. Reconnect and reload.</p>
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
    event.respondWith(networkFirst(request))
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

async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    const cached = await cache.match(request)
    return cached ?? new Response('Offline', { status: 503 })
  }
}
