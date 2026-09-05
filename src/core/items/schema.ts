import { check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { households } from '#/core/household/schema'

/**
 * Cross-cutting infrastructure (like core/notify), not a feature module —
 * a real, DB-enforced polymorphic reference every module's primary entity
 * (a chore, a shopping item, whatever comes later) can key off, replacing
 * the old string-based existenceCheckTable/Id lookup. See the M9 design
 * spec (docs/superpowers/specs/2026-09-05-generalized-reminders-design.md).
 */

export const items = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  // 'chore' | 'shopping_item' | future kinds — a plain string, not a pgEnum,
  // so a new module doesn't need a migration just to add its own value.
  itemType: text('item_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    // Relative mode (chores): N days before/after a recurring due date, at
    // a literal time. See src/modules/chores/reminder-time.ts.
    offsetDays: integer('offset_days'),
    hour: integer('hour'),
    minute: integer('minute'),
    // Absolute mode (shopping): a single literal fire time, no recurrence.
    fireAt: timestamp('fire_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'reminders_mode_check',
      sql`(${table.offsetDays} is not null and ${table.hour} is not null and ${table.minute} is not null and ${table.fireAt} is null)
       or (${table.offsetDays} is null and ${table.hour} is null and ${table.minute} is null and ${table.fireAt} is not null)`,
    ),
  ],
)
