import { randomBytes } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { telegramLinkTokens, telegramLinks } from './schema'

const LINK_TOKEN_TTL_MINUTES = 15

export async function getTelegramLink(
  userId: string,
): Promise<{ chatId: string } | undefined> {
  const [row] = await db
    .select({ chatId: telegramLinks.chatId })
    .from(telegramLinks)
    .where(eq(telegramLinks.userId, userId))
  return row
}

export async function createLinkToken(userId: string): Promise<string> {
  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MINUTES * 60_000)
  await db.insert(telegramLinkTokens).values({ token, userId, expiresAt })
  return token
}

/**
 * Consumes a one-time link token: binds the chat id to whichever user
 * minted it, then deletes the token so it can't be replayed. Returns the
 * linked user id, or `null` for an unknown/expired token.
 */
export async function consumeLinkToken(
  token: string,
  chatId: string,
): Promise<string | null> {
  const [tokenRow] = await db
    .select({ userId: telegramLinkTokens.userId })
    .from(telegramLinkTokens)
    .where(
      and(
        eq(telegramLinkTokens.token, token),
        gt(telegramLinkTokens.expiresAt, new Date()),
      ),
    )
  if (!tokenRow) return null

  await db
    .insert(telegramLinks)
    .values({ userId: tokenRow.userId, chatId })
    .onConflictDoUpdate({
      target: telegramLinks.userId,
      set: { chatId, linkedAt: new Date() },
    })
  await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.token, token))

  return tokenRow.userId
}
