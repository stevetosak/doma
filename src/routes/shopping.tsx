import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { AppShell } from '#/core/ui/AppShell'
import { DoneStack } from '#/core/ui/DoneStack'
import { FlipCard } from '#/core/ui/FlipCard'
import {
  CheckIcon,
  CloseIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
  UndoIcon,
} from '#/core/ui/icons'
import { MutationStatus } from '#/core/ui/MutationStatus'
import { Sheet } from '#/core/ui/Sheet'
import { useLiveSync } from '#/core/events/useLiveSync'
import { useHouseholdMutation } from '#/core/mutations/useHouseholdMutation'
import {
  addItemAction,
  deleteCategoryAction,
  getShoppingData,
  reAddItemAction,
  removeItemAction,
  reorderCategoryAction,
  setItemCheckedAction,
  updateItemAction,
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
  const [addOpen, setAddOpen] = useState(false)

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
  const memberName = new Map(
    data.members.map((m) => [m.userId, m.name ?? m.email]),
  )

  async function unmarkBought(itemId: string) {
    await setItemCheckedAction({ data: { itemId, checked: false } })
    await refresh()
  }

  async function removeBought(itemId: string) {
    await removeItemAction({ data: { itemId } })
    await refresh()
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-4xl text-ink">Shopping</h1>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-tab bg-rust px-4 py-2 text-sm font-medium text-card"
        >
          <PlusIcon className="h-4 w-4" />
          Add item
        </button>
      </div>

      {orderedGroups.length === 0 ? (
        <p className="mt-8 text-ink-dim">
          The list is empty — add something above.
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
                  <ItemCard
                    key={item.id}
                    item={item}
                    categories={data.categories}
                    memberName={memberName}
                    onChange={refresh}
                  />
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
          actions: [
            {
              label: 'undo',
              icon: <UndoIcon className="h-3 w-3" />,
              onClick: () => unmarkBought(item.id),
            },
            {
              label: 'remove',
              icon: <TrashIcon className="h-3 w-3" />,
              onClick: () => removeBought(item.id),
            },
          ],
        }))}
      />

      <RecentlyBought
        listId={data.listId}
        suggestions={data.recentlyBought}
        onChange={refresh}
      />
      <CategoryOrder categories={data.categories} onChange={refresh} />

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add item">
        <NewItemForm
          listId={data.listId}
          categories={data.categories}
          onCreated={async () => {
            setAddOpen(false)
            await refresh()
          }}
          onCancel={() => setAddOpen(false)}
        />
      </Sheet>
    </AppShell>
  )
}

function ItemCard({
  item,
  categories,
  memberName,
  onChange,
}: {
  item: ItemView
  categories: CategoryView[]
  memberName: Map<string, string>
  onChange: () => Promise<void>
}) {
  const { status, error, run } = useHouseholdMutation()
  const [editOpen, setEditOpen] = useState(false)

  async function markBought() {
    await run(() =>
      setItemCheckedAction({ data: { itemId: item.id, checked: true } }),
    )
    await onChange()
  }

  async function handleRemove() {
    await removeItemAction({ data: { itemId: item.id } })
    await onChange()
  }

  const busy = status === 'pending' || status === 'retrying'

  return (
    <>
      <FlipCard
        accent="neutral"
        flipLabel="actions"
        front={
          <>
            <span className="block text-lg text-ink">{item.name}</span>
            {(item.quantity != null || item.unit) && (
              <span className="mt-1 block font-mono text-xs text-ink-dim">
                {item.quantity ?? ''} {item.unit ?? ''}
              </span>
            )}
            {item.note && (
              <p className="mt-2 text-sm text-ink-dim">{item.note}</p>
            )}
            {item.addedBy && memberName.get(item.addedBy) && (
              <p className="mt-3 font-mono text-[11px] tracking-wide text-ink-faint">
                added by {memberName.get(item.addedBy)}
              </p>
            )}
          </>
        }
        back={
          <div className="flex flex-1 flex-col gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={markBought}
              className="flex items-center gap-1.5 self-start rounded-tab bg-rust px-3 py-1 text-sm font-medium text-card disabled:opacity-50"
            >
              <CheckIcon className="h-4 w-4" />
              Got it
            </button>
            <MutationStatus status={status} error={error} />
            <div className="mt-auto flex gap-3 border-t border-line pt-3 font-mono text-[11px] tracking-wide text-ink-faint">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="flex items-center gap-1 underline decoration-dotted underline-offset-4"
              >
                <EditIcon className="h-3.5 w-3.5" />
                edit
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="flex items-center gap-1 underline decoration-dotted underline-offset-4"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                remove
              </button>
            </div>
          </div>
        }
      />

      <Sheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit item"
      >
        <ItemEditForm
          item={item}
          categories={categories}
          currentCategoryName={
            categories.find((c) => c.id === item.categoryId)?.name
          }
          onSaved={async () => {
            setEditOpen(false)
            await onChange()
          }}
          onCancel={() => setEditOpen(false)}
        />
      </Sheet>
    </>
  )
}

function ItemEditForm({
  item,
  categories,
  currentCategoryName,
  onSaved,
  onCancel,
}: {
  item: ItemView
  categories: CategoryView[]
  currentCategoryName: string | undefined
  onSaved: () => Promise<void>
  onCancel: () => void
}) {
  const categoryListId = useId()
  const [name, setName] = useState(item.name)
  const [quantity, setQuantity] = useState(item.quantity?.toString() ?? '')
  const [unit, setUnit] = useState(item.unit ?? '')
  const [note, setNote] = useState(item.note ?? '')
  const [categoryName, setCategoryName] = useState(currentCategoryName ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await updateItemAction({
        data: {
          itemId: item.id,
          name,
          quantity: quantity ? Number(quantity) : undefined,
          unit: unit || undefined,
          note: note || undefined,
          categoryName: categoryName || undefined,
        },
      })
      await onSaved()
    } catch {
      setError('Could not save changes — check the fields above.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-mono text-xs tracking-wide text-ink-dim">
            Qty
          </span>
          <input
            type="number"
            step="any"
            min={0}
            className="field"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-mono text-xs tracking-wide text-ink-dim">
            Unit
          </span>
          <input
            className="field"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </label>
      </div>
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
          Category
        </span>
        <input
          className="field"
          list={categoryListId}
          value={categoryName}
          onChange={(e) => setCategoryName(e.target.value)}
        />
        <datalist id={categoryListId}>
          {categories.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </label>
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded-tab bg-rust px-4 py-2 text-sm font-medium text-card disabled:opacity-50"
        >
          Save changes
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 font-mono text-xs tracking-wide text-ink-faint underline decoration-dotted underline-offset-4"
        >
          <CloseIcon className="h-3.5 w-3.5" />
          cancel
        </button>
      </div>
    </form>
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
  categories,
  onCreated,
  onCancel,
}: {
  listId: string
  categories: CategoryView[]
  onCreated: () => Promise<void>
  onCancel?: () => void
}) {
  const categoryListId = useId()
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
      setCategoryName('')
      await onCreated()
    } catch {
      setError('Could not add the item — check the fields above.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-mono text-xs tracking-wide text-ink-dim">
            Qty
          </span>
          <input
            type="number"
            step="any"
            min={0}
            className="field"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-mono text-xs tracking-wide text-ink-dim">
            Unit
          </span>
          <input
            className="field"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </label>
      </div>
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
          Category
        </span>
        <input
          className="field"
          list={categoryListId}
          value={categoryName}
          onChange={(e) => setCategoryName(e.target.value)}
        />
        <datalist id={categoryListId}>
          {categories.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </label>
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded-tab bg-rust px-4 py-2 text-sm font-medium text-card disabled:opacity-50"
        >
          Add
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 font-mono text-xs tracking-wide text-ink-faint underline decoration-dotted underline-offset-4"
          >
            <CloseIcon className="h-3.5 w-3.5" />
            cancel
          </button>
        )}
      </div>
    </form>
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
      <h2 className="font-display text-2xl text-ink">Category order</h2>
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
            <button
              className="flex items-center gap-1 rounded-tab border border-kraft/50 px-2 py-0.5 text-xs text-ink-faint"
              onClick={async () => {
                await deleteCategoryAction({
                  data: { categoryId: category.id },
                })
                await onChange()
              }}
            >
              <TrashIcon className="h-3 w-3" />
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
