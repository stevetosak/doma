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
  createChoreAction,
  getChoresData,
  setOccurrenceStatusAction,
} from '#/modules/chores/chores.functions'
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

function ChoresPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  useLiveSync()

  async function refresh() {
    await router.invalidate({ sync: true })
  }

  const memberName = new Map(
    data.members.map((m) => [m.userId, m.name ?? m.email]),
  )

  return (
    <AppShell>
      <h1 className="font-display text-4xl text-ink">Chores</h1>

      {data.chores.length === 0 ? (
        <p className="mt-8 text-ink-dim">
          The chores divider is empty — add the first one below.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {data.chores.map((chore) => (
            <ChoreSection
              key={chore.id}
              chore={chore}
              memberName={memberName}
              onChange={refresh}
            />
          ))}
        </div>
      )}

      <NewChoreForm members={data.members} onCreated={refresh} />
    </AppShell>
  )
}

function ChoreSection({
  chore,
  memberName,
  onChange,
}: {
  chore: ChoreView
  memberName: Map<string, string>
  onChange: () => Promise<void>
}) {
  const pending = chore.occurrences.filter((o) => o.status === 'pending')
  const filed = chore.occurrences.filter((o) => o.status !== 'pending')

  return (
    <section>
      <h2 className="font-display text-2xl text-ink">{chore.title}</h2>
      {chore.notes && (
        <p className="mt-1 text-sm text-ink-dim">{chore.notes}</p>
      )}

      {pending.length === 0 ? (
        <p className="mt-3 text-sm text-ink-faint">No upcoming occurrences.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {pending.map((occ) => (
            <OccurrenceCard
              key={occ.id}
              occurrence={occ}
              assignee={
                occ.assigneeUserId
                  ? memberName.get(occ.assigneeUserId)
                  : undefined
              }
              onChange={onChange}
            />
          ))}
        </div>
      )}

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
    </section>
  )
}

function OccurrenceCard({
  occurrence,
  assignee,
  onChange,
}: {
  occurrence: ChoreOccurrenceView
  assignee: string | undefined
  onChange: () => Promise<void>
}) {
  const { status, error, run } = useHouseholdMutation()
  const today = new Date().toISOString().slice(0, 10)
  const overdue = occurrence.dueOn < today

  async function setStatus(next: 'done' | 'skipped') {
    await run(() =>
      setOccurrenceStatusAction({
        data: { occurrenceId: occurrence.id, status: next },
      }),
    )
    await onChange()
  }

  const busy = status === 'pending' || status === 'retrying'

  return (
    <FlipCard
      accent={overdue ? 'rust' : 'neutral'}
      flipLabel="assignee & actions"
      front={
        <>
          <span
            className={`font-mono text-xs font-semibold tracking-wide ${
              overdue ? 'text-rust' : 'text-ink-dim'
            }`}
          >
            {overdue
              ? 'OVERDUE'
              : occurrence.dueOn === today
                ? 'TODAY'
                : occurrence.dueOn}
          </span>
          <p className="mt-2 text-lg text-ink">Whose turn?</p>
        </>
      }
      back={
        <div className="flex flex-col gap-3">
          <p className="text-lg text-ink">
            {assignee ? assignee : 'Unassigned'}
          </p>
          <p className="font-mono text-xs tracking-wide text-blue">
            due {occurrence.dueOn}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStatus('done')}
              className="rounded-tab bg-rust px-3 py-1 text-sm font-medium text-card disabled:opacity-50"
            >
              Done
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setStatus('skipped')}
              className="rounded-tab border border-kraft px-3 py-1 text-sm font-medium text-ink disabled:opacity-50"
            >
              Skip
            </button>
          </div>
          <MutationStatus status={status} error={error} />
        </div>
      }
    />
  )
}

function NewChoreForm({
  members,
  onCreated,
}: {
  members: HouseholdMember[]
  onCreated: () => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [recurrenceKind, setRecurrenceKind] = useState<
    'once' | 'daily' | 'weekly' | 'monthly'
  >('weekly')
  const [interval, setInterval_] = useState(1)
  const [weekdays, setWeekdays] = useState<number[]>([1])
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [startsOn, setStartsOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [assignmentMode, setAssignmentMode] = useState<'fixed' | 'rotating'>(
    'fixed',
  )
  const [assigneeUserId, setAssigneeUserId] = useState(members[0]?.userId ?? '')
  const [rotation, setRotation] = useState<string[]>(
    members[0] ? [members[0].userId] : [],
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createChoreAction({
        data: {
          title,
          recurrenceKind,
          interval,
          weekdays: recurrenceKind === 'weekly' ? weekdays : undefined,
          dayOfMonth: recurrenceKind === 'monthly' ? dayOfMonth : undefined,
          startsOn,
          assignmentMode,
          assigneeUserId:
            assignmentMode === 'fixed' ? assigneeUserId : undefined,
          rotation: assignmentMode === 'rotating' ? rotation : undefined,
        },
      })
      setTitle('')
      await onCreated()
    } catch {
      setError('Could not create the chore — check the fields above.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="ruled mt-10 rounded-card border border-line bg-card p-6 shadow-card">
      <h2 className="font-display text-2xl text-ink">New chore</h2>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
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

        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded-tab bg-rust px-4 py-2 text-sm font-medium text-card disabled:opacity-50"
        >
          Add chore
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </section>
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
