import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { resolveAuthContext } from '#/core/auth/context'
import {
  addItem,
  getOrCreateDefaultList,
  listCategories,
  listItems,
  listRecentlyBought,
  removeItem,
  reorderCategory,
  setItemChecked,
} from '#/modules/shopping/repo'
import type {
  CategoryView,
  ItemView,
  RecentlyBoughtView,
} from '#/modules/shopping/repo'

export class ShoppingAccessError extends Error {}

interface MemberContext {
  userId: string
  householdId: string
}

async function requireMember(): Promise<MemberContext> {
  const auth = await resolveAuthContext()
  if (!auth.user || !auth.household) {
    throw new ShoppingAccessError('Not signed in to a household.')
  }
  return { userId: auth.user.id, householdId: auth.household.id }
}

export interface ShoppingData {
  listId: string
  items: ItemView[]
  categories: CategoryView[]
  recentlyBought: RecentlyBoughtView[]
}

export const getShoppingData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ShoppingData> => {
    const { householdId } = await requireMember()
    const listId = await getOrCreateDefaultList(householdId)
    const [items, categories, recentlyBought] = await Promise.all([
      listItems(householdId, listId),
      listCategories(householdId),
      listRecentlyBought(householdId, listId),
    ])
    return { listId, items, categories, recentlyBought }
  },
)

const addItemInput = z.object({
  listId: z.string().uuid(),
  name: z.string().min(1).max(200),
  quantity: z.number().positive().optional(),
  unit: z.string().max(50).optional(),
  note: z.string().max(500).optional(),
  categoryName: z.string().min(1).max(100).optional(),
})

export const addItemAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => addItemInput.parse(input))
  .handler(async ({ data }) => {
    const { userId, householdId } = await requireMember()
    const id = await addItem({ householdId, addedBy: userId, ...data })
    return { id }
  })

const setItemCheckedInput = z.object({
  itemId: z.string().uuid(),
  checked: z.boolean(),
})

export const setItemCheckedAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => setItemCheckedInput.parse(input))
  .handler(async ({ data }) => {
    const { userId, householdId } = await requireMember()
    await setItemChecked(data.itemId, householdId, data.checked, userId)
    return { ok: true as const }
  })

const removeItemInput = z.object({
  itemId: z.string().uuid(),
})

export const removeItemAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => removeItemInput.parse(input))
  .handler(async ({ data }) => {
    const { householdId } = await requireMember()
    await removeItem(data.itemId, householdId)
    return { ok: true as const }
  })

const reorderCategoryInput = z.object({
  categoryId: z.string().uuid(),
  direction: z.enum(['up', 'down']),
})

export const reorderCategoryAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => reorderCategoryInput.parse(input))
  .handler(async ({ data }) => {
    const { householdId } = await requireMember()
    await reorderCategory(householdId, data.categoryId, data.direction)
    return { ok: true as const }
  })

const reAddItemInput = z.object({
  listId: z.string().uuid(),
  name: z.string().min(1).max(200),
})

export const reAddItemAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => reAddItemInput.parse(input))
  .handler(async ({ data }) => {
    const { userId, householdId } = await requireMember()
    const id = await addItem({
      householdId,
      listId: data.listId,
      name: data.name,
      addedBy: userId,
    })
    return { id }
  })
