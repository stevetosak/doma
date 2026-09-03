import { createHash, randomBytes } from 'node:crypto'

/**
 * A small, hand-rolled Google OAuth 2.0 + PKCE client.
 *
 * The execution plan named `arctic` for this. By the time this milestone
 * was built, `arctic` had been deprecated by its own maintainer — "no
 * longer supported" on every published version, author inactive for
 * nearly a year, and their own advice is to inline the (small) code
 * instead of depending on the package. See the M2 PR description for the
 * full reasoning. Google's authorization-code + PKCE flow is standard and
 * small enough that owning it directly is the safer choice long-term.
 *
 * Scope is deliberately narrow: only what doma actually needs (build an
 * authorization URL, exchange a code, decode the returned ID token). This
 * is not a general-purpose OAuth library.
 */

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

export function generateState(): string {
  return randomBytes(32).toString('base64url')
}

export interface Pkce {
  codeVerifier: string
  codeChallenge: string
}

export function generatePkce(): Pkce {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')
  return { codeVerifier, codeChallenge }
}

export function createGoogleAuthorizationUrl(options: {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
}): string {
  const url = new URL(AUTHORIZATION_ENDPOINT)
  url.searchParams.set('client_id', options.clientId)
  url.searchParams.set('redirect_uri', options.redirectUri)
  url.searchParams.set('response_type', 'code')
  // Only non-sensitive scopes — keeps the consent screen publishable
  // without Google's app-verification review (§4).
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', options.state)
  url.searchParams.set('code_challenge', options.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

interface GoogleTokenResponse {
  access_token: string
  id_token: string
  expires_in: number
  token_type: string
  scope: string
}

export class GoogleOAuthError extends Error {}

export async function exchangeGoogleAuthorizationCode(options: {
  clientId: string
  clientSecret: string
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    code: options.code,
    code_verifier: options.codeVerifier,
    redirect_uri: options.redirectUri,
    grant_type: 'authorization_code',
  })

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    throw new GoogleOAuthError(
      `Google token exchange failed: ${response.status} ${await response.text()}`,
    )
  }

  return (await response.json()) as GoogleTokenResponse
}

export interface GoogleIdTokenClaims {
  sub: string
  email: string
  email_verified: boolean
  name?: string
  picture?: string
}

/**
 * Decodes (does NOT verify the signature of) a Google-issued ID token.
 * Safe here because the token came directly from Google's token endpoint
 * over TLS in the exchange above — not from a client-supplied value —
 * which is standard practice for the authorization-code flow.
 */
export function decodeGoogleIdToken(idToken: string): GoogleIdTokenClaims {
  const parts = idToken.split('.')
  const payloadPart = parts[1]
  if (parts.length !== 3 || payloadPart === undefined) {
    throw new GoogleOAuthError('Malformed ID token')
  }
  const payload = Buffer.from(payloadPart, 'base64url').toString('utf8')
  return JSON.parse(payload) as GoogleIdTokenClaims
}
