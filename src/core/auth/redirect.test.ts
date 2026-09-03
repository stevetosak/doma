import { describe, expect, it } from 'vitest'
import { sanitizeRedirectTarget } from './redirect'

describe('sanitizeRedirectTarget', () => {
  it('accepts a root-relative path', () => {
    expect(sanitizeRedirectTarget('/settings')).toBe('/settings')
  })

  it('falls back to / for undefined or empty', () => {
    expect(sanitizeRedirectTarget(undefined)).toBe('/')
    expect(sanitizeRedirectTarget(null)).toBe('/')
    expect(sanitizeRedirectTarget('')).toBe('/')
  })

  it('refuses a scheme-relative target (open redirect)', () => {
    expect(sanitizeRedirectTarget('//evil.example.com')).toBe('/')
  })

  it('refuses an absolute URL', () => {
    expect(sanitizeRedirectTarget('https://evil.example.com')).toBe('/')
  })

  it('refuses a target with no leading slash', () => {
    expect(sanitizeRedirectTarget('settings')).toBe('/')
  })
})
