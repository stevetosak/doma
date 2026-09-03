import { createHash, randomBytes } from 'node:crypto'

/**
 * Pure session-token logic — no DB import, so it's cheaply unit-testable.
 * The DB-touching half (create/validate/revoke) lives in session-repo.ts.
 */

export const SESSION_COOKIE_NAME = 'doma_session'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const SESSION_REFRESH_THRESHOLD_MS = SESSION_TTL_MS / 2 // refresh past halfway

export interface GeneratedSessionToken {
  /** Goes in the cookie. Never stored. */
  token: string
  /** Goes in the DB. A leaked DB row can't be replayed as a session. */
  tokenHash: string
}

export function generateSessionToken(): GeneratedSessionToken {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashSessionToken(token) }
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newSessionExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_MS)
}

/** True once less than half the session's life remains — time to roll it forward. */
export function shouldRefreshSession(
  expiresAt: Date,
  now: Date = new Date(),
): boolean {
  return expiresAt.getTime() - now.getTime() < SESSION_REFRESH_THRESHOLD_MS
}

export function isSessionExpired(
  expiresAt: Date,
  now: Date = new Date(),
): boolean {
  return expiresAt.getTime() <= now.getTime()
}
