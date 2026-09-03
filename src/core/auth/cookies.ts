import {
  deleteCookie,
  getCookie,
  setCookie,
} from '@tanstack/react-start/server'
import { SESSION_COOKIE_NAME } from '#/core/auth/session'

/**
 * Session cookie flags per §5.4: HttpOnly, Secure, SameSite=Lax, Path=/.
 * `Secure` over `http://localhost` still works in Chrome/Chromium, which
 * treats localhost as a secure context — this has held true for other
 * doma-adjacent projects on this same dev setup.
 */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
}

export function setSessionCookie(token: string, expiresAt: Date): void {
  setCookie(SESSION_COOKIE_NAME, token, {
    ...COOKIE_OPTIONS,
    expires: expiresAt,
  })
}

export function clearSessionCookie(): void {
  deleteCookie(SESSION_COOKIE_NAME, COOKIE_OPTIONS)
}

export function readSessionToken(): string | undefined {
  return getCookie(SESSION_COOKIE_NAME)
}
