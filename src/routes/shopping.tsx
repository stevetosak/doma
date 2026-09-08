import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ActionCard } from '#/core/ui/ActionCard'
import { AppShell } from '#/core/ui/AppShell'
import { DoneStack } from '#/core/ui/DoneStack'
import { Field } from '#/core/ui/Field'
import {
  BellIcon,
  CheckIcon,
  EditIcon,
  FlagIcon,
  FolderIcon,
  GripIcon,
  PlusIcon,
  TrashIcon,
  UndoIcon,
} from '#/core/ui/icons'
import { IconRail } from '#/core/ui/IconRail'
import { MutationStatus } from '#/core/ui/MutationStatus'
import { ReminderListEditor } from '#/core/ui/ReminderListEditor'
import { SegmentedControl } from '#/core/ui/SegmentedControl'
import { Sheet } from '#/core/ui/Sheet'
import { DecimalStepper } from '#/core/ui/Stepper'
import { TOAST_DURATION_MS, useToast } from '#/core/ui/Toast'
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
  reorderCategoriesAction,
  setItemCheckedAction,
  setItemPriorityAction,
  setItemRemindersAction,
  updateItemAction,
} from '#/modules/shopping/shopping.functions'
import type {
  CategoryView,
  ItemPriority,
  ItemView,
  RecentlyBoughtView,
} from '#/modules/shopping/repo'
import { UNCATEGORIZED, buildBoard } from '#/modules/shopping/board'
import type { Board } from '#/modules/shopping/board'

// Sentinel for the segmented control (§2.12) — SegmentedControl's options
// are string-keyed, and `null` isn't a legal option value, so the form
// state holds this instead and only the submit boundary maps it back to
// `undefined`/`null` for the server actions.
type PriorityChoice = ItemPriority | 'none'

const PRIORITY_OPTIONS: readonly { value: PriorityChoice; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

// Literal class names, not a `text-priority-${priority}` template — Tailwind
// only emits a utility (and the `--color-priority-*` variable behind it)
// for class names its static scanner can actually see in source; a
// runtime-built string would silently resolve to nothing.
const PRIORITY_TEXT_CLASS: Record<ItemPriority, string> = {
  high: 'text-priority-high',
  medium: 'text-priority-medium',
  low: 'text-priority-low',
}

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
  // Edit / reminders / priority sheets are hosted here, once each, not
  // inside ItemCard. A Sheet is `fixed inset-0`; a card sits in a `.rise`
  // wrapper whose transform animation makes it the containing block for
  // fixed descendants, which pinned a card-hosted sheet to the card and
  // pushed it off the top of the screen. One shared bit of state, the
  // target looked up against live loader data so the sheet closes itself
  // if the item disappears.
  const [itemSheet, setItemSheet] = useState<{
    kind: 'edit' | 'reminders' | 'priority' | 'move'
    id: string
  } | null>(null)
  const activeItem = itemSheet
    ? (data.items.find((i) => i.id === itemSheet.id) ?? null)
    : null
  const { showToast } = useToast()
  // Swipe-left/rail delete (§2.1/§2.2) is optimistic-with-undo: the item
  // disappears immediately, the actual (irreversible) removeItemAction
  // fires only once the toast's undo window has fully elapsed. Deleting an
  // item has no soft-delete/archive path in the schema, so this is done
  // client-side rather than adding one.
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(
    () => new Set(),
  )
  const deleteTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const timers = deleteTimers.current
    return () => {
      // Only clears the local "hidden" bookkeeping on unmount — the
      // scheduled deletes themselves are left to fire; they're plain
      // server calls that don't depend on this component staying mounted.
      timers.clear()
    }
  }, [])

  async function refresh() {
    await router.invalidate({ sync: true })
  }

  function requestDeleteItem(itemId: string, itemName: string) {
    setPendingDeleteIds((current) => new Set(current).add(itemId))
    const timer = setTimeout(() => {
      deleteTimers.current.delete(itemId)
      void removeItemAction({ data: { itemId } }).then(async () => {
        setPendingDeleteIds((current) => {
          const next = new Set(current)
          next.delete(itemId)
          return next
        })
        await refresh()
      })
    }, TOAST_DURATION_MS)
    deleteTimers.current.set(itemId, timer)
    showToast({
      message: `Deleted “${itemName}.”`,
      actionLabel: 'Undo',
      onAction: () => {
        const pending = deleteTimers.current.get(itemId)
        if (pending) {
          clearTimeout(pending)
          deleteTimers.current.delete(itemId)
        }
        setPendingDeleteIds((current) => {
          const next = new Set(current)
          next.delete(itemId)
          return next
        })
      },
    })
  }

  const visibleItems = data.items.filter(
    (i) => !i.isChecked && !pendingDeleteIds.has(i.id),
  )
  const itemsById = new Map(data.items.map((i) => [i.id, i]))

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

  async function setItemPriority(itemId: string, next: ItemPriority | null) {
    setItemSheet(null)
    await setItemPriorityAction({ data: { itemId, priority: next } })
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

      <ShoppingList
        categories={data.categories}
        items={visibleItems}
        hiddenIds={pendingDeleteIds}
        itemsById={itemsById}
        memberName={memberName}
        onEdit={(id) => setItemSheet({ kind: 'edit', id })}
        onRemind={(id) => setItemSheet({ kind: 'reminders', id })}
        onSetPriority={(id) => setItemSheet({ kind: 'priority', id })}
        onMove={(id) => setItemSheet({ kind: 'move', id })}
        onRequestDelete={requestDeleteItem}
        onChange={refresh}
      />

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

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add item">
        <NewItemForm
          listId={data.listId}
          onCreated={async () => {
            setAddOpen(false)
            await refresh()
          }}
          onCancel={() => setAddOpen(false)}
        />
      </Sheet>

      <Sheet
        open={itemSheet?.kind === 'edit' && activeItem != null}
        onClose={() => setItemSheet(null)}
        title="Edit item"
      >
        {activeItem && (
          <ItemEditForm
            item={activeItem}
            onSaved={async () => {
              setItemSheet(null)
              await refresh()
            }}
            onCancel={() => setItemSheet(null)}
          />
        )}
      </Sheet>

      <Sheet
        open={itemSheet?.kind === 'reminders' && activeItem != null}
        onClose={() => setItemSheet(null)}
        title="Item reminders"
      >
        {activeItem && (
          <ItemReminderForm
            item={activeItem}
            timezone={data.timezone}
            onSaved={async () => {
              setItemSheet(null)
              await refresh()
            }}
            onCancel={() => setItemSheet(null)}
          />
        )}
      </Sheet>

      <Sheet
        open={itemSheet?.kind === 'priority' && activeItem != null}
        onClose={() => setItemSheet(null)}
        title="Priority"
      >
        {activeItem && (
          <PrioritySheet
            current={activeItem.priority}
            onSelect={(next) => setItemPriority(activeItem.id, next)}
          />
        )}
      </Sheet>
    </AppShell>
  )
}

/**
 * The grouped shopping list, rendered from a `board` state (category order
 * + item ids per bucket). Batch B wraps this in one `<DndContext>`; for now
 * it just renders. The board is rebuilt from loader data on every change,
 * so a failed drag save snaps back to server truth.
 */
function ShoppingList({
  categories,
  items,
  hiddenIds,
  itemsById,
  memberName,
  onEdit,
  onRemind,
  onSetPriority,
  onMove,
  onRequestDelete,
  onChange,
}: {
  categories: CategoryView[]
  items: ItemView[]
  hiddenIds: ReadonlySet<string>
  itemsById: Map<string, ItemView>
  memberName: Map<string, string>
  onEdit: (id: string) => void
  onRemind: (id: string) => void
  onSetPriority: (id: string) => void
  onMove: (id: string) => void
  onRequestDelete: (id: string, name: string) => void
  onChange: () => Promise<void>
}) {
  const [board, setBoard] = useState<Board>(() =>
    buildBoard({ categories, items }, hiddenIds),
  )

  useEffect(() => {
    setBoard(buildBoard({ categories, items }, hiddenIds))
  }, [categories, items, hiddenIds])

  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const orderedKeys = [
    ...board.categoryOrder,
    ...(board.itemsByBucket[UNCATEGORIZED]?.length ? [UNCATEGORIZED] : []),
  ]
  const activeCategory =
    activeId && activeId.startsWith('cat:')
      ? categoryById.get(activeId.slice(4))
      : undefined

  function persistCategoryOrder(orderedIds: string[]) {
    void reorderCategoriesAction({ data: { orderedIds } }).then(() =>
      onChange(),
    )
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.data.current?.type !== 'category') return
    const from = board.categoryOrder.indexOf(String(active.id).slice(4))
    const to = board.categoryOrder.indexOf(String(over.id).slice(4))
    if (from === -1 || to === -1 || from === to) return
    const next = arrayMove(board.categoryOrder, from, to)
    setBoard((b) => ({ ...b, categoryOrder: next }))
    persistCategoryOrder(next)
  }

  if (orderedKeys.length === 0) {
    return (
      <p className="mt-8 text-ink-dim">
        The list is empty — add something above.
      </p>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="mt-8 flex flex-col gap-10">
        <SortableContext
          items={board.categoryOrder.map((id) => `cat:${id}`)}
          strategy={verticalListSortingStrategy}
        >
          {orderedKeys.map((key) => {
            const category =
              key === UNCATEGORIZED ? null : categoryById.get(key)
            return (
              <CategoryGroup
                key={key}
                bucketKey={key}
                category={category ?? null}
                itemIds={board.itemsByBucket[key] ?? []}
                itemsById={itemsById}
                memberName={memberName}
                onEdit={onEdit}
                onRemind={onRemind}
                onSetPriority={onSetPriority}
                onMove={onMove}
                onRequestDelete={onRequestDelete}
                onChange={onChange}
              />
            )
          })}
        </SortableContext>
      </div>
      <DragOverlay>
        {activeCategory ? (
          <div className="rounded-control bg-card px-3 py-2 text-xs font-semibold tracking-wide text-ink-dim uppercase shadow-lifted">
            {activeCategory.name}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function CategoryGroup({
  bucketKey,
  category,
  itemIds,
  itemsById,
  memberName,
  onEdit,
  onRemind,
  onSetPriority,
  onMove,
  onRequestDelete,
  onChange,
}: {
  bucketKey: string
  category: CategoryView | null
  itemIds: string[]
  itemsById: Map<string, ItemView>
  memberName: Map<string, string>
  onEdit: (id: string) => void
  onRemind: (id: string) => void
  onSetPriority: (id: string) => void
  onMove: (id: string) => void
  onRequestDelete: (id: string, name: string) => void
  onChange: () => Promise<void>
}) {
  const sortable = useSortable({
    id: `cat:${category?.id ?? bucketKey}`,
    data: { type: 'category' },
    disabled: category == null,
  })

  return (
    <section
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={sortable.isDragging ? 'relative z-10' : undefined}
    >
      <header className="flex items-center gap-2">
        {category && (
          <button
            type="button"
            ref={sortable.setActivatorNodeRef}
            {...sortable.attributes}
            {...sortable.listeners}
            aria-label={`Reorder ${category.name}`}
            className="-ml-1 flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-ink-ghost"
          >
            <GripIcon className="h-4 w-4" />
          </button>
        )}
        <h2 className="flex-1 text-xs font-semibold tracking-wide text-ink-dim uppercase">
          {category ? category.name : 'Uncategorized'}
        </h2>
        <span className="text-xs text-ink-dim">{itemIds.length}</span>
        {category && (
          <button
            type="button"
            aria-label={`Delete ${category.name}`}
            onClick={async () => {
              await deleteCategoryAction({ data: { categoryId: category.id } })
              await onChange()
            }}
            className="shrink-0 text-ink-dim"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </header>
      <div className="mt-3 flex flex-col gap-4">
        {itemIds.map((id) => {
          const item = itemsById.get(id)
          if (!item) return null
          return (
            <ItemCard
              key={id}
              item={item}
              memberName={memberName}
              onChange={onChange}
              onRequestDelete={() => onRequestDelete(item.id, item.name)}
              onEdit={() => onEdit(item.id)}
              onRemind={() => onRemind(item.id)}
              onSetPriority={() => onSetPriority(item.id)}
              onMove={() => onMove(item.id)}
            />
          )
        })}
      </div>
    </section>
  )
}

function ItemCard({
  item,
  memberName,
  onChange,
  onRequestDelete,
  onEdit,
  onRemind,
  onSetPriority,
  onMove,
}: {
  item: ItemView
  memberName: Map<string, string>
  onChange: () => Promise<void>
  onRequestDelete: () => void
  onEdit: () => void
  onRemind: () => void
  onSetPriority: () => void
  onMove: () => void
}) {
  const { status, error, run } = useHouseholdMutation()

  async function markBought() {
    await run(() =>
      setItemCheckedAction({ data: { itemId: item.id, checked: true } }),
    )
    await onChange()
  }

  const busy = status === 'pending' || status === 'retrying'

  return (
    <ActionCard
      onComplete={!busy ? markBought : undefined}
      onNegative={onRequestDelete}
      completeLabel="✓ Got it"
      negativeLabel="Delete"
      completeAriaLabel="Mark bought"
      negativeAriaLabel="Delete item"
    >
      <div className="p-5">
        <span className="flex items-center gap-1.5 text-lg text-ink">
          {item.priority && (
            <FlagIcon
              className={`h-3.5 w-3.5 shrink-0 ${PRIORITY_TEXT_CLASS[item.priority]}`}
              filled
            />
          )}
          {item.name}
        </span>
        {(item.quantity != null || item.unit) && (
          <span className="mt-1 block text-xs text-ink-dim">
            {item.quantity ?? ''} {item.unit ?? ''}
          </span>
        )}
        {item.note && <p className="mt-2 text-sm text-ink-dim">{item.note}</p>}
        {item.addedBy && memberName.get(item.addedBy) && (
          <p className="mt-3 text-[11px] text-ink-dim">
            added by {memberName.get(item.addedBy)}
          </p>
        )}
        <MutationStatus status={status} error={error} />
      </div>
      <IconRail
        actions={[
          {
            key: 'remind',
            icon: <BellIcon className="h-[18px] w-[18px]" />,
            label: 'Item reminders',
            onClick: onRemind,
            badge: item.reminders.length,
          },
          {
            key: 'priority',
            icon: (
              <FlagIcon
                className={`h-[18px] w-[18px] ${item.priority ? PRIORITY_TEXT_CLASS[item.priority] : ''}`}
                filled={item.priority != null}
              />
            ),
            label: item.priority
              ? `Priority: ${item.priority}`
              : 'Set priority',
            onClick: onSetPriority,
          },
          {
            key: 'move',
            icon: <FolderIcon className="h-[18px] w-[18px]" />,
            label: 'Move to category',
            onClick: onMove,
          },
          {
            key: 'edit',
            icon: <EditIcon className="h-[18px] w-[18px]" />,
            label: 'Edit item',
            onClick: onEdit,
          },
          {
            key: 'delete',
            icon: <TrashIcon className="h-[18px] w-[18px]" />,
            label: 'Delete item',
            onClick: onRequestDelete,
          },
        ]}
      />
    </ActionCard>
  )
}

/**
 * The quick-access priority picker (§2.12) opened from the rail's flag
 * icon — a lighter path than the full edit form, writing straight through
 * `setItemPriorityAction`. Four rows (including "no priority"), current
 * selection checked.
 */
function PrioritySheet({
  current,
  onSelect,
}: {
  current: ItemPriority | null
  onSelect: (value: ItemPriority | null) => void
}) {
  const levels: { value: ItemPriority | null; label: string }[] = [
    { value: null, label: 'None' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ]
  return (
    <div className="flex flex-col gap-1.5">
      {levels.map((level) => {
        const selected = level.value === current
        return (
          <button
            key={level.label}
            type="button"
            onClick={() => onSelect(level.value)}
            className={`flex items-center gap-3 rounded-control px-[14px] py-[13px] text-left transition-colors ${
              selected ? 'bg-inset' : 'hover:bg-inset'
            }`}
          >
            <FlagIcon
              className={`h-4 w-4 shrink-0 ${level.value ? PRIORITY_TEXT_CLASS[level.value] : 'text-ink-ghost'}`}
              filled={level.value != null}
            />
            <span className="flex-1 text-sm text-ink">{level.label}</span>
            {selected && <CheckIcon className="h-4 w-4 text-accent" />}
          </button>
        )
      })}
    </div>
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
          // w-full: a lone flex item has no sibling to wrap against, and
          // some browsers render a bare datetime-local wide enough to
          // overflow the row — constraining it to the row's own width
          // lets it shrink instead.
          <input
            type="datetime-local"
            className="field w-full min-w-0"
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
  onSaved,
  onCancel,
}: {
  item: ItemView
  onSaved: () => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(item.name)
  const [quantity, setQuantity] = useState(item.quantity?.toString() ?? '')
  const [unit, setUnit] = useState(item.unit ?? '')
  const [note, setNote] = useState(item.note ?? '')
  const [priority, setPriority] = useState<PriorityChoice>(
    item.priority ?? 'none',
  )
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
          priority: priority === 'none' ? undefined : priority,
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
        <Field label="Unit">
          <input
            className="field w-24"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Note">
        <input
          className="field"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Field label="Priority">
        <SegmentedControl
          value={priority}
          onChange={setPriority}
          options={PRIORITY_OPTIONS}
          ariaLabel="Priority"
        />
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
  onCreated,
  onCancel,
}: {
  listId: string
  onCreated: () => Promise<void>
  onCancel?: () => void
}) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [note, setNote] = useState('')
  const [priority, setPriority] = useState<PriorityChoice>('none')
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
          priority: priority === 'none' ? undefined : priority,
        },
      })
      setName('')
      setQuantity('')
      setUnit('')
      setNote('')
      setPriority('none')
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
        <Field label="Unit">
          <input
            className="field w-24"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Note">
        <input
          className="field"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Field label="Priority">
        <SegmentedControl
          value={priority}
          onChange={setPriority}
          options={PRIORITY_OPTIONS}
          ariaLabel="Priority"
        />
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
