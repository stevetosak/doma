import { and, eq, gte, lte, or } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { householdScope } from '#/core/db/household-scope'
import { choreOccurrences, chores } from './schema'
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
}

/**
 * Every active chore in the household with its occurrences due on or
 * before `windowEnd`, plus any still-pending occurrence regardless of
 * date (so an overdue chore stays visible instead of quietly scrolling
 * off). Two queries + an in-memory group-by — household scale is a
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
