import { createFileRoute } from '@tanstack/react-router'
import { resolveAuthContext } from '#/core/auth/context'
import { subscribe } from '#/core/events/hub'

const HEARTBEAT_INTERVAL_MS = 20_000

/**
 * `text/event-stream` for the signed-in household (§5.6). The service
 * worker must never intercept this route — see public/sw.js.
 */
export const Route = createFileRoute('/api/events')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await resolveAuthContext()
        if (!auth.user || !auth.household) {
          return new Response('Unauthorized', { status: 401 })
        }
        const householdId = auth.household.id

        const encoder = new TextEncoder()
        let heartbeat: ReturnType<typeof setInterval> | undefined
        let unsubscribe: (() => void) | undefined

        const stream = new ReadableStream({
          start(controller) {
            const safeEnqueue = (chunk: string) => {
              try {
                controller.enqueue(encoder.encode(chunk))
              } catch {
                // Controller already closed (client gone) — cleanup runs
                // via the abort listener below; this just avoids an
                // unhandled throw from a write that lost the race.
                cleanup()
              }
            }

            unsubscribe = subscribe(householdId, (event) => {
              safeEnqueue(`data: ${JSON.stringify(event)}\n\n`)
            })

            heartbeat = setInterval(() => {
              safeEnqueue(': heartbeat\n\n')
            }, HEARTBEAT_INTERVAL_MS)

            function cleanup() {
              if (heartbeat) clearInterval(heartbeat)
              unsubscribe?.()
              try {
                controller.close()
              } catch {
                // already closed
              }
            }

            request.signal.addEventListener('abort', cleanup)
          },
        })

        return new Response(stream, {
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          },
        })
      },
    },
  },
})
