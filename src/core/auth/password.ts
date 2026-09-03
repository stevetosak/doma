import { hash, verify } from '@node-rs/argon2'

/**
 * argon2id, OWASP starting parameters (§5.4 of the execution plan): m =
 * 19456 KiB, t = 2, p = 1. Never bcrypt, never a hand-rolled KDF.
 */
const ARGON2_OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS)
}

export function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return verify(passwordHash, password)
}

/**
 * A real argon2id hash of a value nobody will ever type, hashed once at
 * startup with the same parameters as every real password — used to run a
 * dummy verify when the user doesn't exist, so the login route's response
 * time doesn't leak account existence (§5.4). Computed rather than
 * hardcoded so it's always a hash `verify()` actually accepts, whatever
 * @node-rs/argon2's exact output encoding is; hardcoding a hand-typed
 * string here would risk a parse failure that resolves near-instantly and
 * silently defeats the whole point.
 */
const dummyHash = hash(`dummy-password-${crypto.randomUUID()}`, ARGON2_OPTIONS)

export async function verifyDummyPassword(): Promise<boolean> {
  return verify(await dummyHash, 'not-the-password')
}
