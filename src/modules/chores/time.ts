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
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * "Tue 8 Sep" — bare MM-DD dates read slower than a recognizable weekday,
 * and the month is worth spelling out since occurrence strips can span
 * month boundaries. Pass `showMonth: false` in a strip once a chip's month
 * matches the one before it (§2.6) — standalone callers (a card's "due"
 * line, a filed occurrence) always want the month, so it defaults to true.
 */
export function formatDateWithWeekday(
  iso: string,
  timezone: string,
  { showMonth = true }: { showMonth?: boolean } = {},
): string {
  const dt = DateTime.fromISO(iso, { zone: timezone })
  const weekday = WEEKDAY_SHORT[dt.weekday - 1]
  const day = dt.day
  return showMonth
    ? `${weekday} ${day} ${MONTH_SHORT[dt.month - 1]}`
    : `${weekday} ${day}`
}

/** The calendar month (1-12) a date falls in, for the strip's
 * month-repeats-on-change rule — plain string slicing, no timezone
 * conversion needed since the iso dates here are already zone-resolved. */
export function monthOf(iso: string): number {
  return Number(iso.slice(5, 7))
}
