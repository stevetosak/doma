import { createFileRoute } from '@tanstack/react-router'
import { deleteCookie, getCookie } from '@tanstack/react-start/server'
import { requireEnv, optionalEnv } from '#/core/env'
import { setSessionCookie, readSessionToken } from '#/core/auth/cookies'
import { resolveGoogleIdentity } from '#/core/auth/google-identity'
import {
  decodeGoogleIdToken,
  exchangeGoogleAuthorizationCode,
} from '#/core/auth/google-oauth'
import { checkInviteCode, redeemInvite } from '#/core/auth/invites-repo'
import { OAUTH_STATE_COOKIE_NAME } from '#/core/auth/oauth-state'
import type { OAuthStatePayload } from '#/core/auth/oauth-state'
import { redirectResponse } from '#/core/auth/redirect'
import { verifySignedPayload } from '#/core/auth/signed-cookie'
import {
  createSession,
  revokeAllSessionsForUser,
  validateSessionToken,
} from '#/core/auth/session-repo'
import {
  createUserFromGoogle,
  findLinkedGoogleUserId,
  findUserByEmail,
  linkGoogleAccount,
} from '#/core/auth/users-repo'
import { addMembership } from '#/core/household/repo'

/** Every failure path lands back on /login with a reason — never a 500 for user-facing OAuth flow errors. */
function loginFailure(reason: string): Response {
  return redirectResponse(new URL(`/login?error=${reason}`, currentAppOrigin()))
}

function currentAppOrigin(): string {
  return optionalEnv('APP_ORIGIN', 'http://localhost:3000')
}

export const Route = createFileRoute('/auth/google/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)

        // One-shot cookie — read and clear it regardless of outcome.
        const rawState = getCookie(OAUTH_STATE_COOKIE_NAME)
        deleteCookie(OAUTH_STATE_COOKIE_NAME, { path: '/' })

        if (url.searchParams.get('error')) {
          // The user declined consent on Google's side — not an attack, just a cancel.
          return loginFailure('oauth_cancelled')
        }

        if (!rawState) {
          return loginFailure('oauth_failed')
        }

        const verified = verifySignedPayload(
          rawState,
          requireEnv('SESSION_SECRET'),
        )
        if (!verified) {
          return loginFailure('oauth_failed')
        }

        const statePayload = JSON.parse(verified) as OAuthStatePayload
        const returnedState = url.searchParams.get('state')
        const code = url.searchParams.get('code')

        if (!code || !returnedState || returnedState !== statePayload.state) {
          return loginFailure('oauth_failed')
        }

        const appOrigin = currentAppOrigin()
        const tokens = await exchangeGoogleAuthorizationCode({
          clientId: requireEnv('GOOGLE_CLIENT_ID'),
          clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
          code,
          codeVerifier: statePayload.codeVerifier,
          redirectUri: `${appOrigin}/auth/google/callback`,
        })
        const claims = decodeGoogleIdToken(tokens.id_token)

        const existingSessionToken = readSessionToken()
        const currentSessionUserId = existingSessionToken
          ? (await validateSessionToken(existingSessionToken))?.user.id
          : undefined

        const linkedUserId = await findLinkedGoogleUserId(claims.sub)
        const existingUser = await findUserByEmail(claims.email)

        const decision = resolveGoogleIdentity({
          google: {
            providerAccountId: claims.sub,
            email: claims.email,
            emailVerified: claims.email_verified,
          },
          currentSessionUserId,
          linkedUserId,
          existingUserByEmail: existingUser
            ? { userId: existingUser.id }
            : undefined,
          inviteCode: statePayload.inviteCode,
        })

        switch (decision.action) {
          case 'sign_in': {
            await signInAs(decision.userId, request)
            return redirectResponse(new URL(statePayload.returnTo, appOrigin))
          }
          case 'link_and_sign_in': {
            await linkGoogleAccount(decision.userId, claims.sub)
            await signInAs(decision.userId, request)
            return redirectResponse(new URL(statePayload.returnTo, appOrigin))
          }
          case 'signup': {
            const inviteResult = await checkInviteCode(decision.inviteCode)
            if (!inviteResult.ok) {
              return loginFailure('invite_invalid')
            }
            const user = await createUserFromGoogle({
              email: claims.email,
              emailVerified: claims.email_verified,
              name: claims.name,
              picture: claims.picture,
            })
            await addMembership(
              inviteResult.invite.householdId,
              user.id,
              inviteResult.invite.role,
            )
            await redeemInvite(inviteResult.invite.id, user.id)
            await linkGoogleAccount(user.id, claims.sub)
            await signInAs(user.id, request)
            return redirectResponse(new URL(statePayload.returnTo, appOrigin))
          }
          case 'refuse': {
            return loginFailure(
              decision.reason === 'unverified_email_conflict'
                ? 'google_unverified_conflict'
                : 'google_invite_required',
            )
          }
        }
      },
    },
  },
})

async function signInAs(userId: string, request: Request): Promise<void> {
  await revokeAllSessionsForUser(userId)
  const { token, expiresAt } = await createSession(
    userId,
    request.headers.get('user-agent') ?? undefined,
  )
  setSessionCookie(token, expiresAt)
}
