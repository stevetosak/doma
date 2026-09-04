import { and, eq } from 'drizzle-orm'
import { memberships } from '#/core/household/schema'
import { users } from '#/core/auth/schema'
import { db } from '#/core/db/client'

export interface HouseholdMember {
  userId: string
  email: string
  name: string | null
  role: 'owner' | 'member'
}

export async function listMembers(
  householdId: string,
): Promise<HouseholdMember[]> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.householdId, householdId))
  return rows
}

export async function removeMember(
  householdId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(memberships)
    .where(
      and(
        eq(memberships.householdId, householdId),
        eq(memberships.userId, userId),
      ),
    )
}

export async function setMemberRole(
  householdId: string,
  userId: string,
  role: 'owner' | 'member',
): Promise<void> {
  await db
    .update(memberships)
    .set({ role })
    .where(
      and(
        eq(memberships.householdId, householdId),
        eq(memberships.userId, userId),
      ),
    )
}
