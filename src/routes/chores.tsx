import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  createChoreAction,
  getChoresData,
  setOccurrenceStatusAction,
} from '#/modules/chores/chores.functions'
import type { ChoreView } from '#/modules/chores/repo'
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

  async function refresh() {
    await router.invalidate({ sync: true })
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold">Chores</h1>

      <ChoreList chores={data.chores} onChange={refresh} />
      <NewChoreForm members={data.members} onCreated={refresh} />
    </div>
  )
}

function ChoreList({
  chores,
  onChange,
}: {
  chores: ChoreView[]
  onChange: () => Promise<void>
}) {
  if (chores.length === 0) {
    return <p className="mt-6 text-sm">No chores yet — add one below.</p>
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {chores.map((chore) => (
        <section key={chore.id} className="border p-4">
          <h2 className="text-lg font-semibold">{chore.title}</h2>
          {chore.notes && <p className="mt-1 text-sm">{chore.notes}</p>}
          <ul className="mt-3 flex flex-col gap-1">
            {chore.occurrences.length === 0 ? (
              <li className="text-sm">No upcoming occurrences.</li>
            ) : (
              chore.occurrences.map((occ) => (
                <li key={occ.id} className="flex items-center gap-3 text-sm">
                  <span className="w-28">{occ.dueOn}</span>
                  <span className="w-20">{occ.status}</span>
                  {occ.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        className="border px-2 py-0.5"
                        onClick={async () => {
                          await setOccurrenceStatusAction({
                            data: { occurrenceId: occ.id, status: 'done' },
                          })
                          await onChange()
                        }}
                      >
                        Done
                      </button>
                      <button
                        className="border px-2 py-0.5"
                        onClick={async () => {
                          await setOccurrenceStatusAction({
                            data: { occurrenceId: occ.id, status: 'skipped' },
                          })
                          await onChange()
                        }}
                      >
                        Skip
                      </button>
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
        </section>
      ))}
    </div>
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
    <section className="mt-8 border-t pt-6">
      <h2 className="text-lg font-semibold">New chore</h2>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          Title
          <input
            className="border p-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          Repeats
          <select
            className="border p-1"
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
        </label>

        {recurrenceKind !== 'once' && (
          <label className="flex flex-col gap-1">
            Every N{' '}
            {recurrenceKind === 'daily'
              ? 'days'
              : recurrenceKind === 'weekly'
                ? 'weeks'
                : 'months'}
            <input
              type="number"
              min={1}
              className="border p-1 w-20"
              value={interval}
              onChange={(e) => setInterval_(Number(e.target.value))}
            />
          </label>
        )}

        {recurrenceKind === 'weekly' && (
          <fieldset className="flex gap-3">
            {WEEKDAY_LABELS.map((wd) => (
              <label key={wd.value} className="flex items-center gap-1 text-sm">
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
          <label className="flex flex-col gap-1">
            Day of month
            <input
              type="number"
              min={1}
              max={31}
              className="border p-1 w-20"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Number(e.target.value))}
            />
          </label>
        )}

        <label className="flex flex-col gap-1">
          Starts on
          <input
            type="date"
            className="border p-1"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          Assignment
          <select
            className="border p-1"
            value={assignmentMode}
            onChange={(e) =>
              setAssignmentMode(e.target.value as 'fixed' | 'rotating')
            }
          >
            <option value="fixed">One person</option>
            <option value="rotating">Rotates</option>
          </select>
        </label>

        {assignmentMode === 'fixed' ? (
          <label className="flex flex-col gap-1">
            Assignee
            <select
              className="border p-1"
              value={assigneeUserId}
              onChange={(e) => setAssigneeUserId(e.target.value)}
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <fieldset className="flex flex-col gap-1">
            Rotation order
            {members.map((m) => (
              <label key={m.userId} className="flex items-center gap-1 text-sm">
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
          className="border px-3 py-1 self-start"
        >
          Add chore
        </button>
      </form>
      {error && <p className="mt-2 text-red-700">{error}</p>}
    </section>
  )
}
