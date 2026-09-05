import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { households } from '#/core/household/schema'
import { users } from '#/core/auth/schema'
import { items } from '#/core/items/schema'

/**
 * Chores module (M5, §5.3). Reminders live in the shared `reminders`
 * table (M9, `#/core/items/schema`) — `chores.id` is itself a reference
 * into the shared `items` table rather than a self-generated uuid, which
 * is what lets a reminder point at "this chore" with a real, DB-enforced
 * FK regardless of which module owns the item. See
 * src/modules/chores/reminder-time.ts / reminders.ts for the scheduling
 * that reads reminders back out.
 */

export const choreRecurrenceKind = pgEnum('chore_recurrence_kind', [
  'once',
  'daily',
  'weekly',
  'monthly',
])

export const choreAssignmentMode = pgEnum('chore_assignment_mode', [
  'fixed',
  'rotating',
])

export const choreOccurrenceStatus = pgEnum('chore_occurrence_status', [
  'pending',
  'done',
  'skipped',
])

export const chores = pgTable('chores', {
  id: uuid('id')
    .primaryKey()
    .references(() => items.id, { onDelete: 'cascade' }),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  notes: text('notes'),
  recurrenceKind: choreRecurrenceKind('recurrence_kind').notNull(),
  interval: integer('interval').notNull().default(1),
  weekdays: integer('weekdays').array(),
  dayOfMonth: integer('day_of_month'),
  startsOn: date('starts_on', { mode: 'string' }).notNull(),
  endsOn: date('ends_on', { mode: 'string' }),
  assignmentMode: choreAssignmentMode('assignment_mode').notNull(),
  assigneeUserId: uuid('assignee_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  rotation: uuid('rotation').array(),
  createdBy: uuid('created_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const choreOccurrences = pgTable(
  'chore_occurrences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    choreId: uuid('chore_id')
      .notNull()
      .references(() => chores.id, { onDelete: 'cascade' }),
    dueOn: date('due_on', { mode: 'string' }).notNull(),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: choreOccurrenceStatus('status').notNull().default('pending'),
    completedBy: uuid('completed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  // The materializer's idempotency key (§10): re-running it for a chore
  // must not create duplicate occurrences for the same due date.
  (table) => [
    uniqueIndex('chore_occurrences_chore_due_on_key').on(
      table.choreId,
      table.dueOn,
    ),
  ],
)
