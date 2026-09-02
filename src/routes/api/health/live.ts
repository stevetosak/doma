import { createFileRoute } from '@tanstack/react-router'

/**
 * Liveness — process-only. Must never touch Postgres: a liveness probe that
 * can fail because the database is briefly unreachable turns a database
 * blip into a pod restart loop. `/api/health` (readiness) is the endpoint
 * that checks Postgres.
 */
export const Route = createFileRoute('/api/health/live')({
  server: {
    handlers: {
      GET: () => Response.json({ status: 'ok' }),
    },
  },
})
