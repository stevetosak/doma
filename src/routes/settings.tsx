import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { AppShell } from '#/core/ui/AppShell'
import {
  changeMemberRoleAction,
  createInviteAction,
  getSettingsData,
  removeMemberAction,
  setModuleEnabledAction,
} from '#/core/household/settings.functions'
import type { HouseholdMember } from '#/core/household/members-repo'

export const Route = createFileRoute('/settings')({
  beforeLoad: ({ context }) => {
    if (!context.auth.user) {
      throw redirect({
        to: '/login',
        search: { returnTo: '/settings', error: undefined },
      })
    }
    if (!context.auth.household || context.auth.household.role !== 'owner') {
      // Members can see the household from the home page; only the owner
      // manages invites/modules (§5.3 role split).
      throw redirect({ to: '/' })
    }
  },
  loader: () => getSettingsData(),
  component: SettingsPage,
})

function SettingsPage() {
  const data = Route.useLoaderData()
  const router = useRouter()

  return (
    <AppShell>
      <h1 className="font-display text-4xl text-ink">
        {data.household.name} — settings
      </h1>

      <section className="ruled mt-8 rounded-card border border-line bg-card p-6 shadow-card">
        <h2 className="font-display text-2xl text-ink">Members</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {data.members.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              onChange={async () => {
                await router.invalidate({ sync: true })
              }}
            />
          ))}
        </ul>
      </section>

      <InviteGenerator />

      <section className="ruled mt-8 rounded-card border border-line bg-card p-6 shadow-card">
        <h2 className="font-display text-2xl text-ink">Modules</h2>
        {data.modules.length === 0 ? (
          <p className="mt-2 text-sm text-ink-dim">No optional modules yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {data.modules.map((mod) => (
              <li key={mod.id}>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={mod.enabled}
                    onChange={async (e) => {
                      await setModuleEnabledAction({
                        data: { moduleId: mod.id, enabled: e.target.checked },
                      })
                      await router.invalidate({ sync: true })
                    }}
                  />
                  {mod.name}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  )
}

function MemberRow({
  member,
  onChange,
}: {
  member: HouseholdMember
  onChange: () => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleRoleToggle() {
    setError(null)
    setSubmitting(true)
    try {
      await changeMemberRoleAction({
        data: {
          userId: member.userId,
          role: member.role === 'owner' ? 'member' : 'owner',
        },
      })
      await onChange()
    } catch {
      setError('Could not change that member’s role.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove() {
    setError(null)
    setSubmitting(true)
    try {
      await removeMemberAction({ data: { userId: member.userId } })
      await onChange()
    } catch {
      setError('Could not remove that member.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <li className="flex flex-col gap-1 font-mono text-sm text-ink">
      <div className="flex items-center justify-between gap-3">
        <span>
          {member.name ?? member.email}
          <span className="text-ink-dim"> — {member.role}</span>
        </span>
        <span className="flex gap-3 text-[11px] tracking-wide text-ink-faint">
          <button
            type="button"
            disabled={submitting}
            onClick={handleRoleToggle}
            className="underline decoration-dotted underline-offset-4 disabled:opacity-50"
          >
            make {member.role === 'owner' ? 'member' : 'owner'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleRemove}
            className="underline decoration-dotted underline-offset-4 disabled:opacity-50"
          >
            remove
          </button>
        </span>
      </div>
      {error && <span className="text-xs text-error">{error}</span>}
    </li>
  )
}

function InviteGenerator() {
  const [role, setRole] = useState<'owner' | 'member'>('member')
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await createInviteAction({ data: { role } })
      setCode(result.code)
    } catch {
      setError('Could not create an invite.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="ruled mt-8 rounded-card border border-line bg-card p-6 shadow-card">
      <h2 className="font-display text-2xl text-ink">Invite someone</h2>
      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs tracking-wide text-ink-dim">
            Role
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'owner' | 'member')}
            className="field"
          >
            <option value="member">Member</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-tab bg-rust px-4 py-2 text-sm font-medium text-card disabled:opacity-50"
        >
          Generate invite code
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
      {code && (
        <p className="mt-3 font-mono text-sm text-ink">
          Invite code: <strong className="text-rust">{code}</strong> — share it
          with them; it works once.
        </p>
      )}
    </section>
  )
}
