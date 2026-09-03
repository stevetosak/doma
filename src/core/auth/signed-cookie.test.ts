import { describe, expect, it } from 'vitest'
import { signPayload, verifySignedPayload } from './signed-cookie'

const secret = 'test-secret-do-not-use-in-prod'

describe('signPayload / verifySignedPayload', () => {
  it('round-trips a payload', () => {
    const signed = signPayload('{"state":"abc"}', secret)
    expect(verifySignedPayload(signed, secret)).toBe('{"state":"abc"}')
  })

  it('rejects a tampered payload', () => {
    const signed = signPayload('{"state":"abc"}', secret)
    const [encoded] = signed.split('.')
    if (encoded === undefined)
      throw new Error('unreachable — signPayload always includes a separator')
    const tamperedPayload = Buffer.from('{"state":"evil"}', 'utf8').toString(
      'base64url',
    )
    const tampered = `${tamperedPayload}.${signed.slice(encoded.length + 1)}`
    expect(verifySignedPayload(tampered, secret)).toBeUndefined()
  })

  it('rejects a value signed with a different secret', () => {
    const signed = signPayload('{"state":"abc"}', secret)
    expect(verifySignedPayload(signed, 'a-different-secret')).toBeUndefined()
  })

  it('rejects a malformed value with no separator', () => {
    expect(verifySignedPayload('not-signed-at-all', secret)).toBeUndefined()
  })
})
