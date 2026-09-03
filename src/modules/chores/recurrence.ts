import { DateTime } from 'luxon'

/**
 * Pure recurrence + assignment math (§5.3, §10). No DB, no clock reads —
 * every function takes its dates as explicit ISO strings so it's fully
 * table-driven-testable. `materialize.ts` is the impure layer that reads
 * a chore row, calls these, and writes occurrence rows.
 *
 * Dates are calendar dates (`YYYY-MM-DD`), computed via Luxon in the
 * household's IANA timezone — never via raw millisecond arithmetic on a
 * `Date`. Millisecond math on a UTC-backed `Date` reinterpreted in a
 * DST-observing zone silently lands a day off whenever the arithmetic
 * spans a DST transition; Luxon's zoned `plus({ days })` is calendar-
 * aware and doesn't have that bug (covered by the DST tests below).
 */

export type RecurrenceKind = 'once' | 'daily' | 'weekly' | 'monthly'
export type AssignmentMode = 'fixed' | 'rotating'

export interface RecurrenceRule {
  kind: RecurrenceKind
  /** Every N days/weeks/months depending on `kind`. Ignored for 'once'. */
  interval: number
  /** ISO weekdays (1 = Monday .. 7 = Sunday). Required for 'weekly'. */
  weekdays: number[] | null
  /** 1-31, clamped to the last day of a shorter month. Required for 'monthly'. */
  dayOfMonth: number | null
  startsOn: string
  endsOn: string | null
}

export interface AssignmentRule {
  mode: AssignmentMode
  assigneeUserId: string | null
  rotation: string[]
}

function toDay(iso: string, zone: string): DateTime {
  const dt = DateTime.fromISO(iso, { zone }).startOf('day')
  if (!dt.isValid) {
    throw new Error(
      `Invalid date "${iso}" in zone "${zone}": ${dt.invalidReason}`,
    )
  }
  return dt
}

function clampToMonth(monthStart: DateTime, day: number): DateTime {
  const lastDay = monthStart.daysInMonth ?? 31
  return monthStart.set({ day: Math.min(day, lastDay) })
}

/**
 * Every date `rule` recurs on within `[rangeStart, rangeEnd]` (both
 * inclusive), also bounded by the rule's own `startsOn`/`endsOn`. Sorted
 * ascending, deduplicated ISO date strings.
 */
export function occurrencesBetween(
  rule: RecurrenceRule,
  rangeStart: string,
  rangeEnd: string,
  timezone: string,
): string[] {
  const start = toDay(rule.startsOn, timezone)
  const windowStart = toDay(rangeStart, timezone)
  const windowEnd = toDay(rangeEnd, timezone)
  if (windowEnd < windowStart) return []

  const hardEnd = rule.endsOn ? toDay(rule.endsOn, timezone) : null
  const effectiveEnd = hardEnd && hardEnd < windowEnd ? hardEnd : windowEnd
  if (effectiveEnd < windowStart || effectiveEnd < start) return []

  const results: string[] = []

  switch (rule.kind) {
    case 'once': {
      if (start >= windowStart && start <= effectiveEnd) {
        results.push(start.toISODate() as string)
      }
      break
    }

    case 'daily': {
      const interval = Math.max(1, rule.interval)
      let cursor = start
      if (cursor < windowStart) {
        const daysSinceStart = Math.round(windowStart.diff(start, 'days').days)
        const steps = Math.ceil(daysSinceStart / interval)
        cursor = start.plus({ days: steps * interval })
      }
      while (cursor <= effectiveEnd) {
        if (cursor >= windowStart) results.push(cursor.toISODate() as string)
        cursor = cursor.plus({ days: interval })
      }
      break
    }

    case 'weekly': {
      const weekdays =
        rule.weekdays && rule.weekdays.length > 0
          ? rule.weekdays
          : [start.weekday]
      const interval = Math.max(1, rule.interval)
      // `.weekday` is ISO (1=Mon..7=Sun) and locale-independent in Luxon,
      // unlike `startOf('week')` — anchor on it directly rather than
      // risk a locale-dependent week boundary.
      const anchorWeekStart = start.minus({ days: start.weekday - 1 })
      let weekStart = anchorWeekStart
      while (weekStart <= effectiveEnd) {
        for (const wd of weekdays) {
          const candidate = weekStart.plus({ days: wd - 1 })
          if (
            candidate >= start &&
            candidate >= windowStart &&
            candidate <= effectiveEnd
          ) {
            results.push(candidate.toISODate() as string)
          }
        }
        weekStart = weekStart.plus({ weeks: interval })
      }
      results.sort()
      break
    }

    case 'monthly': {
      const day = rule.dayOfMonth ?? start.day
      const interval = Math.max(1, rule.interval)
      let monthStart = start.startOf('month')
      while (monthStart <= effectiveEnd) {
        const candidate = clampToMonth(monthStart, day)
        if (
          candidate >= start &&
          candidate >= windowStart &&
          candidate <= effectiveEnd
        ) {
          results.push(candidate.toISODate() as string)
        }
        monthStart = monthStart.plus({ months: interval })
      }
      break
    }
  }

  return results
}

/**
 * Who a given occurrence belongs to. For 'rotating', the index is the
 * occurrence's 1-based position in the *full* sequence since
 * `recurrence.startsOn` (not since the materializer's window start) —
 * that's what makes rotation order stable regardless of when
 * materialization happens to run. `dueOn` must itself be a real
 * occurrence of `recurrence` (callers pass dates that came out of
 * `occurrencesBetween`).
 */
export function assigneeForOccurrence(
  recurrence: RecurrenceRule,
  assignment: AssignmentRule,
  dueOn: string,
  timezone: string,
): string | null {
  if (assignment.mode === 'fixed') return assignment.assigneeUserId
  if (assignment.rotation.length === 0) return null

  const occurrencesSoFar = occurrencesBetween(
    recurrence,
    recurrence.startsOn,
    dueOn,
    timezone,
  )
  const index = occurrencesSoFar.length - 1
  const position = index < 0 ? 0 : index % assignment.rotation.length
  return assignment.rotation[position] ?? null
}
