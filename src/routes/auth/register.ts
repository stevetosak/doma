import { createFileRoute } from '@tanstack/react-router'
import { getRequestIP } from '@tanstack/react-start/server'
import { z } from 'zod'
import { setSessionCookie } from '#/core/auth/cookies'
import { checkInviteCode, redeemInvite } from '#/core/auth/invites-repo'
import { hashPassword } from '#/core/auth/password'
import { createSession } from '#/core/auth/session-repo'
import { checkThrottle } from '#/core/auth/throttle-repo'
import { createUserWithPassword, findUserByEmail } from '#/core/auth/users-repo'
import {
  addMembership,
  createHouseholdWithOwner,
  hasAnyUsers,
} from '#/core/household/repo'

const bootstrapSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(200).optional(),
  householdName: z.string().min(1).max(200),
})

const invitedSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(200).optional(),
  inviteCode: z.string().min(1),
})

const REGISTER_WINDOW_MS = 60_000
const REGISTER_LIMIT_PER_IP = 10

export const Route = createFileRoute('/auth/register')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
        const allowed = await checkThrottle(
          `register:ip:${ip}`,
          REGISTER_WINDOW_MS,
          REGISTER_LIMIT_PER_IP,
        )
        if (!allowed) {
          return Response.json(
            { error: 'Too many requests, try again shortly.' },
            { status: 429 },
          )
        }

        const body = await request.json().catch(() => undefined)
        const bootstrap = !(await hasAnyUsers())

        if (bootstrap) {
          const parsed = bootstrapSchema.safeParse(body)
          if (!parsed.success) {
            return Response.json(
              { error: 'Invalid registration details.' },
              { status: 400 },
            )
          }
          return registerBootstrapOwner(parsed.data, request)
        }

        const parsed = invitedSchema.safeParse(body)
        if (!parsed.success) {
          // Same generic failure whether the field is missing or malformed
          // — §5.4: no enumeration of "you needed a code" vs "bad code".
          return Response.json(
            { error: 'Registration requires a valid invite code.' },
            { status: 400 },
          )
        }
        return registerWithInvite(parsed.data, request)
      },
    },
  },
})

async function registerBootstrapOwner(
  data: z.infer<typeof bootstrapSchema>,
  request: Request,
): Promise<Response> {
  const existing = await findUserByEmail(data.email)
  if (existing) {
    return Response.json(
      { error: 'An account with that email already exists.' },
      { status: 409 },
    )
  }

  const passwordHash = await hashPassword(data.password)
  const user = await createUserWithPassword({
    email: data.email,
    passwordHash,
    name: data.name,
  })
  await createHouseholdWithOwner(data.householdName, user.id)

  const { token, expiresAt } = await createSession(
    user.id,
    request.headers.get('user-agent') ?? undefined,
  )
  setSessionCookie(token, expiresAt)

  return Response.json(
    { ok: true, user: { id: user.id, email: user.email } },
    { status: 201 },
  )
}

async function registerWithInvite(
  data: z.infer<typeof invitedSchema>,
  request: Request,
): Promise<Response> {
  const inviteResult = await checkInviteCode(data.inviteCode)
  if (!inviteResult.ok) {
    // §5.4: identical response whether the code is unknown, expired, or
    // already redeemed — don't let the error shape enumerate valid codes.
    return Response.json(
      { error: 'That invite code is invalid or has expired.' },
      { status: 400 },
    )
  }

  const existing = await findUserByEmail(data.email)
  if (existing) {
    return Response.json(
      { error: 'An account with that email already exists.' },
      { status: 409 },
    )
  }

  const passwordHash = await hashPassword(data.password)
  const user = await createUserWithPassword({
    email: data.email,
    passwordHash,
    name: data.name,
  })
  await addMembership(
    inviteResult.invite.householdId,
    user.id,
    inviteResult.invite.role,
  )
  await redeemInvite(inviteResult.invite.id, user.id)

  const { token, expiresAt } = await createSession(
    user.id,
    request.headers.get('user-agent') ?? undefined,
  )
  setSessionCookie(token, expiresAt)

  return Response.json(
    { ok: true, user: { id: user.id, email: user.email } },
    { status: 201 },
  )
}
