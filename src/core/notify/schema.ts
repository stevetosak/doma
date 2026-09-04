import {
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { households } from '#/core/household/schema'
import { users } from '#/core/auth/schema'

/**
 * Notification outbox + Telegram linking (M8, §5.3/§5.5). `notifications` is
 * the exactly-once ledger: a row is claimed via INSERT ... ON CONFLICT
 * DO NOTHING on `dedupeKey` before a send is attempted, so a duplicate
 * enqueue (a re-run nightly materialize, the retry sweep, a job replay)
 * collides on the constraint instead of double-notifying. See
 * src/core/notify/dispatch.ts.
 */

export const notificationStatus = pgEnum('notification_status', [
  'pending',
  'sent',
  'failed',
])

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  moduleId: text('module_id').notNull(),
  kind: text('kind').notNull(),
  subjectId: text('subject_id').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  deepLink: text('deep_link').notNull(),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  status: notificationStatus('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(1),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  dedupeKey: text('dedupe_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// One Telegram chat per user — linking again just overwrites the chat id
// (re-linking from a new device/account is the recovery path, no UI needed
// beyond "link again").
export const telegramLinks = pgTable('telegram_links', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  chatId: text('chat_id').notNull(),
  linkedAt: timestamp('linked_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Short-lived one-time tokens carried through the t.me/<bot>?start=<token>
// deep link; consumed by the webhook's /start handler.
export const telegramLinkTokens = pgTable(
  'telegram_link_tokens',
  {
    token: text('token').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.token] })],
)
