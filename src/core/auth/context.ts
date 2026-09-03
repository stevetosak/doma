import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from '#/core/auth/cookies'
import { validateSessionToken } from '#/core/auth/session-repo'
import { getPrimaryMembership } from '#/core/household/repo'

export interface AuthContext {
  user: {
    id: string
    email: string
    name: string | null
    picture: string | null
  } | null
  household: { id: string; name: string; role: 'owner' | 'member' } | null
}

const ANONYMOUS: AuthContext = { user: null, household: null }

/**
 * Reads the session cookie, validates it, rolls the cookie forward if the
 * session was refreshed, and resolves the user's household membership.
 * This is what the root route's `beforeLoad` calls (§5.4) — used both
 * there and inside individual mutating routes that need `context.user`.
 */
export async function resolveAuthContext(): Promise<AuthContext> {
  const token = readSessionToken()
  if (!token) return ANONYMOUS

  const validated = await validateSessionToken(token)
  if (!validated) {
    clearSessionCookie()
    return ANONYMOUS
  }

  if (validated.refreshedExpiresAt) {
    setSessionCookie(token, validated.refreshedExpiresAt)
  }

  const membership = await getPrimaryMembership(validated.user.id)

  return {
    user: {
      id: validated.user.id,
      email: validated.user.email,
      name: validated.user.name,
      picture: validated.user.picture,
    },
    household: membership
      ? {
          id: membership.household.id,
          name: membership.household.name,
          role: membership.role,
        }
      : null,
  }
}
