import { and, eq, gte, lte, or } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { householdScope } from '#/core/db/household-scope'
import { households } from '#/core/household/schema'
import { choreOccurrences, choreReminders, chores } from './schema'
import type { AssignmentMode, RecurrenceKind } from './recurrence'

export interface CreateChoreInput {
  householdId: string
  title: string
  notes?: string
  recurrenceKind: RecurrenceKind
  interval: number
  weekdays?: number[]
  dayOfMonth?: number
  startsOn: string
  endsOn?: string
  assignmentMode: AssignmentMode
  assigneeUserId?: string
  rotation?: string[]
  createdBy: string
}

export async function createChore(input: CreateChoreInput): Promise<string> {
  const [row] = await db
    .insert(chores)
    .values({
      householdId: input.householdId,
      title: input.title,
      notes: input.notes ?? null,
      recurrenceKind: input.recurrenceKind,
      interval: input.interval,
      weekdays: input.weekdays ?? null,
      dayOfMonth: input.dayOfMonth ?? null,
      startsOn: input.startsOn,
      endsOn: input.endsOn ?? null,
      assignmentMode: input.assignmentMode,
      assigneeUserId: input.assigneeUserId ?? null,
      rotation: input.rotation ?? null,
      createdBy: input.createdBy,
    })
    .returning({ id: chores.id })
  if (!row) throw new Error('Insert did not return a row')
  return row.id
}

export type UpdateChoreInput = Omit<
  CreateChoreInput,
  'householdId' | 'createdBy'
>

export async function updateChore(
  choreId: string,
  householdId: string,
  input: UpdateChoreInput,
): Promise<void> {
  await db
    .update(chores)
    .set({
      title: input.title,
      notes: input.notes ?? null,
      recurrenceKind: input.recurrenceKind,
      interval: input.interval,
      weekdays: input.weekdays ?? null,
      dayOfMonth: input.dayOfMonth ?? null,
      startsOn: input.startsOn,
      endsOn: input.endsOn ?? null,
      assignmentMode: input.assignmentMode,
      assigneeUserId: input.assigneeUserId ?? null,
      rotation: input.rotation ?? null,
    })
    .where(householdScope(chores, householdId, eq(chores.id, choreId)))
}

export async function archiveChore(
  choreId: string,
  householdId: string,
): Promise<void> {
  await db
    .update(chores)
    .set({ isArchived: true })
    .where(householdScope(chores, householdId, eq(chores.id, choreId)))
}

/**
 * Clears not-yet-due-or-decided occurrences from `fromDate` on so an edit
 * (recurrence/assignment change) can re-materialize a consistent future —
 * `done`/`skipped` history is never touched, only `pending` rows.
 */
export async function deletePendingOccurrencesFrom(
  choreId: string,
  householdId: string,
  fromDate: string,
): Promise<void> {
  await db
    .delete(choreOccurrences)
    .where(
      householdScope(
        choreOccurrences,
        householdId,
        and(
          eq(choreOccurrences.choreId, choreId),
          eq(choreOccurrences.status, 'pending'),
          gte(choreOccurrences.dueOn, fromDate),
        ),
      ),
    )
}

export interface ChoreRow {
  id: string
  householdId: string
  title: string
  notes: string | null
  recurrenceKind: RecurrenceKind
  interval: number
  weekdays: number[] | null
  dayOfMonth: number | null
  startsOn: string
  endsOn: string | null
  assignmentMode: AssignmentMode
  assigneeUserId: string | null
  rotation: string[] | null
  createdBy: string | null
}

export interface ReminderInput {
  offsetDays: number
  hour: number
  minute: number
}

export interface ReminderRow extends ReminderInput {
  id: string
}

/**
 * Wipe-and-recreate, matching deletePendingOccurrencesFrom's own
 * delete-then-rebuild convention — the edit form always submits the whole
 * desired set in one shot, there's no per-row CRUD surface for reminders
 * the way there is for shopping items. Transactional so a failed insert
 * never leaves a chore's reminders deleted-but-not-replaced.
 */
export async function replaceChoreReminders(
  choreId: string,
  householdId: string,
  reminders: ReminderInput[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(choreReminders)
      .where(
        householdScope(
          choreReminders,
          householdId,
          eq(choreReminders.choreId, choreId),
        ),
      )
    // db.insert(...).values([]) is invalid — an empty array just means the
    // delete above already leaves the chore reminder-less.
    if (reminders.length === 0) return
    await tx.insert(choreReminders).values(
      reminders.map((r) => ({
        householdId,
        choreId,
        offsetDays: r.offsetDays,
        hour: r.hour,
        minute: r.minute,
      })),
    )
  })
}

export async function listRemindersForChore(
  choreId: string,
  householdId: string,
): Promise<ReminderRow[]> {
  return db
    .select({
      id: choreReminders.id,
      offsetDays: choreReminders.offsetDays,
      hour: choreReminders.hour,
      minute: choreReminders.minute,
    })
    .from(choreReminders)
    .where(
      householdScope(
        choreReminders,
        householdId,
        eq(choreReminders.choreId, choreId),
      ),
    )
    .orderBy(
      choreReminders.offsetDays,
      choreReminders.hour,
      choreReminders.minute,
    )
}

export async function getChore(
  choreId: string,
  householdId: string,
): Promise<ChoreRow | undefined> {
  const [row] = await db
    .select()
    .from(chores)
    .where(householdScope(chores, householdId, eq(chores.id, choreId)))
  return row
}

export interface ChoreOccurrenceView {
  id: string
  dueOn: string
  status: 'pending' | 'done' | 'skipped'
  assigneeUserId: string | null
}

export interface ChoreReminderView {
  id: string
  offsetDays: number
  hour: number
  minute: number
}

export interface ChoreView {
  id: string
  title: string
  notes: string | null
  recurrenceKind: RecurrenceKind
  interval: number
  weekdays: number[] | null
  dayOfMonth: number | null
  startsOn: string
  endsOn: string | null
  assignmentMode: AssignmentMode
  assigneeUserId: string | null
  rotation: string[] | null
  createdBy: string | null
  occurrences: ChoreOccurrenceView[]
  reminders: ChoreReminderView[]
}

/**
 * Every active chore in the household with its occurrences due on or
 * before `windowEnd`, plus any still-pending occurrence regardless of
 * date (so an overdue chore stays visible instead of quietly scrolling
 * off). Three flat queries + in-memory group-bys — household scale is a
 * handful of chores, not worth a join for.
 */
export async function listChoresWithOccurrences(
  householdId: string,
  windowEnd: string,
): Promise<ChoreView[]> {
  const choreRows = await db
    .select()
    .from(chores)
    .where(householdScope(chores, householdId, eq(chores.isArchived, false)))

  const occurrenceRows = await db
    .select()
    .from(choreOccurrences)
    .where(
      householdScope(
        choreOccurrences,
        householdId,
        or(
          lte(choreOccurrences.dueOn, windowEnd),
          eq(choreOccurrences.status, 'pending'),
        ),
      ),
    )
    .orderBy(choreOccurrences.dueOn)

  const reminderRows = await db
    .select()
    .from(choreReminders)
    .where(householdScope(choreReminders, householdId))
    .orderBy(
      choreReminders.offsetDays,
      choreReminders.hour,
      choreReminders.minute,
    )

  const occurrencesByChore = new Map<string, ChoreOccurrenceView[]>()
  for (const occ of occurrenceRows) {
    const list = occurrencesByChore.get(occ.choreId) ?? []
    list.push({
      id: occ.id,
      dueOn: occ.dueOn,
      status: occ.status,
      assigneeUserId: occ.assigneeUserId,
    })
    occurrencesByChore.set(occ.choreId, list)
  }

  const remindersByChore = new Map<string, ChoreReminderView[]>()
  for (const r of reminderRows) {
    const list = remindersByChore.get(r.choreId) ?? []
    list.push({
      id: r.id,
      offsetDays: r.offsetDays,
      hour: r.hour,
      minute: r.minute,
    })
    remindersByChore.set(r.choreId, list)
  }

  return choreRows.map((chore) => ({
    id: chore.id,
    title: chore.title,
    notes: chore.notes,
    recurrenceKind: chore.recurrenceKind,
    interval: chore.interval,
    weekdays: chore.weekdays,
    dayOfMonth: chore.dayOfMonth,
    startsOn: chore.startsOn,
    endsOn: chore.endsOn,
    assignmentMode: chore.assignmentMode,
    assigneeUserId: chore.assigneeUserId,
    rotation: chore.rotation,
    createdBy: chore.createdBy,
    occurrences: occurrencesByChore.get(chore.id) ?? [],
    reminders: remindersByChore.get(chore.id) ?? [],
  }))
}

export async function setOccurrenceStatus(
  occurrenceId: string,
  householdId: string,
  status: 'pending' | 'done' | 'skipped',
  actingUserId: string,
): Promise<void> {
  await db
    .update(choreOccurrences)
    .set({
      status,
      completedBy: status === 'done' ? actingUserId : null,
      completedAt: status === 'done' ? new Date() : null,
    })
    .where(
      householdScope(
        choreOccurrences,
        householdId,
        eq(choreOccurrences.id, occurrenceId),
      ),
    )
}

export async function insertOccurrenceIfMissing(
  householdId: string,
  choreId: string,
  dueOn: string,
  assigneeUserId: string | null,
): Promise<void> {
  await db
    .insert(choreOccurrences)
    .values({ householdId, choreId, dueOn, assigneeUserId })
    .onConflictDoNothing({
      target: [choreOccurrences.choreId, choreOccurrences.dueOn],
    })
}

export interface ActiveChoreRef {
  choreId: string
  householdId: string
  timezone: string
}

/**
 * Every non-archived chore across every household, with its household's
 * timezone — the nightly `chores.materialize` job's driving list (§8's
 * "chores.materialize — nightly cron", the M8 job M5 deferred). Unscoped
 * by design: this runs as a system job, not inside a request, so there's
 * no single household to scope it to.
 */
export async function listActiveChoresAcrossHouseholds(): Promise<
  ActiveChoreRef[]
> {
  const rows = await db
    .select({
      choreId: chores.id,
      householdId: chores.householdId,
      timezone: households.timezone,
    })
    .from(chores)
    .innerJoin(households, eq(households.id, chores.householdId))
    .where(eq(chores.isArchived, false))
  return rows
}

export interface PendingOccurrenceRef {
  id: string
  dueOn: string
  assigneeUserId: string | null
}

export async function listPendingOccurrencesForChore(
  choreId: string,
  householdId: string,
): Promise<PendingOccurrenceRef[]> {
  return db
    .select({
      id: choreOccurrences.id,
      dueOn: choreOccurrences.dueOn,
      assigneeUserId: choreOccurrences.assigneeUserId,
    })
    .from(choreOccurrences)
    .where(
      householdScope(
        choreOccurrences,
        householdId,
        and(
          eq(choreOccurrences.choreId, choreId),
          eq(choreOccurrences.status, 'pending'),
        ),
      ),
    )
}
