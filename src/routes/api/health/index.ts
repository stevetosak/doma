import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'

import { db } from '#/core/db/client'
import { optionalEnv } from '#/core/env'

/**
 * Readiness — checks Postgres. This is the one that should gate traffic
 * (k8s readiness probe); `/api/health/live` is the liveness probe and must
 * stay database-free.
 */
export const Route = createFileRoute('/api/health/')({
  server: {
    handlers: {
      GET: async () => {
        const version = optionalEnv('GIT_SHA', 'dev').slice(0, 7)
        try {
          await db.execute(sql`select 1`)
          return Response.json({ status: 'ok', db: 'connected', version })
        } catch (err) {
          console.error('Readiness check failed:', err)
          return Response.json(
            { status: 'error', db: 'unreachable', version },
            { status: 503 },
          )
        }
      },
    },
  },
})
