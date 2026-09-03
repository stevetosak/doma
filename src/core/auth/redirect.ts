/**
 * Guards against open-redirect via a `returnTo`/`redirect` query or cookie
 * value: only a root-relative path is trusted. `//evil.com` parses as
 * scheme-relative and would send the browser off-site, so it's refused too.
 */
export function sanitizeRedirectTarget(
  target: string | undefined | null,
): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) {
    return '/'
  }
  return target
}

/**
 * A plain redirect `Response` with mutable headers — unlike
 * `Response.redirect()`, which per the Fetch spec produces a Response
 * whose headers have an "immutable" guard. TanStack Start's response
 * pipeline needs to merge in cookies set imperatively (setCookie /
 * setSessionCookie) earlier in the same handler, which throws
 * `TypeError: immutable` if the handler's returned Response came from
 * `Response.redirect()`. Use this for every redirect that follows a
 * cookie write in the same handler.
 */
export function redirectResponse(url: string | URL, status = 302): Response {
  return new Response(null, { status, headers: { Location: String(url) } })
}
