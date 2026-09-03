import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { AppShell } from '#/core/ui/AppShell'
import { DoneStack } from '#/core/ui/DoneStack'
import { FlipCard } from '#/core/ui/FlipCard'
import { MutationStatus } from '#/core/ui/MutationStatus'
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

function itemLine(item: ItemView): string {
  const qty =
    item.quantity != null
      ? ` — ${item.quantity}${item.unit ? ` ${item.unit}` : ''}`
      : ''
  return `${item.name}${qty}`
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
    if (item.isChecked) continue
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

  const checkedItems = data.items.filter((i) => i.isChecked)

  return (
    <AppShell>
      <h1 className="font-display text-4xl text-ink">Shopping</h1>

      {orderedGroups.length === 0 ? (
        <p className="mt-8 text-ink-dim">
          The list is empty — add something below.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {orderedGroups.map((group) => (
            <section key={group.category?.id ?? 'uncategorized'}>
              <h2 className="font-mono text-xs font-semibold tracking-wide text-kraft-ink uppercase">
                {group.category?.name ?? 'Uncategorized'}
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {group.items.map((item) => (
                  <ItemCard key={item.id} item={item} onChange={refresh} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <DoneStack
        label="already bought"
        items={checkedItems.map((item) => ({
          id: item.id,
          content: itemLine(item),
        }))}
      />

      <RecentlyBought
        listId={data.listId}
        suggestions={data.recentlyBought}
        onChange={refresh}
      />
      <NewItemForm listId={data.listId} onCreated={refresh} />
      <CategoryOrder categories={data.categories} onChange={refresh} />
    </AppShell>
  )
}

function ItemCard({
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

  const busy = status === 'pending' || status === 'retrying'

  return (
    <FlipCard
      accent="neutral"
      flipLabel="details"
      front={
        <>
          <p className="text-lg text-ink">{item.name}</p>
          {(item.quantity != null || item.unit) && (
            <p className="mt-1 font-mono text-xs text-ink-dim">
              {item.quantity ?? ''} {item.unit ?? ''}
            </p>
          )}
        </>
      }
      back={
        <div className="flex flex-col gap-3">
          {item.note && <p className="text-sm text-ink-dim">{item.note}</p>}
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={item.isChecked}
              disabled={busy}
              onChange={(e) => toggleChecked(e.target.checked)}
            />
            Got it
          </label>
          <button
            type="button"
            onClick={handleRemove}
            className="self-start font-mono text-[11px] tracking-wide text-ink-faint underline decoration-dotted underline-offset-4"
          >
            remove
          </button>
          <MutationStatus status={status} error={error} />
        </div>
      }
    />
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
    <section className="mt-10">
      <h2 className="font-display text-2xl text-ink">Recently bought</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s.nameNormalized}
            className="rounded-tab border border-kraft/50 bg-card px-3 py-1 font-mono text-xs text-ink"
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
    <section className="ruled mt-10 rounded-card border border-line bg-card p-6 shadow-card">
      <h2 className="font-display text-2xl text-ink">Add item</h2>
      <form
        onSubmit={handleSubmit}
        className="mt-4 flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs tracking-wide text-ink-dim">
            Name
          </span>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs tracking-wide text-ink-dim">
            Qty
          </span>
          <input
            type="number"
            step="any"
            min={0}
            className="field w-20"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs tracking-wide text-ink-dim">
            Unit
          </span>
          <input
            className="field w-20"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs tracking-wide text-ink-dim">
            Note
          </span>
          <input
            className="field"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs tracking-wide text-ink-dim">
            Aisle
          </span>
          <input
            className="field"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-tab bg-rust px-4 py-2 text-sm font-medium text-card disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
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
    <section className="mt-10">
      <h2 className="font-display text-2xl text-ink">Aisle order</h2>
      <ul className="mt-3 flex flex-col gap-1.5">
        {categories.map((category, index) => (
          <li
            key={category.id}
            className="flex items-center gap-2 font-mono text-sm text-ink"
          >
            <span className="w-40">{category.name}</span>
            <button
              className="rounded-tab border border-kraft/50 px-2 py-0.5 text-xs disabled:opacity-30"
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
              className="rounded-tab border border-kraft/50 px-2 py-0.5 text-xs disabled:opacity-30"
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
