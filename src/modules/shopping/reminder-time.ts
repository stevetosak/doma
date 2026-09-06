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

/**
 * Absolute reminder presets (§2.9 — items get presets too, phrased
 * absolutely since there's no due date to offset from).
 */
export function tonightLocalInputValue(timezone: string): string {
  return DateTime.now()
    .setZone(timezone)
    .set({ hour: 18, minute: 0, second: 0, millisecond: 0 })
    .toFormat("yyyy-MM-dd'T'HH:mm")
}

export function tomorrowMorningLocalInputValue(timezone: string): string {
  return DateTime.now()
    .setZone(timezone)
    .plus({ days: 1 })
    .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
    .toFormat("yyyy-MM-dd'T'HH:mm")
}

/** Luxon weekday 6 = Saturday. Rolls to next week if today's already past it. */
export function nextSaturdayMorningLocalInputValue(timezone: string): string {
  const now = DateTime.now().setZone(timezone)
  let target = now.set({
    weekday: 6,
    hour: 10,
    minute: 0,
    second: 0,
    millisecond: 0,
  })
  if (target <= now) target = target.plus({ weeks: 1 })
  return target.toFormat("yyyy-MM-dd'T'HH:mm")
}
