import { createCsrfMiddleware, createStart } from '@tanstack/react-start'
import { optionalEnv } from '#/core/env'
import { startBackgroundJobs } from '#/core/jobs/bootstrap'

/**
 * Global request middleware. The CSRF/Origin check here is the "belt" to
 * SameSite=Lax's "braces" (§5.4) — framework-native rather than a
 * hand-rolled Origin comparison, since it already covers Sec-Fetch-Site
 * and Referer fallback too.
 *
 * Scoped to unsafe methods only. Without the filter, this validates every
 * GET too — including the very first page load: a real browser's initial
 * direct navigation (typed URL, bookmark, external link) sends
 * `Sec-Fetch-Site: none`, which doesn't match the default `same-origin`
 * allowlist, so the whole app 403s before a session even exists. GET/HEAD
 * are safe methods with no state-changing effect, so there's nothing for
 * CSRF to protect there.
 */
const csrfMiddleware = createCsrfMiddleware({
  origin: optionalEnv('APP_ORIGIN', 'http://localhost:3000'),
  filter: ({ request }) =>
    request.method !== 'GET' && request.method !== 'HEAD',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}))

// Fire-and-forget: this module is evaluated once when the server process
// boots (same lifetime as csrfMiddleware above), so this is the app's one
// startup hook for pg-boss (§5.5, M8). Errors are logged inside
// startBackgroundJobs rather than thrown — a jobs-layer outage shouldn't
// take the HTTP server down with it.
void startBackgroundJobs()
