import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { citext } from '#/core/db/types'

/**
 * Identity tables — doma-owned auth (§5.4 of the execution plan). No
 * household dependency: a user can exist before joining any household
 * (mid-registration) and this table set never needs to know about
 * households/memberships/invites to make sense on its own.
 */

export const oauthProvider = pgEnum('oauth_provider', ['google'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  // citext: case-insensitive so "Alice@x.com" and "alice@x.com" collide.
  email: citext('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  // Nullable — Google-only users never set a password.
  passwordHash: text('password_hash'),
  name: text('name'),
  picture: text('picture'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
})

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: oauthProvider('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.provider, table.providerAccountId)],
)

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // SHA-256 hex of the session token. The token itself lives only in the
  // cookie — a DB leak is not a session leak.
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * Fixed-window rate limiting for register/login. `key` is `email:<addr>` or
 * `ip:<addr>` — one row per key, reset when the window rolls over.
 */
export const authThrottle = pgTable('auth_throttle', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull().default(0),
})
