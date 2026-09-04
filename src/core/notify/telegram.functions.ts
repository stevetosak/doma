import { createServerFn } from '@tanstack/react-start'
import { resolveAuthContext } from '#/core/auth/context'
import { optionalEnv } from '#/core/env'
import { createLinkToken, getTelegramLink } from './telegram-links-repo'
import { isTelegramConfigured } from './telegram-bot'

export class TelegramAccessError extends Error {}

async function requireUserId(): Promise<string> {
  const auth = await resolveAuthContext()
  if (!auth.user) throw new TelegramAccessError('Not signed in.')
  return auth.user.id
}

export interface TelegramStatus {
  configured: boolean
  linked: boolean
}

// Linking is per-user, not owner-gated (§5.3 telegram_links is keyed by
// user_id) — any signed-in household member manages their own chat.
export const getTelegramStatus = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TelegramStatus> => {
    const userId = await requireUserId()
    if (!isTelegramConfigured()) return { configured: false, linked: false }
    const link = await getTelegramLink(userId)
    return { configured: true, linked: Boolean(link) }
  },
)

export const createTelegramLinkAction = createServerFn({
  method: 'POST',
}).handler(async (): Promise<{ deepLink: string }> => {
  const userId = await requireUserId()
  if (!isTelegramConfigured()) {
    throw new TelegramAccessError('Telegram is not configured for this app.')
  }
  const botUsername = optionalEnv('TELEGRAM_BOT_USERNAME', '')
  if (!botUsername) {
    throw new TelegramAccessError('Telegram bot username is not configured.')
  }
  const token = await createLinkToken(userId)
  return { deepLink: `https://t.me/${botUsername}?start=${token}` }
})
