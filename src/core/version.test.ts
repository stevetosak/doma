import { describe, expect, it } from 'vitest'
import { appVersion } from './version'

describe('appVersion', () => {
  it('returns APP_VERSION when set', () => {
    expect(appVersion({ APP_VERSION: 'v0.3.0-5-gabc1234' })).toBe(
      'v0.3.0-5-gabc1234',
    )
  })

  it('returns a bare release tag unchanged', () => {
    expect(appVersion({ APP_VERSION: 'v0.3.0' })).toBe('v0.3.0')
  })

  it('falls back to "dev" when unset', () => {
    expect(appVersion({})).toBe('dev')
  })

  it('falls back to "dev" when blank/whitespace', () => {
    expect(appVersion({ APP_VERSION: '  ' })).toBe('dev')
  })
})
