import { describe, expect, it } from 'vitest'
import { wouldLeaveHouseholdOwnerless } from './member-rules'
import type { HouseholdMember } from './members-repo'

function member(
  userId: string,
  role: HouseholdMember['role'],
): HouseholdMember {
  return { userId, email: `${userId}@example.com`, name: null, role }
}

describe('wouldLeaveHouseholdOwnerless', () => {
  it('is true removing the sole owner', () => {
    const members = [member('a', 'owner'), member('b', 'member')]
    expect(wouldLeaveHouseholdOwnerless(members, 'a')).toBe(true)
  })

  it('is false removing one of two owners', () => {
    const members = [member('a', 'owner'), member('b', 'owner')]
    expect(wouldLeaveHouseholdOwnerless(members, 'a')).toBe(false)
  })

  it('is false removing a member (not an owner)', () => {
    const members = [member('a', 'owner'), member('b', 'member')]
    expect(wouldLeaveHouseholdOwnerless(members, 'b')).toBe(false)
  })

  it('is false for a user not in the household', () => {
    const members = [member('a', 'owner')]
    expect(wouldLeaveHouseholdOwnerless(members, 'ghost')).toBe(false)
  })
})
