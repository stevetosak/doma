import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  createInviteAction,
  getSettingsData,
  setModuleEnabledAction,
} from '#/core/household/settings.functions'

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
    <div className="p-8 max-w-lg">
      <h1 className="text-2xl font-bold">{data.household.name} — settings</h1>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Members</h2>
        <ul className="mt-2">
          {data.members.map((member) => (
            <li key={member.userId}>
              {member.name ?? member.email} — {member.role}
            </li>
          ))}
        </ul>
      </section>

      <InviteGenerator />

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Modules</h2>
        {data.modules.length === 0 ? (
          <p className="mt-2 text-sm">No optional modules yet.</p>
        ) : (
          <ul className="mt-2">
            {data.modules.map((mod) => (
              <li key={mod.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={mod.enabled}
                    onChange={async (e) => {
                      await setModuleEnabledAction({
                        data: { moduleId: mod.id, enabled: e.target.checked },
                      })
                      await router.invalidate({ sync: true })
                    }}
                  />{' '}
                  {mod.name}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
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
    <section className="mt-6">
      <h2 className="text-lg font-semibold">Invite someone</h2>
      <form onSubmit={handleSubmit} className="mt-2 flex items-end gap-3">
        <label>
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'owner' | 'member')}
            className="block border p-1"
          >
            <option value="member">Member</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="border px-3 py-1"
        >
          Generate invite code
        </button>
      </form>
      {error && <p className="mt-2 text-red-700">{error}</p>}
      {code && (
        <p className="mt-2">
          Invite code: <strong>{code}</strong> — share it with them; it works
          once.
        </p>
      )}
    </section>
  )
}
