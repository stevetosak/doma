import { DateTime } from 'luxon'

/**
 * Pure — no repo/db import — so this stays unit-testable the same way
 * recurrence.ts is, without needing DATABASE_URL in the test environment.
 * See reminders.ts for the DB-touching scheduling that uses it.
 */
export function computeReminderAt(
  dueOn: string,
  timezone: string,
  offsetDays: number,
  hour: number,
  minute: number,
): Date {
  return DateTime.fromISO(dueOn, { zone: timezone })
    .plus({ days: offsetDays })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toJSDate()
}
