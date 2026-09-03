import { createFileRoute } from '@tanstack/react-router'
import { clearSessionCookie, readSessionToken } from '#/core/auth/cookies'
import { revokeSessionByToken } from '#/core/auth/session-repo'

export const Route = createFileRoute('/auth/logout')({
  server: {
    handlers: {
      // Idempotent — logging out with no session, or an already-expired
      // one, still succeeds.
      POST: async () => {
        const token = readSessionToken()
        if (token) {
          await revokeSessionByToken(token)
        }
        clearSessionCookie()
        return Response.json({ ok: true })
      },
    },
  },
})
