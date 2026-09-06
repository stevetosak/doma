import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AppShell } from '#/core/ui/AppShell'
import { DoneStack } from '#/core/ui/DoneStack'
import { Field } from '#/core/ui/Field'
import { FlipCard } from '#/core/ui/FlipCard'
import {
  BellIcon,
  CheckIcon,
  EditIcon,
  GripIcon,
  PlusIcon,
  TrashIcon,
  UndoIcon,
} from '#/core/ui/icons'
import { MutationStatus } from '#/core/ui/MutationStatus'
import { ReminderListEditor } from '#/core/ui/ReminderListEditor'
import { Sheet } from '#/core/ui/Sheet'
import { DecimalStepper } from '#/core/ui/Stepper'
import { useLiveSync } from '#/core/events/useLiveSync'
import { useHouseholdMutation } from '#/core/mutations/useHouseholdMutation'
import {
  defaultLocalInputValue,
  nextSaturdayMorningLocalInputValue,
  toLocalInputValue,
  tomorrowMorningLocalInputValue,
  tonightLocalInputValue,
} from '#/modules/shopping/reminder-time'
import {
  addItemAction,
  deleteCategoryAction,
  getShoppingData,
  MAX_ITEM_REMINDERS,
  reAddItemAction,
  removeItemAction,
  reorderCategoryAction,
  setItemCheckedAction,
  setItemRemindersAction,
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

  const itemCountByCategory = new Map(
    data.categories.map((c) => [c.id, grouped.get(c.id)?.length ?? 0]),
  )

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
          className="btn-primary btn-compact"
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
          {orderedGroups.map((group, gi) => (
            <section key={group.category?.id ?? 'uncategorized'}>
              <h2 className="text-xs font-semibold tracking-wide text-ink-dim uppercase">
                {group.category?.name ?? 'Uncategorized'}
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {group.items.map((item, i) => (
                  <div
                    key={item.id}
                    className="rise"
                    style={{ animationDelay: `${(gi * 4 + i) * 50}ms` }}
                  >
                    <ItemCard
                      item={item}
                      categories={data.categories}
                      memberName={memberName}
                      timezone={data.timezone}
                      onChange={refresh}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <DoneStack
        labelClosed={`Already bought · ${checkedItems.length}`}
        labelOpen={`Already bought · ${checkedItems.length} — hide`}
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
      <CategoryOrder
        categories={data.categories}
        itemCounts={itemCountByCategory}
        onChange={refresh}
      />

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
  timezone,
  onChange,
}: {
  item: ItemView
  categories: CategoryView[]
  memberName: Map<string, string>
  timezone: string
  onChange: () => Promise<void>
}) {
  const { status, error, run } = useHouseholdMutation()
  const [editOpen, setEditOpen] = useState(false)
  const [remindersOpen, setRemindersOpen] = useState(false)

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
        minHeight={114}
        swipeCompleteLabel={!busy ? '✓ Got it' : undefined}
        onSwipeComplete={!busy ? markBought : undefined}
        front={
          <>
            <span className="block text-lg text-ink">{item.name}</span>
            {(item.quantity != null || item.unit) && (
              <span className="mt-1 block text-xs text-ink-dim">
                {item.quantity ?? ''} {item.unit ?? ''}
              </span>
            )}
            {item.note && (
              <p className="mt-2 text-sm text-ink-dim">{item.note}</p>
            )}
            {item.addedBy && memberName.get(item.addedBy) && (
              <p className="mt-3 text-[11px] text-ink-dim">
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
              className="btn-primary btn-compact self-start"
            >
              <CheckIcon className="h-4 w-4" />
              Got it
            </button>
            <MutationStatus status={status} error={error} />
            <div className="mt-auto flex gap-3 border-t border-line pt-3 text-[11px] text-ink-dim">
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
                onClick={() => setRemindersOpen(true)}
                className="flex items-center gap-1 underline decoration-dotted underline-offset-4"
              >
                <BellIcon className="h-3.5 w-3.5" />
                remind
                {item.reminders.length > 0 ? ` (${item.reminders.length})` : ''}
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="flex items-center gap-1 underline decoration-dotted underline-offset-4"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                delete
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

      <Sheet
        open={remindersOpen}
        onClose={() => setRemindersOpen(false)}
        title="Item reminders"
      >
        <ItemReminderForm
          item={item}
          timezone={timezone}
          onSaved={async () => {
            setRemindersOpen(false)
            await onChange()
          }}
          onCancel={() => setRemindersOpen(false)}
        />
      </Sheet>
    </>
  )
}

interface ItemReminderRow {
  key: number
  fireAt: string
}

function ItemReminderForm({
  item,
  timezone,
  onSaved,
  onCancel,
}: {
  item: ItemView
  timezone: string
  onSaved: () => Promise<void>
  onCancel: () => void
}) {
  const nextKey = useRef(0)
  const [rows, setRows] = useState<ItemReminderRow[]>(() =>
    item.reminders.map((r) => ({
      key: nextKey.current++,
      fireAt: toLocalInputValue(r.fireAt, timezone),
    })),
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function addRow(fireAt: string) {
    setRows((current) =>
      current.length >= MAX_ITEM_REMINDERS
        ? current
        : [...current, { key: nextKey.current++, fireAt }],
    )
  }

  function updateRow(key: number, fireAt: string) {
    setRows((current) =>
      current.map((r) => (r.key === key ? { ...r, fireAt } : r)),
    )
  }

  function removeRow(key: number) {
    setRows((current) => current.filter((r) => r.key !== key))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await setItemRemindersAction({
        data: {
          itemId: item.id,
          reminders: rows.map(({ fireAt }) => ({ fireAt })),
        },
      })
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <ReminderListEditor
        rows={rows}
        max={MAX_ITEM_REMINDERS}
        onAdd={() => addRow(defaultLocalInputValue(timezone))}
        onRemove={removeRow}
        presets={[
          {
            label: 'Tonight, 6:00 PM',
            onClick: () => addRow(tonightLocalInputValue(timezone)),
          },
          {
            label: 'Tomorrow, 9:00 AM',
            onClick: () => addRow(tomorrowMorningLocalInputValue(timezone)),
          },
          {
            label: 'Saturday, 10:00 AM',
            onClick: () => addRow(nextSaturdayMorningLocalInputValue(timezone)),
          },
        ]}
        renderRow={(row) => (
          <input
            type="datetime-local"
            className="field"
            value={row.fireAt}
            onChange={(e) => updateRow(row.key, e.target.value)}
            required
          />
        )}
      />
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex flex-col items-start gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          Save reminders
        </button>
        <button type="button" onClick={onCancel} className="btn-tertiary">
          Cancel
        </button>
      </div>
    </form>
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
      <Field label="Name">
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <div className="flex gap-3">
        <Field label="Qty">
          <DecimalStepper
            value={quantity}
            onChange={setQuantity}
            ariaLabel="Quantity"
          />
        </Field>
        <div className="flex-1">
          <Field label="Unit">
            <input
              className="field"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </Field>
        </div>
      </div>
      <Field label="Note">
        <input
          className="field"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Field label="Category">
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
      </Field>
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex flex-col items-start gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          Save changes
        </button>
        <button type="button" onClick={onCancel} className="btn-tertiary">
          Cancel
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
            className="rounded-full border border-line bg-card px-3 py-1.5 text-xs text-ink"
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
      <Field label="Name">
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <div className="flex gap-3">
        <Field label="Qty">
          <DecimalStepper
            value={quantity}
            onChange={setQuantity}
            ariaLabel="Quantity"
          />
        </Field>
        <div className="flex-1">
          <Field label="Unit">
            <input
              className="field"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </Field>
        </div>
      </div>
      <Field label="Note">
        <input
          className="field"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Field label="Category">
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
      </Field>
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex flex-col items-start gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          Add
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-tertiary">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

const CATEGORY_ROW_HEIGHT = 46

/**
 * Category reordering — the visual half of #68 (§2.11). Drag swaps one
 * step at a time as the pointer crosses a neighbor's row height, then
 * resets its origin so a single gesture can move several positions —
 * built on the existing single-step reorderCategoryAction, no backend
 * change needed. Delete stays a small trailing icon rather than the
 * spec's long-press menu — keeping it always reachable by keyboard and
 * screen reader beat matching the gesture exactly.
 */
function CategoryOrder({
  categories,
  itemCounts,
  onChange,
}: {
  categories: CategoryView[]
  itemCounts: Map<string, number>
  onChange: () => Promise<void>
}) {
  const drag = useRef<{ id: string; y: number } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  if (categories.length === 0) return null

  async function move(id: string, direction: 'up' | 'down') {
    await reorderCategoryAction({ data: { categoryId: id, direction } })
    await onChange()
  }

  function handlePointerDown(id: string, event: React.PointerEvent) {
    drag.current = { id, y: event.clientY }
    setDraggingId(id)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!drag.current) return
    const delta = event.clientY - drag.current.y
    if (Math.abs(delta) > CATEGORY_ROW_HEIGHT) {
      const direction = delta > 0 ? 'down' : 'up'
      drag.current.y = event.clientY
      void move(drag.current.id, direction)
    }
  }

  function handlePointerUp() {
    drag.current = null
    setDraggingId(null)
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl text-ink">Category order</h2>
      <ul className="mt-3 flex flex-col gap-[7px]">
        {categories.map((category) => {
          const isDragging = draggingId === category.id
          return (
            <li
              key={category.id}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`flex touch-none items-center gap-3 rounded-control px-[14px] py-[13px] transition-[transform,box-shadow] ${
                isDragging
                  ? 'scale-[1.02] border border-accent bg-card shadow-lifted'
                  : 'bg-inset'
              }`}
            >
              <button
                type="button"
                aria-label={`Reorder ${category.name}`}
                onPointerDown={(e) => handlePointerDown(category.id, e)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    void move(category.id, 'up')
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    void move(category.id, 'down')
                  }
                }}
                className={
                  isDragging
                    ? 'shrink-0 cursor-grabbing text-accent'
                    : 'shrink-0 cursor-grab text-ink-ghost'
                }
              >
                <GripIcon className="h-4 w-4" />
              </button>
              <span className="flex-1 text-sm text-ink">{category.name}</span>
              <span className="text-xs text-ink-dim">
                {itemCounts.get(category.id) ?? 0}
              </span>
              <button
                type="button"
                aria-label={`Delete ${category.name}`}
                onClick={async () => {
                  await deleteCategoryAction({
                    data: { categoryId: category.id },
                  })
                  await onChange()
                }}
                className="shrink-0 text-ink-dim"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
