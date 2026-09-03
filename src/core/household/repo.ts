import { eq } from 'drizzle-orm'
import { households, memberships } from '#/core/household/schema'
import { users } from '#/core/auth/schema'
import { db } from '#/core/db/client'

export async function hasAnyUsers(): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1)
  return rows.length > 0
}

/** Bootstrap: first-ever user creates their own household and becomes its owner. */
export async function createHouseholdWithOwner(
  name: string,
  ownerUserId: string,
): Promise<{ householdId: string }> {
  const [household] = await db
    .insert(households)
    .values({ name })
    .returning({ id: households.id })
  if (!household) throw new Error('Insert did not return a row')
  await db
    .insert(memberships)
    .values({ householdId: household.id, userId: ownerUserId, role: 'owner' })
  return { householdId: household.id }
}

export async function addMembership(
  householdId: string,
  userId: string,
  role: 'owner' | 'member',
): Promise<void> {
  await db.insert(memberships).values({ householdId, userId, role })
}

export interface PrimaryMembership {
  household: { id: string; name: string; timezone: string }
  role: 'owner' | 'member'
}

/**
 * doma is single-household per user at M2 (multi-household membership is
 * structurally possible per the schema, but nothing in the product yet
 * lets a user belong to more than one) — this returns the first/only one.
 */
export async function getPrimaryMembership(
  userId: string,
): Promise<PrimaryMembership | undefined> {
  const rows = await db
    .select({ household: households, role: memberships.role })
    .from(memberships)
    .innerJoin(households, eq(memberships.householdId, households.id))
    .where(eq(memberships.userId, userId))
    .limit(1)

  return rows[0]
}
