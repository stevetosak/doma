import type { HouseholdMember } from './members-repo'

/**
 * A household must always keep at least one owner — used before removing a
 * member or demoting one to `member` so that action can be refused instead
 * of silently leaving the household ownerless.
 */
export function wouldLeaveHouseholdOwnerless(
  members: HouseholdMember[],
  targetUserId: string,
): boolean {
  const target = members.find((m) => m.userId === targetUserId)
  if (target?.role !== 'owner') return false
  const ownerCount = members.filter((m) => m.role === 'owner').length
  return ownerCount <= 1
}
