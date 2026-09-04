import { DateTime } from 'luxon'

/** "Today" as an ISO date in the household's own timezone — not the server's. */
export function todayInZone(timezone: string): string {
  return DateTime.now().setZone(timezone).toISODate() as string
}

export function addDays(iso: string, days: number, timezone: string): string {
  return DateTime.fromISO(iso, { zone: timezone })
    .plus({ days })
    .toISODate() as string
}

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** "Mon 09-07" — bare MM-DD dates read slower than a recognizable weekday. */
export function formatDateWithWeekday(iso: string, timezone: string): string {
  const weekday = DateTime.fromISO(iso, { zone: timezone }).weekday
  return `${WEEKDAY_SHORT[weekday - 1]} ${iso.slice(5)}`
}
