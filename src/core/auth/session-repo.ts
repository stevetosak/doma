import { eq } from 'drizzle-orm'
import { sessions, users } from '#/core/auth/schema'
import { db } from '#/core/db/client'
import {
  generateSessionToken,
  hashSessionToken,
  isSessionExpired,
  newSessionExpiry,
  shouldRefreshSession,
} from '#/core/auth/session'
import type { GeneratedSessionToken } from '#/core/auth/session'

export type SessionUser = typeof users.$inferSelect

/**
 * Creates a session row for `userId` and returns the raw token (for the
 * cookie) plus its expiry. The token itself is never persisted — only its
 * hash.
 */
export async function createSession(
  userId: string,
  userAgent: string | undefined,
): Promise<GeneratedSessionToken & { expiresAt: Date }> {
  const { token, tokenHash } = generateSessionToken()
  const expiresAt = newSessionExpiry()
  await db.insert(sessions).values({ userId, tokenHash, expiresAt, userAgent })
  return { token, tokenHash, expiresAt }
}

export interface ValidatedSession {
  user: SessionUser
  /** Set when the session was rolled forward — the cookie must be reissued with this. */
  refreshedExpiresAt: Date | undefined
}

/**
 * Looks up the session by token, checks expiry, and rolls it forward if
 * it's past the halfway point of its life (§5.4: 30-day rolling,
 * refreshed past halfway). Deletes (rather than merely ignoring) an
 * expired session row so they don't accumulate.
 */
export async function validateSessionToken(
  token: string,
): Promise<ValidatedSession | undefined> {
  const tokenHash = hashSessionToken(token)
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1)

  const row = rows[0]
  if (!row) return undefined

  if (isSessionExpired(row.session.expiresAt)) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id))
    return undefined
  }

  let refreshedExpiresAt: Date | undefined
  if (shouldRefreshSession(row.session.expiresAt)) {
    refreshedExpiresAt = newSessionExpiry()
    await db
      .update(sessions)
      .set({ expiresAt: refreshedExpiresAt })
      .where(eq(sessions.id, row.session.id))
  }

  return { user: row.user, refreshedExpiresAt }
}

export async function revokeSessionByToken(token: string): Promise<void> {
  await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, hashSessionToken(token)))
}

/** Used on login and on Google sign-in/link — session rotation on privilege change. */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId))
}
