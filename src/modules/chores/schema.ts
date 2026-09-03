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

/**
 * Chores module (M5, §5.3). `reminder_lead_minutes` from the plan's draft
 * column list is deliberately not here yet — nothing reads it until M8's
 * reminder jobs exist, same call as trimming ModuleManifest's unused
 * `widgets`/`jobs`/`onEnable` fields in M4. Add it via its own migration
 * once M8 has a consumer.
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
  id: uuid('id').primaryKey().defaultRandom(),
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
