import {
  boolean,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { households } from '#/core/household/schema'
import { users } from '#/core/auth/schema'

/**
 * Shopping module (M6, §5.3). Two columns from the plan's draft column
 * list are deliberately not here — same "no unused-consumer field" call
 * as M5's `reminder_lead_minutes`: `shopping_lists.sort` and
 * `shopping_items.sort`, since v1 auto-provisions one list per household
 * and doesn't build multi-list or manual item reordering UI. Add them
 * back if/when a real consumer exists. `shopping_categories.sort` stays
 * — aisle order is the actual point of that table, and the UI drives it
 * with real up/down controls.
 */

export const shoppingLists = pgTable('shopping_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const shoppingCategories = pgTable('shopping_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
})

export const shoppingItems = pgTable('shopping_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  listId: uuid('list_id')
    .notNull()
    .references(() => shoppingLists.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  quantity: numeric('quantity', { mode: 'number' }),
  unit: text('unit'),
  note: text('note'),
  categoryId: uuid('category_id').references(() => shoppingCategories.id, {
    onDelete: 'set null',
  }),
  isChecked: boolean('is_checked').notNull().default(false),
  checkedBy: uuid('checked_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  checkedAt: timestamp('checked_at', { withTimezone: true }),
  addedBy: uuid('added_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const shoppingItemHistory = pgTable(
  'shopping_item_history',
  {
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    nameNormalized: text('name_normalized').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    useCount: integer('use_count').notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.householdId, table.nameNormalized] }),
  ],
)
