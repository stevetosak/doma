import { createRouter as createTanStackRouter } from '@tanstack/react-router'
// Type-only: pulls @tanstack/start-client-core's declaration merge (the
// `server` option on createFileRoute) into the program. Nothing in this repo
// otherwise imports @tanstack/react-start's types, so without this, plain
// `tsc` (unlike the Vite plugin) doesn't know server route files exist.
import type {} from '@tanstack/react-start'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
