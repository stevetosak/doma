import { describe, expect, it } from 'vitest'
import {
  defaultLocalInputValue,
  resolveReminderFireAt,
  toLocalInputValue,
} from './reminder-time'

describe('resolveReminderFireAt', () => {
  it('interprets a datetime-local string in the given zone', () => {
    const result = resolveReminderFireAt('2026-03-15T18:00', 'Europe/Skopje')
    expect(result.toISOString()).toBe('2026-03-15T17:00:00.000Z')
  })

  it('is timezone-aware — the same local string means a different instant elsewhere', () => {
    const skopje = resolveReminderFireAt('2026-03-15T18:00', 'Europe/Skopje')
    const auckland = resolveReminderFireAt(
      '2026-03-15T18:00',
      'Pacific/Auckland',
    )
    expect(skopje.getTime()).not.toBe(auckland.getTime())
  })

  it('handles a DST spring-forward date correctly', () => {
    // Europe/Skopje goes CET (+1) -> CEST (+2) at 2026-03-29 02:00 local.
    const before = resolveReminderFireAt('2026-03-29T01:00', 'Europe/Skopje')
    const after = resolveReminderFireAt('2026-03-29T03:00', 'Europe/Skopje')
    expect(after.getTime() - before.getTime()).toBe(60 * 60 * 1000) // 1h wall-clock gap = 1h real gap (the 02:00-03:00 hour doesn't exist)
  })
})

describe('toLocalInputValue / resolveReminderFireAt round-trip', () => {
  it('round-trips through the same zone', () => {
    const original = '2026-06-01T09:30'
    const asDate = resolveReminderFireAt(original, 'Europe/Skopje')
    expect(toLocalInputValue(asDate.toISOString(), 'Europe/Skopje')).toBe(
      original,
    )
  })
})

describe('defaultLocalInputValue', () => {
  it('returns a well-formed datetime-local string', () => {
    const value = defaultLocalInputValue('Europe/Skopje')
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })
})
