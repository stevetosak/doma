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
