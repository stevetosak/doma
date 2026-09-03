import { createServerFn } from '@tanstack/react-start'
import { resolveAuthContext } from '#/core/auth/context'
import { listMembers } from '#/core/household/members-repo'
import { listChoresWithOccurrences } from '#/modules/chores/repo'
import { todayInZone } from '#/modules/chores/time'
import { getOrCreateDefaultList, listItems } from '#/modules/shopping/repo'

export class TodayAccessError extends Error {}

export interface TodayCard {
  id: string
  module: 'chores' | 'shopping'
  title: string
  subtitle: string | null
  dueLabel: 'Overdue' | 'Today' | null
  overdue: boolean
  href: '/chores' | '/shopping'
}

export interface TodayData {
  householdName: string
  cards: TodayCard[]
}

export const getTodayData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TodayData> => {
    const auth = await resolveAuthContext()
    if (!auth.user || !auth.household) {
      throw new TodayAccessError('Not signed in to a household.')
    }
    const { id: householdId, timezone, name } = auth.household
    const today = todayInZone(timezone)

    const [choreList, members, listId] = await Promise.all([
      listChoresWithOccurrences(householdId, today),
      listMembers(householdId),
      getOrCreateDefaultList(householdId),
    ])
    const items = await listItems(householdId, listId)

    const memberName = new Map(
      members.map((m) => [m.userId, m.name ?? m.email]),
    )

    const choreCards: TodayCard[] = []
    for (const chore of choreList) {
      for (const occ of chore.occurrences) {
        if (occ.status !== 'pending' || occ.dueOn > today) continue
        choreCards.push({
          id: occ.id,
          module: 'chores',
          title: chore.title,
          subtitle: occ.assigneeUserId
            ? (memberName.get(occ.assigneeUserId) ?? null)
            : null,
          dueLabel: occ.dueOn < today ? 'Overdue' : 'Today',
          overdue: occ.dueOn < today,
          href: '/chores',
        })
      }
    }
    choreCards.sort((a, b) => Number(b.overdue) - Number(a.overdue))

    const uncheckedItems = items.filter((item) => !item.isChecked)
    const shoppingCard: TodayCard[] =
      uncheckedItems.length > 0
        ? [
            {
              id: 'shopping-list',
              module: 'shopping',
              title: `${uncheckedItems.length} to buy`,
              subtitle: uncheckedItems
                .slice(0, 4)
                .map((i) => i.name)
                .join(', '),
              dueLabel: null,
              overdue: false,
              href: '/shopping',
            },
          ]
        : []

    return {
      householdName: name,
      cards: [...choreCards, ...shoppingCard],
    }
  },
)
