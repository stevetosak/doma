/**
 * The Google callback's identity-resolution decision (§5.4) as a pure
 * function: DB lookups go in, one decision comes out. Kept separate from
 * the actual route/DB code specifically so the exact-order rule — and
 * above all the unverified-email refusal — is unit-testable without a
 * database or a live Google flow. See google-identity.test.ts.
 */

export interface GoogleIdentity {
  /** Google's `sub` claim. */
  providerAccountId: string
  email: string
  emailVerified: boolean
}

export interface ResolveGoogleIdentityInput {
  google: GoogleIdentity
  /** The user id of the currently signed-in session, if any. */
  currentSessionUserId: string | undefined
  /** Result of looking up oauth_accounts by (provider, provider_account_id). */
  linkedUserId: string | undefined
  /** Result of looking up users by google.email. */
  existingUserByEmail: { userId: string } | undefined
  /** Carried through the OAuth `state` cookie, for a fresh signup. */
  inviteCode: string | undefined
}

export type ResolveGoogleIdentityResult =
  | { action: 'sign_in'; userId: string }
  | { action: 'link_and_sign_in'; userId: string }
  | { action: 'signup'; inviteCode: string }
  | {
      action: 'refuse'
      reason: 'unverified_email_conflict' | 'signup_requires_invite'
    }

/**
 * Resolves identity in the exact order §5.4 specifies:
 *   1. oauth_accounts row exists       -> sign that user in.
 *   2. Signed-in session present       -> link Google to the current user.
 *   3. Matching-email user exists      -> link + sign in, but ONLY if Google
 *      reports the email verified. An unverified email must never
 *      auto-link — that's a straightforward account-takeover vector
 *      (register the victim's email anywhere, then "sign in with Google"
 *      to hijack their doma account).
 *   4. No match                        -> this is a signup; it requires an
 *      invite code carried through the OAuth state.
 * Each step is checked only if every step before it didn't already decide.
 */
export function resolveGoogleIdentity(
  input: ResolveGoogleIdentityInput,
): ResolveGoogleIdentityResult {
  if (input.linkedUserId) {
    return { action: 'sign_in', userId: input.linkedUserId }
  }

  if (input.currentSessionUserId) {
    return { action: 'link_and_sign_in', userId: input.currentSessionUserId }
  }

  if (input.existingUserByEmail) {
    if (!input.google.emailVerified) {
      return { action: 'refuse', reason: 'unverified_email_conflict' }
    }
    return {
      action: 'link_and_sign_in',
      userId: input.existingUserByEmail.userId,
    }
  }

  if (input.inviteCode) {
    return { action: 'signup', inviteCode: input.inviteCode }
  }

  return { action: 'refuse', reason: 'signup_requires_invite' }
}
