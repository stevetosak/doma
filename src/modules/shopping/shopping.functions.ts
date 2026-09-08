import { createServerFn } from '@tanstack/react-start'
import { DateTime } from 'luxon'
import { z } from 'zod'
import { resolveAuthContext } from '#/core/auth/context'
import { publish } from '#/core/events/hub'
import { listMembers } from '#/core/household/members-repo'
import type { HouseholdMember } from '#/core/household/members-repo'
import { replaceRemindersForItem } from '#/core/items/repo'
import { resolveReminderFireAt } from '#/modules/shopping/reminder-time'
import { scheduleRemindersForItem } from '#/modules/shopping/reminders'
import {
  addItem,
  createCategory,
  deleteCategory,
  getItem,
  getOrCreateDefaultList,
  listCategories,
  listItems,
  listRecentlyBought,
  moveItem,
  removeItem,
  renameCategory,
  reorderCategories,
  setItemChecked,
  setItemPriority,
  updateItem,
} from '#/modules/shopping/repo'
import type {
  CategoryView,
  ItemView,
  RecentlyBoughtView,
} from '#/modules/shopping/repo'

const itemPriority = z.enum(['low', 'medium', 'high'])

export class ShoppingAccessError extends Error {}

interface MemberContext {
  userId: string
  householdId: string
  timezone: string
}

async function requireMember(): Promise<MemberContext> {
  const auth = await resolveAuthContext()
  if (!auth.user || !auth.household) {
    throw new ShoppingAccessError('Not signed in to a household.')
  }
  return {
    userId: auth.user.id,
    householdId: auth.household.id,
    timezone: auth.household.timezone,
  }
}

export interface ShoppingData {
  listId: string
  items: ItemView[]
  categories: CategoryView[]
  recentlyBought: RecentlyBoughtView[]
  members: HouseholdMember[]
  timezone: string
}

export const getShoppingData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ShoppingData> => {
    const { householdId, timezone } = await requireMember()
    const listId = await getOrCreateDefaultList(householdId)
    const [items, categories, recentlyBought, members] = await Promise.all([
      listItems(householdId, listId),
      listCategories(householdId),
      listRecentlyBought(householdId, listId),
      listMembers(householdId),
    ])
    return { listId, items, categories, recentlyBought, members, timezone }
  },
)

const addItemInput = z.object({
  listId: z.string().uuid(),
  name: z.string().min(1).max(200),
  quantity: z.number().positive().optional(),
  unit: z.string().max(50).optional(),
  note: z.string().max(500).optional(),
  priority: itemPriority.optional(),
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
  priority: itemPriority.optional(),
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

const moveItemInput = z.object({
  itemId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  orderedItemIds: z.array(z.string().uuid()).max(200),
})

export const moveItemAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => moveItemInput.parse(input))
  .handler(async ({ data }) => {
    const { householdId } = await requireMember()
    await moveItem(householdId, data)
    publish(householdId, {
      module: 'shopping',
      entity: 'item',
      action: 'updated',
    })
    return { ok: true as const }
  })

export const MAX_ITEM_REMINDERS = 6

const itemReminderInput = z.object({
  fireAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .refine((value) => DateTime.fromISO(value).isValid, {
      message: 'Invalid date or time.',
    }),
})

const setItemRemindersInput = z.object({
  itemId: z.string().uuid(),
  reminders: z.array(itemReminderInput).max(MAX_ITEM_REMINDERS),
})

export const setItemRemindersAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => setItemRemindersInput.parse(input))
  .handler(async ({ data }) => {
    const { userId, householdId, timezone } = await requireMember()
    const item = await getItem(data.itemId, householdId)
    if (!item) {
      throw new ShoppingAccessError('That item no longer exists.')
    }
    await replaceRemindersForItem(
      data.itemId,
      householdId,
      data.reminders.map((r) => ({
        fireAt: resolveReminderFireAt(r.fireAt, timezone),
      })),
    )
    await scheduleRemindersForItem(data.itemId, householdId, userId, item.name)
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

const setItemPriorityInput = z.object({
  itemId: z.string().uuid(),
  priority: itemPriority.nullable(),
})

// The dedicated priority sheet (§2.12) writes here directly, independent
// of the full edit form's addItemInput/updateItemInput round-trip.
export const setItemPriorityAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => setItemPriorityInput.parse(input))
  .handler(async ({ data }) => {
    const { householdId } = await requireMember()
    await setItemPriority(data.itemId, householdId, data.priority)
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

const reorderCategoriesInput = z.object({
  orderedIds: z.array(z.string().uuid()).max(100),
})

export const reorderCategoriesAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => reorderCategoriesInput.parse(input))
  .handler(async ({ data }) => {
    const { householdId } = await requireMember()
    await reorderCategories(householdId, data.orderedIds)
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

const createCategoryInput = z.object({
  name: z.string().trim().min(1).max(100),
})

export const createCategoryAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => createCategoryInput.parse(input))
  .handler(async ({ data }) => {
    const { householdId } = await requireMember()
    const result = await createCategory(householdId, data.name)
    publish(householdId, {
      module: 'shopping',
      entity: 'category',
      action: 'created',
    })
    return result
  })

const renameCategoryInput = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
})

export const renameCategoryAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => renameCategoryInput.parse(input))
  .handler(async ({ data }) => {
    const { householdId } = await requireMember()
    await renameCategory(householdId, data.categoryId, data.name)
    publish(householdId, {
      module: 'shopping',
      entity: 'category',
      action: 'updated',
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
