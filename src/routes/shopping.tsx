import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLiveSync } from '#/core/events/useLiveSync'
import { useHouseholdMutation } from '#/core/mutations/useHouseholdMutation'
import {
  addItemAction,
  getShoppingData,
  reAddItemAction,
  removeItemAction,
  reorderCategoryAction,
  setItemCheckedAction,
} from '#/modules/shopping/shopping.functions'
import type {
  CategoryView,
  ItemView,
  RecentlyBoughtView,
} from '#/modules/shopping/repo'

export const Route = createFileRoute('/shopping')({
  beforeLoad: ({ context }) => {
    if (!context.auth.user) {
      throw redirect({
        to: '/login',
        search: { returnTo: '/shopping', error: undefined },
      })
    }
    if (!context.auth.household) {
      throw redirect({ to: '/' })
    }
  },
  loader: () => getShoppingData(),
  component: ShoppingPage,
})

function capitalize(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s
}

function ShoppingPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  useLiveSync()

  async function refresh() {
    await router.invalidate({ sync: true })
  }

  const grouped = new Map<string | null, ItemView[]>()
  for (const item of data.items) {
    const key = item.categoryId
    const list = grouped.get(key) ?? []
    list.push(item)
    grouped.set(key, list)
  }

  const orderedGroups: { category: CategoryView | null; items: ItemView[] }[] =
    [
      ...data.categories.map((category) => ({
        category,
        items: grouped.get(category.id) ?? [],
      })),
      ...(grouped.has(null)
        ? [{ category: null, items: grouped.get(null) ?? [] }]
        : []),
    ].filter((g) => g.items.length > 0)

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold">Shopping</h1>

      <ItemGroups groups={orderedGroups} onChange={refresh} />
      <RecentlyBought
        listId={data.listId}
        suggestions={data.recentlyBought}
        onChange={refresh}
      />
      <NewItemForm listId={data.listId} onCreated={refresh} />
      <CategoryOrder categories={data.categories} onChange={refresh} />
    </div>
  )
}

function ItemGroups({
  groups,
  onChange,
}: {
  groups: { category: CategoryView | null; items: ItemView[] }[]
  onChange: () => Promise<void>
}) {
  if (groups.length === 0) {
    return (
      <p className="mt-6 text-sm">The list is empty — add something below.</p>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.category?.id ?? 'uncategorized'}>
          <h2 className="text-lg font-semibold">
            {group.category?.name ?? 'Uncategorized'}
          </h2>
          <ul className="mt-2 flex flex-col gap-1">
            {group.items.map((item) => (
              <ItemRow key={item.id} item={item} onChange={onChange} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ItemRow({
  item,
  onChange,
}: {
  item: ItemView
  onChange: () => Promise<void>
}) {
  const { status, error, run } = useHouseholdMutation()

  async function toggleChecked(checked: boolean) {
    await run(() =>
      setItemCheckedAction({ data: { itemId: item.id, checked } }),
    )
    await onChange()
  }

  async function handleRemove() {
    await removeItemAction({ data: { itemId: item.id } })
    await onChange()
  }

  return (
    <li className="flex items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={item.isChecked}
        disabled={status === 'pending' || status === 'retrying'}
        onChange={(e) => toggleChecked(e.target.checked)}
      />
      <span className={item.isChecked ? 'line-through' : ''}>
        {item.name}
        {item.quantity != null &&
          ` — ${item.quantity}${item.unit ? ` ${item.unit}` : ''}`}
        {item.note && ` (${item.note})`}
      </span>
      {status === 'retrying' && (
        <span className="text-amber-700">not saved — retrying…</span>
      )}
      {status === 'error' && error && (
        <span className="text-red-700">{error}</span>
      )}
      <button className="border px-2 py-0.5 ml-auto" onClick={handleRemove}>
        Remove
      </button>
    </li>
  )
}

function RecentlyBought({
  listId,
  suggestions,
  onChange,
}: {
  listId: string
  suggestions: RecentlyBoughtView[]
  onChange: () => Promise<void>
}) {
  if (suggestions.length === 0) return null

  return (
    <section className="mt-8 border-t pt-6">
      <h2 className="text-lg font-semibold">Recently bought</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s.nameNormalized}
            className="border px-2 py-1 text-sm"
            onClick={async () => {
              await reAddItemAction({
                data: { listId, name: s.nameNormalized },
              })
              await onChange()
            }}
          >
            + {capitalize(s.nameNormalized)}
          </button>
        ))}
      </div>
    </section>
  )
}

function NewItemForm({
  listId,
  onCreated,
}: {
  listId: string
  onCreated: () => Promise<void>
}) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [note, setNote] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await addItemAction({
        data: {
          listId,
          name,
          quantity: quantity ? Number(quantity) : undefined,
          unit: unit || undefined,
          note: note || undefined,
          categoryName: categoryName || undefined,
        },
      })
      setName('')
      setQuantity('')
      setUnit('')
      setNote('')
      await onCreated()
    } catch {
      setError('Could not add the item — check the fields above.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mt-8 border-t pt-6">
      <h2 className="text-lg font-semibold">Add item</h2>
      <form
        onSubmit={handleSubmit}
        className="mt-3 flex flex-wrap gap-2 items-end"
      >
        <label className="flex flex-col gap-1">
          Name
          <input
            className="border p-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          Qty
          <input
            type="number"
            step="any"
            min={0}
            className="border p-1 w-20"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          Unit
          <input
            className="border p-1 w-20"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          Note
          <input
            className="border p-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          Category (aisle)
          <input
            className="border p-1"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="border px-3 py-1"
        >
          Add
        </button>
      </form>
      {error && <p className="mt-2 text-red-700">{error}</p>}
    </section>
  )
}

function CategoryOrder({
  categories,
  onChange,
}: {
  categories: CategoryView[]
  onChange: () => Promise<void>
}) {
  if (categories.length === 0) return null

  return (
    <section className="mt-8 border-t pt-6">
      <h2 className="text-lg font-semibold">Aisle order</h2>
      <ul className="mt-2 flex flex-col gap-1">
        {categories.map((category, index) => (
          <li key={category.id} className="flex items-center gap-2 text-sm">
            <span className="w-40">{category.name}</span>
            <button
              className="border px-2 py-0.5"
              disabled={index === 0}
              onClick={async () => {
                await reorderCategoryAction({
                  data: { categoryId: category.id, direction: 'up' },
                })
                await onChange()
              }}
            >
              Up
            </button>
            <button
              className="border px-2 py-0.5"
              disabled={index === categories.length - 1}
              onClick={async () => {
                await reorderCategoryAction({
                  data: { categoryId: category.id, direction: 'down' },
                })
                await onChange()
              }}
            >
              Down
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
