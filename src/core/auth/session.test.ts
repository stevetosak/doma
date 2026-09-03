import { describe, expect, it } from 'vitest'
import {
  generateSessionToken,
  hashSessionToken,
  isSessionExpired,
  newSessionExpiry,
  shouldRefreshSession,
} from './session'

describe('generateSessionToken', () => {
  it('returns a token and its matching hash', () => {
    const { token, tokenHash } = generateSessionToken()
    expect(token.length).toBeGreaterThan(0)
    expect(tokenHash).toBe(hashSessionToken(token))
  })

  it('never repeats a token across calls', () => {
    const seen = new Set(
      Array.from({ length: 50 }, () => generateSessionToken().token),
    )
    expect(seen.size).toBe(50)
  })

  it('hashes deterministically', () => {
    expect(hashSessionToken('same-token')).toBe(hashSessionToken('same-token'))
    expect(hashSessionToken('token-a')).not.toBe(hashSessionToken('token-b'))
  })
})

describe('newSessionExpiry', () => {
  it('is 30 days out from the given time', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const expiry = newSessionExpiry(now)
    expect(expiry.getTime() - now.getTime()).toBe(30 * 24 * 60 * 60 * 1000)
  })
})

describe('shouldRefreshSession', () => {
  const now = new Date('2026-01-01T00:00:00Z')

  it('is false with the full 30 days remaining', () => {
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    expect(shouldRefreshSession(expiresAt, now)).toBe(false)
  })

  it('is false just above the halfway point', () => {
    const expiresAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000 + 1000)
    expect(shouldRefreshSession(expiresAt, now)).toBe(false)
  })

  it('is true just below the halfway point', () => {
    const expiresAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000 - 1000)
    expect(shouldRefreshSession(expiresAt, now)).toBe(true)
  })

  it('is true when already expired', () => {
    const expiresAt = new Date(now.getTime() - 1000)
    expect(shouldRefreshSession(expiresAt, now)).toBe(true)
  })
})

describe('isSessionExpired', () => {
  const now = new Date('2026-01-01T00:00:00Z')

  it('is false before expiry', () => {
    expect(isSessionExpired(new Date(now.getTime() + 1000), now)).toBe(false)
  })

  it('is true at exactly expiry', () => {
    expect(isSessionExpired(now, now)).toBe(true)
  })

  it('is true after expiry', () => {
    expect(isSessionExpired(new Date(now.getTime() - 1000), now)).toBe(true)
  })
})
