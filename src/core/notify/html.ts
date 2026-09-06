/**
 * Telegram messages send with parse_mode HTML (telegram-bot.ts) — any
 * user-supplied text interpolated into a title/body (a chore title, an
 * item name, notes) must go through this first. Order matters: '&' must
 * be replaced before '<'/'>' , or the '&lt;'/'&gt;' this produces would
 * get re-escaped on a second pass.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
