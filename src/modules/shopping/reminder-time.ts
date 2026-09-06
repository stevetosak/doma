import { DateTime } from 'luxon'

/**
 * Pure — no repo/db import, same as chores' reminder-time.ts — so this
 * stays unit-testable without DATABASE_URL. A shopping item has no due
 * date to offset from, so its reminder is a single absolute fire time,
 * entered as a plain <input type="datetime-local"> value (household-local
 * wall-clock, no timezone info of its own).
 */
export function resolveReminderFireAt(
  localDateTime: string,
  timezone: string,
): Date {
  return DateTime.fromISO(localDateTime, { zone: timezone }).toJSDate()
}

/** The inverse — for pre-filling an existing reminder's input value. */
export function toLocalInputValue(iso: string, timezone: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' })
    .setZone(timezone)
    .toFormat("yyyy-MM-dd'T'HH:mm")
}

/** A sane default for a freshly-added blank row: one hour from now. */
export function defaultLocalInputValue(timezone: string): string {
  return DateTime.now()
    .setZone(timezone)
    .plus({ hours: 1 })
    .toFormat("yyyy-MM-dd'T'HH:mm")
}
