import { and, eq } from 'drizzle-orm'
import { oauthAccounts, users } from '#/core/auth/schema'
import { db } from '#/core/db/client'

export type User = typeof users.$inferSelect

export async function findUserByEmail(
  email: string,
): Promise<User | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  return rows[0]
}

export async function findUserById(id: string): Promise<User | undefined> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return rows[0]
}

export async function createUserWithPassword(options: {
  email: string
  passwordHash: string
  name?: string
}): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({
      email: options.email,
      passwordHash: options.passwordHash,
      name: options.name,
    })
    .returning()
  if (!user) throw new Error('Insert did not return a row')
  return user
}

export async function createUserFromGoogle(options: {
  email: string
  emailVerified: boolean
  name?: string
  picture?: string
}): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({
      email: options.email,
      emailVerified: options.emailVerified,
      name: options.name,
      picture: options.picture,
    })
    .returning()
  if (!user) throw new Error('Insert did not return a row')
  return user
}

export async function touchLastSeen(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ lastSeenAt: new Date() })
    .where(eq(users.id, userId))
}

export async function findLinkedGoogleUserId(
  providerAccountId: string,
): Promise<string | undefined> {
  const rows = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, 'google'),
        eq(oauthAccounts.providerAccountId, providerAccountId),
      ),
    )
    .limit(1)
  return rows[0]?.userId
}

export async function linkGoogleAccount(
  userId: string,
  providerAccountId: string,
): Promise<void> {
  await db
    .insert(oauthAccounts)
    .values({ userId, provider: 'google', providerAccountId })
}
