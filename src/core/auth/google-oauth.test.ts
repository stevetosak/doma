import { describe, expect, it } from 'vitest'
import {
  createGoogleAuthorizationUrl,
  decodeGoogleIdToken,
  generatePkce,
  generateState,
  GoogleOAuthError,
} from './google-oauth'

describe('generateState / generatePkce', () => {
  it('never repeat and produce non-empty values', () => {
    const states = new Set(Array.from({ length: 20 }, generateState))
    expect(states.size).toBe(20)

    const verifiers = new Set(
      Array.from({ length: 20 }, () => generatePkce().codeVerifier),
    )
    expect(verifiers.size).toBe(20)
  })

  it('derives the code challenge deterministically from the verifier', () => {
    const { codeVerifier, codeChallenge } = generatePkce()
    expect(codeChallenge).not.toBe(codeVerifier)
    expect(codeChallenge.length).toBeGreaterThan(0)
  })
})

describe('createGoogleAuthorizationUrl', () => {
  it('builds an authorization URL with the required query params', () => {
    const url = new URL(
      createGoogleAuthorizationUrl({
        clientId: 'test-client-id',
        redirectUri: 'http://localhost:3000/auth/google/callback',
        state: 'test-state',
        codeChallenge: 'test-challenge',
      }),
    )

    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    )
    expect(url.searchParams.get('client_id')).toBe('test-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/auth/google/callback',
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('state')).toBe('test-state')
    expect(url.searchParams.get('code_challenge')).toBe('test-challenge')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })
})

describe('decodeGoogleIdToken', () => {
  function fakeIdToken(claims: Record<string, unknown>): string {
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
    ).toString('base64url')
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
    return `${header}.${payload}.fake-signature`
  }

  it('decodes the payload claims', () => {
    const token = fakeIdToken({
      sub: 'google-sub-1',
      email: 'alice@example.com',
      email_verified: true,
      name: 'Alice',
    })
    expect(decodeGoogleIdToken(token)).toEqual({
      sub: 'google-sub-1',
      email: 'alice@example.com',
      email_verified: true,
      name: 'Alice',
    })
  })

  it('throws GoogleOAuthError on a malformed token', () => {
    expect(() => decodeGoogleIdToken('not-a-jwt')).toThrow(GoogleOAuthError)
  })
})
