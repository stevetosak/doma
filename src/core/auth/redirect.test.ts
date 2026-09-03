import { describe, expect, it } from 'vitest'
import { redirectResponse, sanitizeRedirectTarget } from './redirect'

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

describe('redirectResponse', () => {
  it('sets status and Location', () => {
    const res = redirectResponse('https://example.com/x')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://example.com/x')
  })

  it('defaults to a mutable Headers object, unlike Response.redirect()', () => {
    const res = redirectResponse('https://example.com/x')
    expect(() => res.headers.delete('Location')).not.toThrow()
  })

  it('accepts a custom status', () => {
    const res = redirectResponse('/login', 303)
    expect(res.status).toBe(303)
  })
})
