import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * HMAC-signs an arbitrary string so it round-trips through a cookie the
 * client holds without being forgeable — used for the short-lived OAuth
 * state cookie (§5.4: "stash {state, verifier, returnTo, inviteCode?} in a
 * signed, HttpOnly, 10-minute cookie"). Not encryption: the payload is
 * still readable, just tamper-evident.
 */
export function signPayload(payload: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${mac}`
}

export function verifySignedPayload(
  value: string,
  secret: string,
): string | undefined {
  const dot = value.indexOf('.')
  if (dot === -1) return undefined

  const encodedPayload = value.slice(0, dot)
  const mac = value.slice(dot + 1)
  const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8')
  const expectedMac = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url')

  const macBuf = Buffer.from(mac)
  const expectedBuf = Buffer.from(expectedMac)
  if (
    macBuf.length !== expectedBuf.length ||
    !timingSafeEqual(macBuf, expectedBuf)
  ) {
    return undefined
  }
  return payload
}
