import { describe, expect, it, afterEach } from 'vitest'
import { requireEnv, optionalEnv } from './env'

describe('requireEnv', () => {
  const KEY = '__DOMA_TEST_REQUIRED__'

  afterEach(() => {
    delete process.env[KEY]
  })

  it('returns the value when set', () => {
    process.env[KEY] = 'postgres://example'
    expect(requireEnv(KEY)).toBe('postgres://example')
  })

  it('throws a descriptive error when unset', () => {
    delete process.env[KEY]
    expect(() => requireEnv(KEY)).toThrow(/__DOMA_TEST_REQUIRED__/)
  })

  it('throws when set to an empty/whitespace string', () => {
    process.env[KEY] = '   '
    expect(() => requireEnv(KEY)).toThrow()
  })
})

describe('optionalEnv', () => {
  const KEY = '__DOMA_TEST_OPTIONAL__'

  afterEach(() => {
    delete process.env[KEY]
  })

  it('returns the value when set', () => {
    process.env[KEY] = '4000'
    expect(optionalEnv(KEY, '3000')).toBe('4000')
  })

  it('returns the fallback when unset', () => {
    delete process.env[KEY]
    expect(optionalEnv(KEY, '3000')).toBe('3000')
  })
})
