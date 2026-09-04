import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { resolveAuthContext } from '#/core/auth/context'
import { publish } from '#/core/events/hub'
import { listMembers } from '#/core/household/members-repo'
import type { HouseholdMember } from '#/core/household/members-repo'
import {
  addItem,
  deleteCategory,
  getOrCreateDefaultList,
  listCategories,
  listItems,
  listRecentlyBought,
  removeItem,
  reorderCategory,
  setItemChecked,
  updateItem,
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
  members: HouseholdMember[]
}

export const getShoppingData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ShoppingData> => {
    const { householdId } = await requireMember()
    const listId = await getOrCreateDefaultList(householdId)
    const [items, categories, recentlyBought, members] = await Promise.all([
      listItems(householdId, listId),
      listCategories(householdId),
      listRecentlyBought(householdId, listId),
      listMembers(householdId),
    ])
    return { listId, items, categories, recentlyBought, members }
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
    publish(householdId, {
      module: 'shopping',
      entity: 'item',
      action: 'created',
    })
    return { id }
  })

const updateItemInput = z.object({
  itemId: z.string().uuid(),
  name: z.string().min(1).max(200),
  quantity: z.number().positive().optional(),
  unit: z.string().max(50).optional(),
  note: z.string().max(500).optional(),
  categoryName: z.string().min(1).max(100).optional(),
})

export const updateItemAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => updateItemInput.parse(input))
  .handler(async ({ data }) => {
    const { householdId } = await requireMember()
    await updateItem({ householdId, ...data })
    publish(householdId, {
      module: 'shopping',
      entity: 'item',
      action: 'updated',
    })
    return { ok: true as const }
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
    publish(householdId, {
      module: 'shopping',
      entity: 'item',
      action: 'updated',
    })
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
    publish(householdId, {
      module: 'shopping',
      entity: 'item',
      action: 'deleted',
    })
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
    publish(householdId, {
      module: 'shopping',
      entity: 'category',
      action: 'updated',
    })
    return { ok: true as const }
  })

const deleteCategoryInput = z.object({
  categoryId: z.string().uuid(),
})

export const deleteCategoryAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => deleteCategoryInput.parse(input))
  .handler(async ({ data }) => {
    const { householdId } = await requireMember()
    await deleteCategory(householdId, data.categoryId)
    publish(householdId, {
      module: 'shopping',
      entity: 'category',
      action: 'deleted',
    })
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
    publish(householdId, {
      module: 'shopping',
      entity: 'item',
      action: 'created',
    })
    return { id }
  })
