import { describe, expect, it } from 'vitest'
import { assigneeForOccurrence, occurrencesBetween } from './recurrence'
import type { AssignmentRule, RecurrenceRule } from './recurrence'

const ZONE = 'Europe/Skopje'

function rule(overrides: Partial<RecurrenceRule>): RecurrenceRule {
  return {
    kind: 'daily',
    interval: 1,
    weekdays: null,
    dayOfMonth: null,
    startsOn: '2026-01-01',
    endsOn: null,
    ...overrides,
  }
}

describe('occurrencesBetween — once', () => {
  it('returns the single date when it falls in range', () => {
    const r = rule({ kind: 'once', startsOn: '2026-03-10' })
    expect(occurrencesBetween(r, '2026-01-01', '2026-12-31', ZONE)).toEqual([
      '2026-03-10',
    ])
  })

  it('returns nothing when the date is outside the range', () => {
    const r = rule({ kind: 'once', startsOn: '2026-03-10' })
    expect(occurrencesBetween(r, '2026-04-01', '2026-12-31', ZONE)).toEqual([])
  })
})

describe('occurrencesBetween — daily', () => {
  it('every day for interval 1', () => {
    const r = rule({ kind: 'daily', interval: 1, startsOn: '2026-06-01' })
    expect(occurrencesBetween(r, '2026-06-01', '2026-06-05', ZONE)).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
    ])
  })

  it('every 3rd day, staying on the interval grid when the window starts later', () => {
    const r = rule({ kind: 'daily', interval: 3, startsOn: '2026-06-01' })
    // grid: 06-01, 06-04, 06-07, 06-10 ...
    expect(occurrencesBetween(r, '2026-06-05', '2026-06-11', ZONE)).toEqual([
      '2026-06-07',
      '2026-06-10',
    ])
  })

  it('respects starts_on/ends_on boundaries', () => {
    const r = rule({
      kind: 'daily',
      interval: 1,
      startsOn: '2026-06-01',
      endsOn: '2026-06-03',
    })
    expect(occurrencesBetween(r, '2026-05-01', '2026-07-01', ZONE)).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
    ])
  })
})

describe('occurrencesBetween — weekly', () => {
  it('a single weekday, weekly', () => {
    // 2026-06-01 is a Monday
    const r = rule({
      kind: 'weekly',
      interval: 1,
      weekdays: [1],
      startsOn: '2026-06-01',
    })
    expect(occurrencesBetween(r, '2026-06-01', '2026-06-22', ZONE)).toEqual([
      '2026-06-01',
      '2026-06-08',
      '2026-06-15',
      '2026-06-22',
    ])
  })

  it('multiple weekdays in the same week, sorted chronologically', () => {
    const r = rule({
      kind: 'weekly',
      interval: 1,
      weekdays: [7, 1], // Sunday, Monday — deliberately out of order
      startsOn: '2026-06-01', // Monday
    })
    expect(occurrencesBetween(r, '2026-06-01', '2026-06-14', ZONE)).toEqual([
      '2026-06-01', // Mon
      '2026-06-07', // Sun
      '2026-06-08', // Mon
      '2026-06-14', // Sun
    ])
  })

  it('every 2nd week, anchored on the week containing starts_on', () => {
    const r = rule({
      kind: 'weekly',
      interval: 2,
      weekdays: [3], // Wednesday
      startsOn: '2026-06-01', // Monday, week 0
    })
    // week 0 Wed = 06-03 (included), week 1 skipped, week 2 Wed = 06-17
    expect(occurrencesBetween(r, '2026-06-01', '2026-06-24', ZONE)).toEqual([
      '2026-06-03',
      '2026-06-17',
    ])
  })

  it('excludes an in-week weekday that falls before starts_on', () => {
    // starts_on is a Wednesday; the rule's own week also contains Monday
    // and Tuesday, which must not produce occurrences before starts_on.
    const r = rule({
      kind: 'weekly',
      interval: 1,
      weekdays: [1, 3], // Monday, Wednesday
      startsOn: '2026-06-03', // Wednesday
    })
    expect(occurrencesBetween(r, '2026-06-01', '2026-06-09', ZONE)).toEqual([
      '2026-06-03',
      '2026-06-08', // following Monday
    ])
  })
})

describe('occurrencesBetween — monthly', () => {
  it('clamps the 31st to the last day of a shorter month', () => {
    const r = rule({
      kind: 'monthly',
      interval: 1,
      dayOfMonth: 31,
      startsOn: '2026-01-31',
    })
    expect(occurrencesBetween(r, '2026-01-01', '2026-03-31', ZONE)).toEqual([
      '2026-01-31',
      '2026-02-28', // 2026 is not a leap year
      '2026-03-31',
    ])
  })

  it('every 3rd month', () => {
    const r = rule({
      kind: 'monthly',
      interval: 3,
      dayOfMonth: 15,
      startsOn: '2026-01-15',
    })
    expect(occurrencesBetween(r, '2026-01-01', '2026-12-31', ZONE)).toEqual([
      '2026-01-15',
      '2026-04-15',
      '2026-07-15',
      '2026-10-15',
    ])
  })
})

describe('occurrencesBetween — DST transitions in Europe/Skopje', () => {
  // Spring-forward: 2026-03-29 (clocks jump 02:00 -> 03:00, a 23h day).
  it('a daily chore does not skip or duplicate a day across spring-forward', () => {
    const r = rule({ kind: 'daily', interval: 1, startsOn: '2026-03-27' })
    expect(occurrencesBetween(r, '2026-03-27', '2026-03-31', ZONE)).toEqual([
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
    ])
  })

  it('a weekly Sunday chore still lands exactly on the spring-forward Sunday', () => {
    const r = rule({
      kind: 'weekly',
      interval: 1,
      weekdays: [7],
      startsOn: '2026-03-15', // Sunday
    })
    expect(occurrencesBetween(r, '2026-03-15', '2026-04-05', ZONE)).toEqual([
      '2026-03-15',
      '2026-03-22',
      '2026-03-29', // the DST-transition Sunday itself
      '2026-04-05',
    ])
  })

  // Fall-back: 2026-10-25 (clocks fall 03:00 -> 02:00, a 25h day).
  it('a daily chore does not skip or duplicate a day across fall-back', () => {
    const r = rule({ kind: 'daily', interval: 1, startsOn: '2026-10-23' })
    expect(occurrencesBetween(r, '2026-10-23', '2026-10-27', ZONE)).toEqual([
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
    ])
  })

  it('an every-3-days chore stays on its interval grid across fall-back', () => {
    const r = rule({ kind: 'daily', interval: 3, startsOn: '2026-10-19' })
    expect(occurrencesBetween(r, '2026-10-19', '2026-10-31', ZONE)).toEqual([
      '2026-10-19',
      '2026-10-22',
      '2026-10-25', // the DST-transition day itself
      '2026-10-28',
      '2026-10-31',
    ])
  })
})

describe('assigneeForOccurrence', () => {
  const weeklyRule = rule({
    kind: 'weekly',
    interval: 1,
    weekdays: [1],
    startsOn: '2026-06-01', // occurrences: 06-01, 06-08, 06-15, 06-22, ...
  })

  it('fixed assignment always returns the fixed assignee, regardless of date', () => {
    const assignment: AssignmentRule = {
      mode: 'fixed',
      assigneeUserId: 'user-a',
      rotation: [],
    }
    expect(
      assigneeForOccurrence(weeklyRule, assignment, '2026-06-01', ZONE),
    ).toBe('user-a')
    expect(
      assigneeForOccurrence(weeklyRule, assignment, '2026-06-22', ZONE),
    ).toBe('user-a')
  })

  it('rotating assignment cycles through the rotation in occurrence order', () => {
    const assignment: AssignmentRule = {
      mode: 'rotating',
      assigneeUserId: null,
      rotation: ['a', 'b', 'c'],
    }
    expect(
      assigneeForOccurrence(weeklyRule, assignment, '2026-06-01', ZONE),
    ).toBe('a')
    expect(
      assigneeForOccurrence(weeklyRule, assignment, '2026-06-08', ZONE),
    ).toBe('b')
    expect(
      assigneeForOccurrence(weeklyRule, assignment, '2026-06-15', ZONE),
    ).toBe('c')
    // wraps back to the start of the rotation
    expect(
      assigneeForOccurrence(weeklyRule, assignment, '2026-06-22', ZONE),
    ).toBe('a')
    expect(
      assigneeForOccurrence(weeklyRule, assignment, '2026-06-29', ZONE),
    ).toBe('b')
  })

  it('rotating with a single-person rotation always returns that person', () => {
    const assignment: AssignmentRule = {
      mode: 'rotating',
      assigneeUserId: null,
      rotation: ['solo'],
    }
    expect(
      assigneeForOccurrence(weeklyRule, assignment, '2026-06-15', ZONE),
    ).toBe('solo')
  })

  it('rotating with an empty rotation returns null rather than throwing', () => {
    const assignment: AssignmentRule = {
      mode: 'rotating',
      assigneeUserId: null,
      rotation: [],
    }
    expect(
      assigneeForOccurrence(weeklyRule, assignment, '2026-06-01', ZONE),
    ).toBeNull()
  })
})
