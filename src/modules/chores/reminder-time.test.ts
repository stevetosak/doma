import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { computeReminderAt } from './reminder-time'

const ZONE = 'Europe/Skopje'

function local(at: Date, zone = ZONE): string {
  return DateTime.fromJSDate(at, { zone }).toFormat('yyyy-MM-dd HH:mm')
}

describe('computeReminderAt', () => {
  it('offsetDays 0 lands on the due date at the given time', () => {
    expect(computeReminderAt('2026-09-05', ZONE, 0, 8, 0)).toEqual(
      expect.any(Date),
    )
    expect(local(computeReminderAt('2026-09-05', ZONE, 0, 8, 0))).toBe(
      '2026-09-05 08:00',
    )
  })

  it('counts offsetDays back from the due date, at the given time', () => {
    expect(local(computeReminderAt('2026-09-05', ZONE, -1, 19, 0))).toBe(
      '2026-09-04 19:00',
    )
    expect(local(computeReminderAt('2026-09-05', ZONE, -1, 8, 0))).toBe(
      '2026-09-04 08:00',
    )
  })

  it('honors an arbitrary hour and minute, not just whole hours', () => {
    expect(local(computeReminderAt('2026-09-05', ZONE, -3, 9, 45))).toBe(
      '2026-09-02 09:45',
    )
  })

  it('stays correct across a DST spring-forward transition', () => {
    // Europe/Skopje springs forward on 2026-03-29 — the previous day's
    // 08:00 must still land on 08:00 local, not drift by an hour because
    // of the missing clock hour ahead of it.
    expect(local(computeReminderAt('2026-03-30', ZONE, -1, 8, 0))).toBe(
      '2026-03-29 08:00',
    )
  })

  it('is timezone-aware, not server-local', () => {
    const at = computeReminderAt('2026-09-05', 'Pacific/Auckland', 0, 8, 0)
    expect(local(at, 'Pacific/Auckland')).toBe('2026-09-05 08:00')
    expect(local(at, ZONE)).not.toBe('2026-09-05 08:00')
  })
})
