import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { resolveAuthContext } from '#/core/auth/context'
import { publish } from '#/core/events/hub'
import { listMembers } from '#/core/household/members-repo'
import type { HouseholdMember } from '#/core/household/members-repo'
import { materializeChoreOccurrences } from '#/modules/chores/materialize'
import {
  archiveChore,
  createChore,
  deletePendingOccurrencesFrom,
  listChoresWithOccurrences,
  setOccurrenceStatus,
  updateChore,
} from '#/modules/chores/repo'
import { addDays, todayInZone } from '#/modules/chores/time'
import type { ChoreView } from '#/modules/chores/repo'

export class ChoresAccessError extends Error {}

interface MemberContext {
  userId: string
  household: { id: string; timezone: string }
}

/**
 * Any signed-in household member can use chores (unlike settings.functions'
 * requireOwner — there's no owner-only surface here).
 */
async function requireMember(): Promise<MemberContext> {
  const auth = await resolveAuthContext()
  if (!auth.user || !auth.household) {
    throw new ChoresAccessError('Not signed in to a household.')
  }
  return {
    userId: auth.user.id,
    household: { id: auth.household.id, timezone: auth.household.timezone },
  }
}

const OCCURRENCE_LIST_WINDOW_DAYS = 14

export interface ChoresData {
  chores: ChoreView[]
  members: HouseholdMember[]
}

export const getChoresData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ChoresData> => {
    const { household } = await requireMember()
    const windowEnd = addDays(
      todayInZone(household.timezone),
      OCCURRENCE_LIST_WINDOW_DAYS,
      household.timezone,
    )
    const [choreList, members] = await Promise.all([
      listChoresWithOccurrences(household.id, windowEnd),
      listMembers(household.id),
    ])
    return { chores: choreList, members }
  },
)

const createChoreInput = z
  .object({
    title: z.string().min(1).max(200),
    notes: z.string().max(2000).optional(),
    recurrenceKind: z.enum(['once', 'daily', 'weekly', 'monthly']),
    interval: z.number().int().min(1).default(1),
    weekdays: z.array(z.number().int().min(1).max(7)).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endsOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    assignmentMode: z.enum(['fixed', 'rotating']),
    assigneeUserId: z.string().uuid().optional(),
    rotation: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (data) =>
      data.assignmentMode === 'fixed'
        ? Boolean(data.assigneeUserId)
        : (data.rotation?.length ?? 0) > 0,
    {
      message:
        'Fixed assignment needs an assignee; rotating needs at least one person in the rotation.',
    },
  )
  .refine(
    (data) =>
      data.recurrenceKind !== 'weekly' || (data.weekdays?.length ?? 0) > 0,
    {
      message: 'Weekly chores need at least one weekday.',
    },
  )
  .refine(
    (data) => data.recurrenceKind !== 'monthly' || data.dayOfMonth != null,
    {
      message: 'Monthly chores need a day of month.',
    },
  )

export const createChoreAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => createChoreInput.parse(input))
  .handler(async ({ data }) => {
    const { userId, household } = await requireMember()
    const choreId = await createChore({
      householdId: household.id,
      createdBy: userId,
      ...data,
    })
    await materializeChoreOccurrences(choreId, household.id, household.timezone)
    publish(household.id, {
      module: 'chores',
      entity: 'chore',
      action: 'created',
    })
    return { id: choreId }
  })

const updateChoreInput = createChoreInput.and(
  z.object({ choreId: z.string().uuid() }),
)

export const updateChoreAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => updateChoreInput.parse(input))
  .handler(async ({ data }) => {
    const { household } = await requireMember()
    const { choreId, ...fields } = data
    await updateChore(choreId, household.id, fields)
    await deletePendingOccurrencesFrom(
      choreId,
      household.id,
      todayInZone(household.timezone),
    )
    await materializeChoreOccurrences(choreId, household.id, household.timezone)
    publish(household.id, {
      module: 'chores',
      entity: 'chore',
      action: 'updated',
    })
    return { ok: true as const }
  })

const archiveChoreInput = z.object({ choreId: z.string().uuid() })

export const archiveChoreAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => archiveChoreInput.parse(input))
  .handler(async ({ data }) => {
    const { household } = await requireMember()
    await archiveChore(data.choreId, household.id)
    publish(household.id, {
      module: 'chores',
      entity: 'chore',
      action: 'deleted',
    })
    return { ok: true as const }
  })

const setOccurrenceStatusInput = z.object({
  occurrenceId: z.string().uuid(),
  status: z.enum(['pending', 'done', 'skipped']),
})

export const setOccurrenceStatusAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => setOccurrenceStatusInput.parse(input))
  .handler(async ({ data }) => {
    const { userId, household } = await requireMember()
    await setOccurrenceStatus(
      data.occurrenceId,
      household.id,
      data.status,
      userId,
    )
    publish(household.id, {
      module: 'chores',
      entity: 'occurrence',
      action: 'updated',
    })
    return { ok: true as const }
  })
