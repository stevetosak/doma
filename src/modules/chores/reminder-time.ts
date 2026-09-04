import { DateTime } from 'luxon'

/**
 * Pure — no repo/db import — so this stays unit-testable the same way
 * recurrence.ts is, without needing DATABASE_URL in the test environment.
 * See reminders.ts for the DB-touching scheduling that uses it.
 */

// due_on is a bare date (§5.3) with no time component, so reminders need a
// nominal daily anchor to count back from. 08:00 household-local reads as
// "when this is due" without claiming a precision the data doesn't have —
// reminderLeadMinutes is minutes *before* this anchor on the due date.
const NOMINAL_DUE_HOUR = 8

export function computeReminderAt(
  dueOn: string,
  timezone: string,
  leadMinutes: number,
): Date {
  const dueAt = DateTime.fromISO(dueOn, { zone: timezone }).set({
    hour: NOMINAL_DUE_HOUR,
    minute: 0,
    second: 0,
    millisecond: 0,
  })
  return dueAt.minus({ minutes: leadMinutes }).toJSDate()
}
