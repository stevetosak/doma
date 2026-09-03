import { describe, expect, it } from 'vitest'
import { checkInvite, generateInviteCode } from './invites'
import type { InviteRow } from './invites'

const baseInvite: InviteRow = {
  id: 'invite-1',
  householdId: 'household-1',
  code: 'ABCDEFGHJK',
  role: 'member',
  expiresAt: null,
  redeemedAt: null,
}

describe('generateInviteCode', () => {
  it('produces 10-character codes with no ambiguous characters', () => {
    const code = generateInviteCode()
    expect(code).toHaveLength(10)
    expect(code).not.toMatch(/[0O1IL]/)
  })

  it('does not repeat across a reasonable sample', () => {
    const seen = new Set(Array.from({ length: 200 }, generateInviteCode))
    expect(seen.size).toBe(200)
  })
})

describe('checkInvite', () => {
  const now = new Date('2026-01-01T00:00:00Z')

  it('refuses a missing invite (unknown code)', () => {
    const result = checkInvite(undefined, now)
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('refuses an already-redeemed invite', () => {
    const result = checkInvite(
      { ...baseInvite, redeemedAt: new Date('2025-12-01') },
      now,
    )
    expect(result).toEqual({ ok: false, reason: 'already_redeemed' })
  })

  it('refuses an expired invite', () => {
    const result = checkInvite(
      { ...baseInvite, expiresAt: new Date('2025-12-31') },
      now,
    )
    expect(result).toEqual({ ok: false, reason: 'expired' })
  })

  it('accepts an invite expiring in the future', () => {
    const invite = { ...baseInvite, expiresAt: new Date('2026-06-01') }
    expect(checkInvite(invite, now)).toEqual({ ok: true, invite })
  })

  it('accepts an invite with no expiry at all', () => {
    expect(checkInvite(baseInvite, now)).toEqual({
      ok: true,
      invite: baseInvite,
    })
  })

  it('treats an invite expiring at exactly `now` as expired', () => {
    const invite = { ...baseInvite, expiresAt: now }
    expect(checkInvite(invite, now)).toEqual({ ok: false, reason: 'expired' })
  })
})
