import { createFileRoute } from '@tanstack/react-router'
import { getRequestIP } from '@tanstack/react-start/server'
import { z } from 'zod'
import { setSessionCookie } from '#/core/auth/cookies'
import { verifyDummyPassword, verifyPassword } from '#/core/auth/password'
import {
  createSession,
  revokeAllSessionsForUser,
} from '#/core/auth/session-repo'
import { checkThrottle } from '#/core/auth/throttle-repo'
import { findUserByEmail, touchLastSeen } from '#/core/auth/users-repo'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const LOGIN_WINDOW_MS = 60_000
const LOGIN_LIMIT = 10

export const Route = createFileRoute('/auth/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = loginSchema.safeParse(
          await request.json().catch(() => undefined),
        )
        if (!parsed.success) {
          return Response.json(
            { error: 'Invalid email or password.' },
            { status: 400 },
          )
        }
        const { email, password } = parsed.data

        const ip = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
        // §5.4: throttled on both email and IP.
        const [ipAllowed, emailAllowed] = await Promise.all([
          checkThrottle(`login:ip:${ip}`, LOGIN_WINDOW_MS, LOGIN_LIMIT),
          checkThrottle(`login:email:${email}`, LOGIN_WINDOW_MS, LOGIN_LIMIT),
        ])
        if (!ipAllowed || !emailAllowed) {
          return Response.json(
            { error: 'Too many attempts, try again shortly.' },
            { status: 429 },
          )
        }

        const user = await findUserByEmail(email)

        // Always run a real argon2 verify, even when the user or their
        // password hash doesn't exist — a Google-only user has no
        // passwordHash — so response time doesn't leak account existence.
        const passwordMatches = user?.passwordHash
          ? await verifyPassword(user.passwordHash, password)
          : await verifyDummyPassword()

        if (!user || !passwordMatches) {
          return Response.json(
            { error: 'Invalid email or password.' },
            { status: 401 },
          )
        }

        // Session rotation on privilege change (login).
        await revokeAllSessionsForUser(user.id)
        const { token, expiresAt } = await createSession(
          user.id,
          request.headers.get('user-agent') ?? undefined,
        )
        setSessionCookie(token, expiresAt)
        await touchLastSeen(user.id)

        return Response.json({
          ok: true,
          user: { id: user.id, email: user.email },
        })
      },
    },
  },
})
