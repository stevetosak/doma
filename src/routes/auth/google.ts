import { createFileRoute } from '@tanstack/react-router'
import { setCookie } from '@tanstack/react-start/server'
import { requireEnv, optionalEnv } from '#/core/env'
import {
  createGoogleAuthorizationUrl,
  generatePkce,
  generateState,
} from '#/core/auth/google-oauth'
import { redirectResponse, sanitizeRedirectTarget } from '#/core/auth/redirect'
import { signPayload } from '#/core/auth/signed-cookie'
import { OAUTH_STATE_COOKIE_NAME } from '#/core/auth/oauth-state'
import type { OAuthStatePayload } from '#/core/auth/oauth-state'

export const Route = createFileRoute('/auth/google')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const returnTo = sanitizeRedirectTarget(
          url.searchParams.get('returnTo'),
        )
        const inviteCode = url.searchParams.get('inviteCode') ?? undefined

        const state = generateState()
        const { codeVerifier, codeChallenge } = generatePkce()

        const payload: OAuthStatePayload = {
          state,
          codeVerifier,
          returnTo,
          inviteCode,
        }
        const signed = signPayload(
          JSON.stringify(payload),
          requireEnv('SESSION_SECRET'),
        )

        setCookie(OAUTH_STATE_COOKIE_NAME, signed, {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 600, // 10 minutes — one-shot, this flow only
        })

        const appOrigin = optionalEnv('APP_ORIGIN', 'http://localhost:3000')
        const authUrl = createGoogleAuthorizationUrl({
          clientId: requireEnv('GOOGLE_CLIENT_ID'),
          redirectUri: `${appOrigin}/auth/google/callback`,
          state,
          codeChallenge,
        })

        return redirectResponse(authUrl)
      },
    },
  },
})
