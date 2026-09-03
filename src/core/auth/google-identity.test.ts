import { describe, expect, it } from 'vitest'
import { resolveGoogleIdentity } from './google-identity'
import type { ResolveGoogleIdentityInput } from './google-identity'

const verifiedGoogle = {
  providerAccountId: 'google-sub-1',
  email: 'alice@example.com',
  emailVerified: true,
}

const unverifiedGoogle = { ...verifiedGoogle, emailVerified: false }

const baseInput: ResolveGoogleIdentityInput = {
  google: verifiedGoogle,
  currentSessionUserId: undefined,
  linkedUserId: undefined,
  existingUserByEmail: undefined,
  inviteCode: undefined,
}

describe('resolveGoogleIdentity', () => {
  it('case 1: an already-linked oauth account signs that user in', () => {
    const result = resolveGoogleIdentity({
      ...baseInput,
      linkedUserId: 'user-linked',
    })
    expect(result).toEqual({ action: 'sign_in', userId: 'user-linked' })
  })

  it('case 1 wins even with an active session, an email match, and an invite code present', () => {
    const result = resolveGoogleIdentity({
      ...baseInput,
      linkedUserId: 'user-linked',
      currentSessionUserId: 'user-current',
      existingUserByEmail: { userId: 'user-by-email' },
      inviteCode: 'CODE1234',
    })
    expect(result).toEqual({ action: 'sign_in', userId: 'user-linked' })
  })

  it('case 2: no linked account, but a session is active -> link to the current user', () => {
    const result = resolveGoogleIdentity({
      ...baseInput,
      currentSessionUserId: 'user-current',
    })
    expect(result).toEqual({
      action: 'link_and_sign_in',
      userId: 'user-current',
    })
  })

  it('case 2 wins over an email match when a session is active', () => {
    const result = resolveGoogleIdentity({
      ...baseInput,
      currentSessionUserId: 'user-current',
      existingUserByEmail: { userId: 'user-by-email' },
    })
    expect(result).toEqual({
      action: 'link_and_sign_in',
      userId: 'user-current',
    })
  })

  it('case 3: no session, verified email match -> links and signs in as that user', () => {
    const result = resolveGoogleIdentity({
      ...baseInput,
      existingUserByEmail: { userId: 'user-by-email' },
    })
    expect(result).toEqual({
      action: 'link_and_sign_in',
      userId: 'user-by-email',
    })
  })

  it('case 3, THE critical case: an unverified email against an existing account is refused, never linked', () => {
    const result = resolveGoogleIdentity({
      ...baseInput,
      google: unverifiedGoogle,
      existingUserByEmail: { userId: 'victim-account' },
    })
    expect(result).toEqual({
      action: 'refuse',
      reason: 'unverified_email_conflict',
    })
  })

  it('the unverified refusal holds even with an invite code also present', () => {
    const result = resolveGoogleIdentity({
      ...baseInput,
      google: unverifiedGoogle,
      existingUserByEmail: { userId: 'victim-account' },
      inviteCode: 'CODE1234',
    })
    expect(result.action).toBe('refuse')
  })

  it('case 4: no match anywhere, an invite code present -> signup', () => {
    const result = resolveGoogleIdentity({
      ...baseInput,
      inviteCode: 'CODE1234',
    })
    expect(result).toEqual({ action: 'signup', inviteCode: 'CODE1234' })
  })

  it('case 4, no match and no invite code -> refused, no account created', () => {
    const result = resolveGoogleIdentity(baseInput)
    expect(result).toEqual({
      action: 'refuse',
      reason: 'signup_requires_invite',
    })
  })
})
