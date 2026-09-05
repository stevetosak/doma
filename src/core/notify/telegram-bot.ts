import { Bot, webhookCallback } from 'grammy'
import { optionalEnv, requireEnv } from '#/core/env'
import { consumeLinkToken } from './telegram-links-repo'

/**
 * One bot for the whole app (§5.5) — every household member links their own
 * chat via a deep link; nothing here is per-household. Lazily constructed
 * so a local dev environment with no TELEGRAM_BOT_TOKEN can still run —
 * every entry point below checks isTelegramConfigured() (or accepts the
 * throw from requireEnv) before touching the bot.
 */

let bot: Bot | undefined
let initPromise: Promise<Bot> | undefined

export function isTelegramConfigured(): boolean {
  return optionalEnv('TELEGRAM_BOT_TOKEN', '') !== ''
}

function buildBot(): Bot {
  const instance = new Bot(requireEnv('TELEGRAM_BOT_TOKEN'))
  instance.command('start', async (ctx) => {
    const token = ctx.match.trim()
    const chatId = String(ctx.chat.id)
    if (!token) {
      await ctx.reply(
        "Open the link from doma's account page to connect this chat.",
      )
      return
    }
    const userId = await consumeLinkToken(token, chatId)
    await ctx.reply(
      userId
        ? "You're linked — doma will DM reminders here."
        : 'That link expired. Generate a new one from doma and try again.',
    )
  })
  return instance
}

async function ensureInited(): Promise<Bot> {
  if (!bot) bot = buildBot()
  if (!initPromise) initPromise = bot.init().then(() => bot!)
  return initPromise
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<void> {
  const instance = await ensureInited()
  await instance.api.sendMessage(chatId, text)
}

let webhookHandler: ((request: Request) => Promise<Response>) | undefined

export async function handleTelegramWebhookRequest(
  request: Request,
): Promise<Response> {
  const instance = await ensureInited()
  if (!webhookHandler) {
    webhookHandler = webhookCallback(instance, 'std/http', {
      secretToken: optionalEnv('TELEGRAM_WEBHOOK_SECRET', '') || undefined,
    })
  }
  return webhookHandler(request)
}

/** Local dev only (§5.5) — production always uses the webhook route. */
export function startTelegramPollingIfEnabled(): void {
  if (optionalEnv('TELEGRAM_POLLING', 'false') !== 'true') return
  if (!isTelegramConfigured()) return
  void ensureInited()
    .then((instance) => instance.start())
    .catch((err) => console.error('Telegram long-polling failed:', err))
}

/**
 * Points Telegram at our webhook route, same self-registering spirit as the
 * boot-time migrations (scripts/migrate.mjs) — no manual `setWebhook` step
 * in the runbook. Idempotent (re-registering the same URL on every boot is
 * a no-op on Telegram's side); skipped when long-polling is enabled, since
 * the two delivery modes are mutually exclusive.
 */
export async function configureTelegramWebhookIfNeeded(): Promise<void> {
  if (!isTelegramConfigured()) return
  if (optionalEnv('TELEGRAM_POLLING', 'false') === 'true') return
  const instance = await ensureInited()
  const origin = optionalEnv('APP_ORIGIN', 'http://localhost:3000')
  await instance.api.setWebhook(`${origin}/api/telegram/webhook`, {
    secret_token: optionalEnv('TELEGRAM_WEBHOOK_SECRET', '') || undefined,
  })
}
