import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
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
  SkipIcon,
  TrashIcon,
  UndoIcon,
} from '#/core/ui/icons'
import { MutationStatus } from '#/core/ui/MutationStatus'
import { ReminderListEditor } from '#/core/ui/ReminderListEditor'
import { SegmentedControl } from '#/core/ui/SegmentedControl'
import { Sheet } from '#/core/ui/Sheet'
import { Stepper } from '#/core/ui/Stepper'
import { WeekdayStrip } from '#/core/ui/WeekdayStrip'
import { useLiveSync } from '#/core/events/useLiveSync'
import { useHouseholdMutation } from '#/core/mutations/useHouseholdMutation'
import {
  archiveChoreAction,
  createChoreAction,
  getChoresData,
  MAX_REMINDERS,
  setChoreRemindersAction,
  setOccurrenceStatusAction,
  updateChoreAction,
} from '#/modules/chores/chores.functions'
import { occurrencesBetween } from '#/modules/chores/recurrence'
import {
  addDays,
  formatDateWithWeekday,
  monthOf,
  todayInZone,
} from '#/modules/chores/time'
import type { ChoreOccurrenceView, ChoreView } from '#/modules/chores/repo'
import type { HouseholdMember } from '#/core/household/members-repo'

export const Route = createFileRoute('/chores')({
  beforeLoad: ({ context }) => {
    if (!context.auth.user) {
      throw redirect({
        to: '/login',
        search: { returnTo: '/chores', error: undefined },
      })
    }
    if (!context.auth.household) {
      throw redirect({ to: '/' })
    }
  },
  loader: () => getChoresData(),
  component: ChoresPage,
})

// Quick-add starting points for a reminder row — each just pre-fills a new
// row with these values, still freely editable afterward via the row's own
// inputs (no separate "custom" mode).
const REMINDER_PRESETS = [
  { label: 'Same day, 8:00 AM', offsetDays: 0, hour: 8, minute: 0 },
  { label: 'Evening before, 6:00 PM', offsetDays: -1, hour: 18, minute: 0 },
  { label: '3 days before, 9:00 AM', offsetDays: -3, hour: 9, minute: 0 },
  { label: '1 week before, 9:00 AM', offsetDays: -7, hour: 9, minute: 0 },
]

const REPEATS_OPTIONS = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const

const ASSIGNMENT_OPTIONS = [
  { value: 'fixed', label: 'One person' },
  { value: 'rotating', label: 'Rotates' },
] as const

interface ReminderFormRow {
  key: number
  offsetDays: number
  hour: number
  minute: number
}

function timeInputValue(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function parseTimeInputValue(
  value: string,
): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match?.[1] || !match[2]) return null
  return { hour: Number(match[1]), minute: Number(match[2]) }
}

function nextPendingOccurrence(
  chore: ChoreView,
): ChoreOccurrenceView | undefined {
  // occurrences arrive ordered by dueOn asc (listChoresWithOccurrences) —
  // the first pending one is genuinely the soonest, overdue included.
  return chore.occurrences.find((o) => o.status === 'pending')
}

function ChoresPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  useLiveSync()
  const [addOpen, setAddOpen] = useState(false)

  async function refresh() {
    await router.invalidate({ sync: true })
  }

  const memberName = new Map(
    data.members.map((m) => [m.userId, m.name ?? m.email]),
  )

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-4xl text-ink">Chores</h1>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="btn-primary btn-compact"
        >
          <PlusIcon className="h-4 w-4" />
          Add chore
        </button>
      </div>

      {data.chores.length === 0 ? (
        <p className="mt-8 text-ink-dim">
          No chores yet — add the first one above.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {data.chores.map((chore, i) => (
            <div
              key={chore.id}
              className="rise"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <ChoreCard
                chore={chore}
                members={data.members}
                memberName={memberName}
                timezone={data.timezone}
                onChange={refresh}
              />
            </div>
          ))}
        </div>
      )}

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="New chore">
        <ChoreForm
          members={data.members}
          timezone={data.timezone}
          onSaved={async () => {
            setAddOpen(false)
            await refresh()
          }}
          onCancel={() => setAddOpen(false)}
        />
      </Sheet>
    </AppShell>
  )
}

function OccurrenceStrip({
  dueDates,
  today,
  timezone,
  activeDate,
}: {
  dueDates: string[]
  today: string
  timezone: string
  // The single occurrence actually actionable from this card (the soonest
  // pending one) — filled solid so it reads apart from an overdue backlog
  // that has piled up but isn't reachable via Done/Skip from here.
  activeDate?: string
}) {
  if (dueDates.length === 0) return null
  let prevMonth: number | null = null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {dueDates.map((d, i) => {
        const isActive = activeDate != null && d === activeDate
        const isOverdueBacklog = !isActive && d < today
        const isDueToday = !isActive && d === today
        const showMonth = prevMonth === null || monthOf(d) !== prevMonth
        prevMonth = monthOf(d)
        const stateClass = isActive
          ? 'pill-active font-semibold text-card'
          : isOverdueBacklog
            ? 'border border-accent bg-card font-medium text-accent'
            : isDueToday
              ? 'bg-accent-tint font-medium text-accent-deep'
              : 'border border-line bg-card font-normal text-ink-dim'
        return (
          <span
            key={d}
            style={{ animationDelay: `${i * 40}ms` }}
            className={`pop shrink-0 rounded-full px-[11px] py-[6px] text-[12.5px] whitespace-nowrap ${stateClass}`}
          >
            {formatDateWithWeekday(d, timezone, { showMonth })}
          </span>
        )
      })}
    </div>
  )
}

function ChoreCard({
  chore,
  members,
  memberName,
  timezone,
  onChange,
}: {
  chore: ChoreView
  members: HouseholdMember[]
  memberName: Map<string, string>
  timezone: string
  onChange: () => Promise<void>
}) {
  const { status, error, run } = useHouseholdMutation()
  const [editOpen, setEditOpen] = useState(false)
  const [remindersOpen, setRemindersOpen] = useState(false)
  const today = todayInZone(timezone)
  const filed = chore.occurrences.filter((o) => o.status !== 'pending')
  const upcoming = chore.occurrences
    .filter((o) => o.status === 'pending')
    .slice(0, 8)
  const next = nextPendingOccurrence(chore)
  const overdue = next ? next.dueOn < today : false
  const urgent = next ? overdue || next.dueOn === today : false

  async function setStatus(
    occurrenceId: string,
    nextStatus: 'done' | 'skipped',
  ) {
    await run(() =>
      setOccurrenceStatusAction({ data: { occurrenceId, status: nextStatus } }),
    )
    await onChange()
  }

  // Reverting a filed occurrence is a secondary, occasional correction (a
  // mis-tap), not the card's primary tracked action — a plain call+refresh
  // matches how edit/delete/remove already work elsewhere, not the
  // honest-retry MutationStatus treatment reserved for Done/Skip.
  async function handleUndo(occurrenceId: string) {
    await setOccurrenceStatusAction({
      data: { occurrenceId, status: 'pending' },
    })
    await onChange()
  }

  async function handleDelete() {
    await archiveChoreAction({ data: { choreId: chore.id } })
    await onChange()
  }

  const busy = status === 'pending' || status === 'retrying'

  return (
    <div>
      <FlipCard
        urgent={urgent}
        minHeight={200}
        swipeCompleteLabel={next && !busy ? '✓ Done' : undefined}
        onSwipeComplete={
          next && !busy ? () => setStatus(next.id, 'done') : undefined
        }
        front={
          <>
            <h2 className="font-display text-2xl text-ink">{chore.title}</h2>
            {next ? (
              <span
                className={
                  urgent
                    ? 'mt-1 block text-[12px] font-semibold tracking-[0.06em] text-accent uppercase'
                    : 'mt-1 block text-[12.5px] font-normal text-ink-dim'
                }
              >
                {overdue
                  ? 'OVERDUE'
                  : next.dueOn === today
                    ? 'DUE TODAY'
                    : `due ${formatDateWithWeekday(next.dueOn, timezone)}`}
                {' · '}
                {next.assigneeUserId
                  ? (memberName.get(next.assigneeUserId) ?? 'Unassigned')
                  : 'Unassigned'}
              </span>
            ) : (
              <span className="mt-1 block text-[12.5px] text-ink-dim">
                No upcoming occurrences
              </span>
            )}
            <OccurrenceStrip
              dueDates={upcoming.map((o) => o.dueOn)}
              today={today}
              timezone={timezone}
              activeDate={next?.dueOn}
            />
            {chore.notes && (
              <p className="mt-3 text-sm text-ink-dim">{chore.notes}</p>
            )}
            {chore.createdBy && memberName.get(chore.createdBy) && (
              <p className="mt-3 text-[11px] text-ink-dim">
                added by {memberName.get(chore.createdBy)}
              </p>
            )}
          </>
        }
        back={
          <div className="flex flex-1 flex-col gap-3">
            {next ? (
              <>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStatus(next.id, 'done')}
                    className="btn-primary btn-compact"
                  >
                    <CheckIcon className="h-4 w-4" />
                    Done
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStatus(next.id, 'skipped')}
                    className="btn-secondary btn-compact"
                  >
                    <SkipIcon className="h-4 w-4" />
                    Skip
                  </button>
                </div>
                <MutationStatus status={status} error={error} />
              </>
            ) : (
              <p className="text-sm text-ink-dim">Nothing due right now.</p>
            )}
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
                {chore.reminders.length > 0
                  ? ` (${chore.reminders.length})`
                  : ''}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-1 underline decoration-dotted underline-offset-4"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                delete
              </button>
            </div>
          </div>
        }
      />

      <DoneStack
        labelClosed={`${filed.length} done — show all`}
        labelOpen={`${filed.length} done — hide`}
        items={filed.map((occ) => ({
          id: occ.id,
          content: `${formatDateWithWeekday(occ.dueOn, timezone)} — ${occ.status}${
            occ.assigneeUserId
              ? ` (${memberName.get(occ.assigneeUserId) ?? 'someone'})`
              : ''
          }`,
          actions: [
            {
              label: 'undo',
              icon: <UndoIcon className="h-3 w-3" />,
              onClick: () => handleUndo(occ.id),
            },
          ],
        }))}
      />

      <Sheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit chore"
      >
        <ChoreForm
          members={members}
          timezone={timezone}
          initial={chore}
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
        title="Chore reminders"
      >
        <ChoreReminderForm
          chore={chore}
          onSaved={async () => {
            setRemindersOpen(false)
            await onChange()
          }}
          onCancel={() => setRemindersOpen(false)}
        />
      </Sheet>
    </div>
  )
}

function ChoreReminderForm({
  chore,
  onSaved,
  onCancel,
}: {
  chore: ChoreView
  onSaved: () => Promise<void>
  onCancel: () => void
}) {
  const nextKey = useRef(0)
  const [rows, setRows] = useState<ReminderFormRow[]>(() =>
    chore.reminders.map((r) => ({
      key: nextKey.current++,
      offsetDays: r.offsetDays,
      hour: r.hour,
      minute: r.minute,
    })),
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function addRow(offsetDays: number, hour: number, minute: number) {
    setRows((current) =>
      current.length >= MAX_REMINDERS
        ? current
        : [...current, { key: nextKey.current++, offsetDays, hour, minute }],
    )
  }

  function updateRow(
    key: number,
    patch: Partial<Omit<ReminderFormRow, 'key'>>,
  ) {
    setRows((current) =>
      current.map((r) => (r.key === key ? { ...r, ...patch } : r)),
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
      await setChoreRemindersAction({
        data: {
          choreId: chore.id,
          reminders: rows.map(({ offsetDays, hour, minute }) => ({
            offsetDays,
            hour,
            minute,
          })),
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
        max={MAX_REMINDERS}
        onAdd={() => addRow(0, 8, 0)}
        onRemove={removeRow}
        presets={REMINDER_PRESETS.map((preset) => ({
          label: preset.label,
          onClick: () => addRow(preset.offsetDays, preset.hour, preset.minute),
        }))}
        renderRow={(row) => (
          <>
            <Stepper
              value={row.offsetDays}
              min={-30}
              max={0}
              ariaLabel="days before due date"
              onChange={(offsetDays) => updateRow(row.key, { offsetDays })}
            />
            <span className="text-xs text-ink-dim">days before, at</span>
            <input
              type="time"
              className="field w-32"
              value={timeInputValue(row.hour, row.minute)}
              aria-label="Reminder time"
              onChange={(e) => {
                const parsed = parseTimeInputValue(e.target.value)
                if (parsed) updateRow(row.key, parsed)
              }}
            />
          </>
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

function ChoreForm({
  members,
  timezone,
  initial,
  onSaved,
  onCancel,
}: {
  members: HouseholdMember[]
  timezone: string
  initial?: ChoreView
  onSaved: () => Promise<void>
  onCancel?: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [recurrenceKind, setRecurrenceKind] = useState<
    'once' | 'daily' | 'weekly' | 'monthly'
  >(initial?.recurrenceKind ?? 'weekly')
  const [interval, setInterval_] = useState(initial?.interval ?? 1)
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? [1])
  const [dayOfMonth, setDayOfMonth] = useState(initial?.dayOfMonth ?? 1)
  const [startsOn, setStartsOn] = useState(
    () => initial?.startsOn ?? todayInZone(timezone),
  )
  const [assignmentMode, setAssignmentMode] = useState<'fixed' | 'rotating'>(
    initial?.assignmentMode ?? 'fixed',
  )
  const [assigneeUserId, setAssigneeUserId] = useState(
    initial?.assigneeUserId ?? members[0]?.userId ?? '',
  )
  const [rotation, setRotation] = useState<string[]>(
    initial?.rotation ?? (members[0] ? [members[0].userId] : []),
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function toggleWeekday(day: number) {
    setWeekdays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort(),
    )
  }

  const previewDates = (() => {
    if (recurrenceKind === 'weekly' && weekdays.length === 0) return []
    try {
      const rangeEnd = addDays(startsOn, 60, timezone)
      return occurrencesBetween(
        {
          kind: recurrenceKind,
          interval,
          weekdays: recurrenceKind === 'weekly' ? weekdays : null,
          dayOfMonth: recurrenceKind === 'monthly' ? dayOfMonth : null,
          startsOn,
          endsOn: null,
        },
        startsOn,
        rangeEnd,
        timezone,
      ).slice(0, 8)
    } catch {
      return []
    }
  })()

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const fields = {
        title,
        notes: notes || undefined,
        recurrenceKind,
        interval,
        weekdays: recurrenceKind === 'weekly' ? weekdays : undefined,
        dayOfMonth: recurrenceKind === 'monthly' ? dayOfMonth : undefined,
        startsOn,
        assignmentMode,
        assigneeUserId: assignmentMode === 'fixed' ? assigneeUserId : undefined,
        rotation: assignmentMode === 'rotating' ? rotation : undefined,
      }
      if (initial) {
        await updateChoreAction({ data: { choreId: initial.id, ...fields } })
      } else {
        await createChoreAction({ data: fields })
        setTitle('')
        setNotes('')
      }
      await onSaved()
    } catch {
      setError(
        initial
          ? 'Could not save changes — check the fields above.'
          : 'Could not create the chore — check the fields above.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Title">
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </Field>

        <Field label="Description">
          <textarea
            className="field"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <Field label="Repeats">
          <SegmentedControl
            value={recurrenceKind}
            onChange={setRecurrenceKind}
            options={REPEATS_OPTIONS}
            ariaLabel="Repeats"
          />
        </Field>

        {recurrenceKind !== 'once' && (
          <Field
            label={`Every N ${
              recurrenceKind === 'daily'
                ? 'days'
                : recurrenceKind === 'weekly'
                  ? 'weeks'
                  : 'months'
            }`}
          >
            <Stepper
              value={interval}
              min={1}
              ariaLabel="repeat interval"
              onChange={setInterval_}
            />
          </Field>
        )}

        {recurrenceKind === 'weekly' && (
          <Field label="On these days">
            <WeekdayStrip selected={weekdays} onToggle={toggleWeekday} />
          </Field>
        )}

        {recurrenceKind === 'monthly' && (
          <Field label="Day of month">
            <Stepper
              value={dayOfMonth}
              min={1}
              max={31}
              ariaLabel="day of month"
              onChange={setDayOfMonth}
            />
          </Field>
        )}

        <Field label="Starts on">
          <input
            type="date"
            className="field"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
        </Field>

        <div>
          <span className="text-xs font-semibold text-ink-dim">
            Next occurrences
          </span>
          <OccurrenceStrip
            dueDates={previewDates}
            today={todayInZone(timezone)}
            timezone={timezone}
          />
        </div>

        <Field label="Assignment">
          <SegmentedControl
            value={assignmentMode}
            onChange={setAssignmentMode}
            options={ASSIGNMENT_OPTIONS}
            ariaLabel="Assignment"
          />
        </Field>

        {assignmentMode === 'fixed' ? (
          <Field label="Assignee">
            <select
              className="field"
              value={assigneeUserId}
              onChange={(e) => setAssigneeUserId(e.target.value)}
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Rotation order">
            <RotationOrderList
              members={members}
              rotation={rotation}
              onChange={setRotation}
            />
          </Field>
        )}

        <div className="flex flex-col items-start gap-3">
          <button type="submit" disabled={submitting} className="btn-primary">
            {initial ? 'Save changes' : 'Add chore'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn-tertiary">
              Cancel
            </button>
          )}
        </div>
      </form>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </>
  )
}

const ROTATION_ROW_HEIGHT = 46

/**
 * A numbered, draggable list of who's in the rotation and in what order,
 * plus the members still on the bench below (§4's suggested PR sequence —
 * rotation order gets the same reorderable treatment as category order,
 * §2.11). Dragging swaps one step at a time as the pointer crosses a
 * neighbor's row height, same pattern as `CategoryOrder` in shopping.tsx.
 */
function RotationOrderList({
  members,
  rotation,
  onChange,
}: {
  members: HouseholdMember[]
  rotation: string[]
  onChange: (next: string[]) => void
}) {
  const drag = useRef<{ id: string; y: number } | null>(null)
  const included = rotation
    .map((id) => members.find((m) => m.userId === id))
    .filter((m): m is HouseholdMember => Boolean(m))
  const excluded = members.filter((m) => !rotation.includes(m.userId))

  function move(id: string, direction: 'up' | 'down') {
    const index = rotation.indexOf(id)
    const swapWith = direction === 'up' ? index - 1 : index + 1
    if (index === -1 || swapWith < 0 || swapWith >= rotation.length) return
    const next = [...rotation]
    ;[next[index], next[swapWith]] = [next[swapWith]!, next[index]!]
    onChange(next)
  }

  function handlePointerDown(id: string, event: React.PointerEvent) {
    drag.current = { id, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!drag.current) return
    const delta = event.clientY - drag.current.y
    if (Math.abs(delta) > ROTATION_ROW_HEIGHT) {
      move(drag.current.id, delta > 0 ? 'down' : 'up')
      drag.current.y = event.clientY
    }
  }

  function handlePointerUp() {
    drag.current = null
  }

  return (
    <div className="flex flex-col gap-1.5">
      {included.map((m, i) => (
        <div
          key={m.userId}
          onPointerDown={(e) => handlePointerDown(m.userId, e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="flex touch-none items-center gap-3 rounded-control bg-inset px-[14px] py-[13px]"
        >
          <GripIcon className="h-4 w-4 shrink-0 text-ink-ghost" />
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-second text-[11px] font-semibold text-card">
            {i + 1}
          </span>
          <span className="flex-1 text-sm text-ink">{m.name ?? m.email}</span>
          <button
            type="button"
            onClick={() => onChange(rotation.filter((r) => r !== m.userId))}
            className="text-[12px] text-ink-dim underline decoration-dotted underline-offset-4"
          >
            remove
          </button>
        </div>
      ))}
      {excluded.length > 0 && (
        <div className="mt-1 flex flex-col gap-1">
          {excluded.map((m) => (
            <button
              key={m.userId}
              type="button"
              onClick={() => onChange([...rotation, m.userId])}
              className="flex items-center gap-2 self-start text-sm text-ink-dim"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {m.name ?? m.email}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
