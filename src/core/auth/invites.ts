import { randomBytes } from 'node:crypto'

/**
 * Pure invite-code generation + validation logic. The DB lookup that feeds
 * `checkInvite` lives in invites-repo.ts.
 */

export function generateInviteCode(): string {
  // 10 base32-ish chars (Crockford, no ambiguous 0/O/1/I/L), easy to read
  // aloud or type by hand — this is handed over out-of-band (chat, in
  // person), not clicked from a link.
  const alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = randomBytes(10)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export interface InviteRow {
  id: string
  householdId: string
  code: string
  role: 'owner' | 'member'
  expiresAt: Date | null
  redeemedAt: Date | null
}

export type InviteCheckResult =
  | { ok: true; invite: InviteRow }
  | { ok: false; reason: 'not_found' | 'expired' | 'already_redeemed' }

/**
 * Decides whether an invite row (already looked up by code) is usable right
 * now. A missing row and an unusable row return distinguishable reasons for
 * logging, but callers must show the *same* generic message either way
 * (§5.4 — no enumeration of valid codes).
 */
export function checkInvite(
  invite: InviteRow | undefined,
  now: Date = new Date(),
): InviteCheckResult {
  if (!invite) return { ok: false, reason: 'not_found' }
  if (invite.redeemedAt) return { ok: false, reason: 'already_redeemed' }
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' }
  }
  return { ok: true, invite }
}
