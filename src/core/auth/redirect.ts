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
