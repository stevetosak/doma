import { eq } from 'drizzle-orm'
import { invites } from '#/core/household/schema'
import { db } from '#/core/db/client'
import { checkInvite, generateInviteCode } from '#/core/auth/invites'
import type { InviteCheckResult } from '#/core/auth/invites'

export async function checkInviteCode(
  code: string,
): Promise<InviteCheckResult> {
  const rows = await db
    .select()
    .from(invites)
    .where(eq(invites.code, code))
    .limit(1)
  return checkInvite(rows[0], new Date())
}

export async function redeemInvite(
  inviteId: string,
  userId: string,
): Promise<void> {
  await db
    .update(invites)
    .set({ redeemedAt: new Date(), redeemedBy: userId })
    .where(eq(invites.id, inviteId))
}

export interface CreateInviteOptions {
  householdId: string
  role: 'owner' | 'member'
  createdBy: string
  /** Omit for no expiry. */
  expiresInDays?: number
}

/**
 * No generation UI yet (that's M4's "invite generation UI" from the
 * members screen) — this is what scripts/create-invite.mjs calls, and
 * what M4's UI will call too.
 */
export async function createInvite(
  options: CreateInviteOptions,
): Promise<{ code: string }> {
  const code = generateInviteCode()
  const expiresAt = options.expiresInDays
    ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
    : null

  await db.insert(invites).values({
    householdId: options.householdId,
    code,
    role: options.role,
    createdBy: options.createdBy,
    expiresAt,
  })

  return { code }
}
