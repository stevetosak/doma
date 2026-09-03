import {
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from '#/core/auth/schema'

/**
 * Household + membership + invite tables. Minimal at M2 — just enough for
 * invite-gated registration and the owner/member split. `household_modules`
 * (per-household toggles) and the members/invite-generation UI are M4.
 */

export const householdRole = pgEnum('household_role', ['owner', 'member'])

export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Europe/Skopje'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const memberships = pgTable(
  'memberships',
  {
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: householdRole('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.householdId, table.userId] })],
)

// Gates registration itself (not just joining a household already-registered
// users belong to) — see src/core/auth/invites.ts.
export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  role: householdRole('role').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
  redeemedBy: uuid('redeemed_by').references(() => users.id, {
    onDelete: 'set null',
  }),
})
