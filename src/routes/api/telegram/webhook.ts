import { createFileRoute } from '@tanstack/react-router'
import {
  handleTelegramWebhookRequest,
  isTelegramConfigured,
} from '#/core/notify/telegram-bot'

/**
 * Telegram's webhook target (§5.5) — grammy's `std/http` adapter validates
 * `X-Telegram-Bot-Api-Secret-Token` against TELEGRAM_WEBHOOK_SECRET and
 * handles the /start linking command registered in telegram-bot.ts.
 */
export const Route = createFileRoute('/api/telegram/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isTelegramConfigured()) {
          return new Response('Not configured', { status: 404 })
        }
        return handleTelegramWebhookRequest(request)
      },
    },
  },
})
