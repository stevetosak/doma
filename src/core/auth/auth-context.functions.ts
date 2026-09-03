import { createServerFn } from '@tanstack/react-start'
import { resolveAuthContext } from '#/core/auth/context'
import { hasAnyUsers } from '#/core/household/repo'

/** What the root route's `beforeLoad` calls (§5.4) — SSR-first auth context. */
export const getAuthContext = createServerFn({ method: 'GET' }).handler(
  async () => {
    return resolveAuthContext()
  },
)

/** Drives the register page: bootstrap mode (no users yet) asks for a household name instead of an invite code. */
export const isBootstrapMode = createServerFn({ method: 'GET' }).handler(
  async () => {
    return !(await hasAnyUsers())
  },
)
