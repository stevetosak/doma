import { getChore, insertOccurrenceIfMissing } from './repo'
import { assigneeForOccurrence, occurrencesBetween } from './recurrence'
import type { AssignmentRule, RecurrenceRule } from './recurrence'
import { addDays, todayInZone } from './time'

/**
 * How far ahead to generate occurrences. Nightly re-materialization
 * (`chores.materialize`, keeping this window rolling forward every day)
 * is M8's pg-boss job — for M5 this runs once, synchronously, right
 * after a chore is created, which is enough to satisfy this milestone's
 * own bar ("a weekly rotating chore generates the correct occurrences").
 */
const MATERIALIZE_WINDOW_DAYS = 60

/**
 * Idempotent by construction (§10): `insertOccurrenceIfMissing` collides
 * on `chore_occurrences`' UNIQUE(chore_id, due_on) instead of duplicating,
 * so calling this twice for the same chore is a no-op the second time.
 */
export async function materializeChoreOccurrences(
  choreId: string,
  householdId: string,
  timezone: string,
): Promise<void> {
  const chore = await getChore(choreId, householdId)
  if (!chore) return

  const recurrence: RecurrenceRule = {
    kind: chore.recurrenceKind,
    interval: chore.interval,
    weekdays: chore.weekdays,
    dayOfMonth: chore.dayOfMonth,
    startsOn: chore.startsOn,
    endsOn: chore.endsOn,
  }
  const assignment: AssignmentRule = {
    mode: chore.assignmentMode,
    assigneeUserId: chore.assigneeUserId,
    rotation: chore.rotation ?? [],
  }

  const today = todayInZone(timezone)
  const rangeStart = chore.startsOn < today ? today : chore.startsOn
  const rangeEnd = addDays(today, MATERIALIZE_WINDOW_DAYS, timezone)

  const dueDates = occurrencesBetween(
    recurrence,
    rangeStart,
    rangeEnd,
    timezone,
  )
  for (const dueOn of dueDates) {
    const assigneeUserId = assigneeForOccurrence(
      recurrence,
      assignment,
      dueOn,
      timezone,
    )
    await insertOccurrenceIfMissing(householdId, choreId, dueOn, assigneeUserId)
  }
}
