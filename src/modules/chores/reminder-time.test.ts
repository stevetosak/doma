import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { computeReminderAt } from './reminder-time'

const ZONE = 'Europe/Skopje'

function local(at: Date, zone = ZONE): string {
  return DateTime.fromJSDate(at, { zone }).toFormat('yyyy-MM-dd HH:mm')
}

describe('computeReminderAt', () => {
  it('lead 0 lands on the nominal 08:00 due-day anchor', () => {
    expect(computeReminderAt('2026-09-05', ZONE, 0)).toEqual(expect.any(Date))
    expect(local(computeReminderAt('2026-09-05', ZONE, 0))).toBe(
      '2026-09-05 08:00',
    )
  })

  it('counts lead minutes back from that anchor, into the previous day', () => {
    expect(local(computeReminderAt('2026-09-05', ZONE, 780))).toBe(
      '2026-09-04 19:00',
    )
    expect(local(computeReminderAt('2026-09-05', ZONE, 1440))).toBe(
      '2026-09-04 08:00',
    )
  })

  it('stays correct across a DST spring-forward transition', () => {
    // Europe/Skopje springs forward on 2026-03-29 — the previous day's
    // 08:00 anchor must still land on 08:00 local, not drift by an hour
    // because of the missing clock hour ahead of it.
    expect(local(computeReminderAt('2026-03-30', ZONE, 1440))).toBe(
      '2026-03-29 08:00',
    )
  })

  it('is timezone-aware, not server-local', () => {
    const at = computeReminderAt('2026-09-05', 'Pacific/Auckland', 0)
    expect(local(at, 'Pacific/Auckland')).toBe('2026-09-05 08:00')
    // The same instant reads as a different wall-clock time elsewhere.
    expect(local(at, ZONE)).not.toBe('2026-09-05 08:00')
  })
})
