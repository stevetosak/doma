import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { resolveAuthContext } from '#/core/auth/context'
import { createInvite } from '#/core/auth/invites-repo'
import { listMembers } from '#/core/household/members-repo'
import {
  listModuleToggles,
  setModuleEnabled,
} from '#/core/household/module-toggles-repo'
import { modules, visibleModules } from '#/modules/registry'
import type { HouseholdMember } from '#/core/household/members-repo'

export class SettingsAccessError extends Error {}

interface OwnerContext {
  userId: string
  household: { id: string; name: string }
}

/**
 * Every settings server function needs the same thing: a signed-in owner
 * of a household. Small enough (three call sites) that a shared
 * server-function middleware would be more machinery than the
 * duplication it removes — worth revisiting once a fourth call site (or
 * a module server function) needs the same check.
 */
async function requireOwner(): Promise<OwnerContext> {
  const auth = await resolveAuthContext()
  if (!auth.user || !auth.household) {
    throw new SettingsAccessError('Not signed in to a household.')
  }
  if (auth.household.role !== 'owner') {
    throw new SettingsAccessError('Owner role required.')
  }
  return {
    userId: auth.user.id,
    household: { id: auth.household.id, name: auth.household.name },
  }
}

export interface SettingsData {
  household: { id: string; name: string }
  members: HouseholdMember[]
  modules: { id: string; name: string; enabled: boolean }[]
}

export const getSettingsData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SettingsData> => {
    const { household } = await requireOwner()
    const [members, toggles] = await Promise.all([
      listMembers(household.id),
      listModuleToggles(household.id),
    ])
    const enabledIds = new Set(visibleModules(toggles).map((m) => m.id))
    return {
      household,
      members,
      modules: modules.map((m) => ({
        id: m.id,
        name: m.name,
        enabled: enabledIds.has(m.id),
      })),
    }
  },
)

const createInviteInput = z.object({
  role: z.enum(['owner', 'member']),
})

export const createInviteAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => createInviteInput.parse(input))
  .handler(async ({ data }) => {
    const { userId, household } = await requireOwner()
    return createInvite({
      householdId: household.id,
      role: data.role,
      createdBy: userId,
    })
  })

const setModuleEnabledInput = z.object({
  moduleId: z.string().min(1),
  enabled: z.boolean(),
})

export const setModuleEnabledAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => setModuleEnabledInput.parse(input))
  .handler(async ({ data }) => {
    const { household } = await requireOwner()
    await setModuleEnabled(household.id, data.moduleId, data.enabled)
    return { ok: true as const }
  })
