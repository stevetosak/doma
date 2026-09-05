import { createCsrfMiddleware, createStart } from '@tanstack/react-start'
import { optionalEnv } from '#/core/env'

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
 *
 * Also excludes the Telegram webhook route: it's a legitimate external
 * POST from Telegram's own servers, not a browser, so it carries no
 * Sec-Fetch-Site/Origin/Referer at all — this middleware's default-deny
 * on "none of the above present" was 403ing every single update Telegram
 * tried to deliver (confirmed via getWebhookInfo's
 * "Wrong response from the webhook: 403 Forbidden"). That route already
 * authenticates the caller properly via the X-Telegram-Bot-Api-Secret-Token
 * header (grammy's webhookCallback, see telegram-bot.ts) — same-origin
 * CSRF just isn't the right check for a server-to-server webhook.
 */
const csrfMiddleware = createCsrfMiddleware({
  origin: optionalEnv('APP_ORIGIN', 'http://localhost:3000'),
  filter: ({ request }) =>
    request.method !== 'GET' &&
    request.method !== 'HEAD' &&
    new URL(request.url).pathname !== '/api/telegram/webhook',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}))

// Fire-and-forget: this module is evaluated once when the server process
// boots (same lifetime as csrfMiddleware above), so this is the app's one
// startup hook for pg-boss (§5.5, M8). Errors are logged inside
// startBackgroundJobs rather than thrown — a jobs-layer outage shouldn't
// take the HTTP server down with it.
//
// `start.ts` itself is shared into the CLIENT bundle too (TanStack Start
// needs requestMiddleware config there), so this must stay a dynamic
// import gated on import.meta.env.SSR rather than a static top-level
// import. import.meta.env.SSR is statically replaced per Vite build
// target, so Rollup drops this whole branch — and therefore pg-boss and
// grammy — from the client bundle instead of merely skipping it at
// runtime. A static import here previously shipped both into the browser,
// where `new PgBoss()`/`new Bot()` (Node-only) crashed on load.
if (import.meta.env.SSR) {
  void import('#/core/jobs/bootstrap').then(({ startBackgroundJobs }) =>
    startBackgroundJobs(),
  )
}
