import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { AppShell } from '#/core/ui/AppShell'
import { DoneStack } from '#/core/ui/DoneStack'
import { FlipCard } from '#/core/ui/FlipCard'
import { MutationStatus } from '#/core/ui/MutationStatus'
import { Sheet } from '#/core/ui/Sheet'
import { useLiveSync } from '#/core/events/useLiveSync'
import { useHouseholdMutation } from '#/core/mutations/useHouseholdMutation'
import {
  archiveChoreAction,
  createChoreAction,
  getChoresData,
  setOccurrenceStatusAction,
  updateChoreAction,
} from '#/modules/chores/chores.functions'
import { occurrencesBetween } from '#/modules/chores/recurrence'
import { addDays, todayInZone } from '#/modules/chores/time'
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

const WEEKDAY_LABELS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
]

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
          className="shrink-0 rounded-tab bg-rust px-4 py-2 text-sm font-medium text-card"
        >
          + Add chore
        </button>
      </div>

      {data.chores.length === 0 ? (
        <p className="mt-8 text-ink-dim">
          The chores divider is empty — add the first one above.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {data.chores.map((chore) => (
            <ChoreCard
              key={chore.id}
              chore={chore}
              members={data.members}
              memberName={memberName}
              timezone={data.timezone}
              onChange={refresh}
            />
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
  activeDate,
}: {
  dueDates: string[]
  today: string
  // The single occurrence actually actionable from this card (the soonest
  // pending one) — filled solid so it reads apart from an overdue backlog
  // that has piled up but isn't reachable via Done/Skip from here.
  activeDate?: string
}) {
  if (dueDates.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {dueDates.map((d) => {
        const isActive = activeDate != null && d === activeDate
        const className = isActive
          ? 'bg-rust text-card'
          : d < today
            ? 'border border-rust/50 text-rust-ink'
            : d === today
              ? 'bg-rust-soft text-rust-ink'
              : 'border border-kraft/40 text-ink-faint'
        return (
          <span
            key={d}
            className={`rounded-tab px-1.5 py-0.5 font-mono text-[11px] tracking-wide ${className}`}
          >
            {d.slice(5)}
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
  const today = todayInZone(timezone)
  const filed = chore.occurrences.filter((o) => o.status !== 'pending')
  const upcoming = chore.occurrences
    .filter((o) => o.status === 'pending')
    .slice(0, 8)
  const next = nextPendingOccurrence(chore)
  const overdue = next ? next.dueOn < today : false

  async function setStatus(
    occurrenceId: string,
    nextStatus: 'done' | 'skipped',
  ) {
    await run(() =>
      setOccurrenceStatusAction({ data: { occurrenceId, status: nextStatus } }),
    )
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
        accent={overdue ? 'rust' : 'neutral'}
        flipLabel="assignee & actions"
        front={
          <>
            <h2 className="font-display text-2xl text-ink">{chore.title}</h2>
            {next ? (
              <span
                className={`mt-1 block font-mono text-xs font-semibold tracking-wide ${
                  overdue ? 'text-rust' : 'text-ink-dim'
                }`}
              >
                {overdue
                  ? 'OVERDUE'
                  : next.dueOn === today
                    ? 'DUE TODAY'
                    : `due ${next.dueOn}`}
              </span>
            ) : (
              <span className="mt-1 block font-mono text-xs text-ink-faint">
                No upcoming occurrences
              </span>
            )}
            <OccurrenceStrip
              dueDates={upcoming.map((o) => o.dueOn)}
              today={today}
              activeDate={next?.dueOn}
            />
            {chore.createdBy && memberName.get(chore.createdBy) && (
              <p className="mt-3 font-mono text-[11px] tracking-wide text-ink-faint">
                added by {memberName.get(chore.createdBy)}
              </p>
            )}
          </>
        }
        back={
          <div className="flex flex-col gap-3">
            {next ? (
              <>
                <p className="text-lg text-ink">
                  {next.assigneeUserId
                    ? (memberName.get(next.assigneeUserId) ?? 'Unassigned')
                    : 'Unassigned'}
                </p>
                <p className="font-mono text-xs tracking-wide text-blue">
                  due {next.dueOn}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStatus(next.id, 'done')}
                    className="rounded-tab bg-rust px-3 py-1 text-sm font-medium text-card disabled:opacity-50"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStatus(next.id, 'skipped')}
                    className="rounded-tab border border-kraft px-3 py-1 text-sm font-medium text-ink disabled:opacity-50"
                  >
                    Skip
                  </button>
                </div>
                <MutationStatus status={status} error={error} />
              </>
            ) : (
              <p className="text-sm text-ink-faint">Nothing due right now.</p>
            )}
            {chore.notes && (
              <p className="text-sm text-ink-dim">{chore.notes}</p>
            )}
            <div className="mt-1 flex gap-3 border-t border-line pt-3 font-mono text-[11px] tracking-wide text-ink-faint">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="underline decoration-dotted underline-offset-4"
              >
                edit
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="underline decoration-dotted underline-offset-4"
              >
                delete
              </button>
            </div>
          </div>
        }
      />

      <DoneStack
        label="filed"
        items={filed.map((occ) => ({
          id: occ.id,
          content: `${occ.dueOn} — ${occ.status}${
            occ.assigneeUserId
              ? ` (${memberName.get(occ.assigneeUserId) ?? 'someone'})`
              : ''
          }`,
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
    </div>
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

  function toggleRotationMember(userId: string) {
    setRotation((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
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

        <Field label="Repeats">
          <select
            className="field"
            value={recurrenceKind}
            onChange={(e) =>
              setRecurrenceKind(
                e.target.value as 'once' | 'daily' | 'weekly' | 'monthly',
              )
            }
          >
            <option value="once">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
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
            <input
              type="number"
              min={1}
              className="field w-24"
              value={interval}
              onChange={(e) => setInterval_(Number(e.target.value))}
            />
          </Field>
        )}

        {recurrenceKind === 'weekly' && (
          <fieldset className="flex flex-wrap gap-3">
            {WEEKDAY_LABELS.map((wd) => (
              <label
                key={wd.value}
                className="flex items-center gap-1.5 font-mono text-sm text-ink"
              >
                <input
                  type="checkbox"
                  checked={weekdays.includes(wd.value)}
                  onChange={() => toggleWeekday(wd.value)}
                />
                {wd.label}
              </label>
            ))}
          </fieldset>
        )}

        {recurrenceKind === 'monthly' && (
          <Field label="Day of month">
            <input
              type="number"
              min={1}
              max={31}
              className="field w-24"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Number(e.target.value))}
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
          <span className="font-mono text-xs tracking-wide text-ink-dim">
            Next occurrences
          </span>
          <OccurrenceStrip
            dueDates={previewDates}
            today={todayInZone(timezone)}
          />
        </div>

        <Field label="Assignment">
          <select
            className="field"
            value={assignmentMode}
            onChange={(e) =>
              setAssignmentMode(e.target.value as 'fixed' | 'rotating')
            }
          >
            <option value="fixed">One person</option>
            <option value="rotating">Rotates</option>
          </select>
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
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 font-mono text-xs tracking-wide text-ink-dim">
              Rotation order
            </legend>
            {members.map((m) => (
              <label
                key={m.userId}
                className="flex items-center gap-1.5 text-sm text-ink"
              >
                <input
                  type="checkbox"
                  checked={rotation.includes(m.userId)}
                  onChange={() => toggleRotationMember(m.userId)}
                />
                {m.name ?? m.email}
              </label>
            ))}
          </fieldset>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="self-start rounded-tab bg-rust px-4 py-2 text-sm font-medium text-card disabled:opacity-50"
          >
            {initial ? 'Save changes' : 'Add chore'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="font-mono text-xs tracking-wide text-ink-faint underline decoration-dotted underline-offset-4"
            >
              cancel
            </button>
          )}
        </div>
      </form>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-xs tracking-wide text-ink-dim">
        {label}
      </span>
      {children}
    </label>
  )
}
