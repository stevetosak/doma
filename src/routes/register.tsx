import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { isBootstrapMode } from '#/core/auth/auth-context.functions'

export const Route = createFileRoute('/register')({
  loader: () => isBootstrapMode(),
  component: RegisterPage,
})

function RegisterPage() {
  const bootstrap = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const body = bootstrap
        ? { email, password, name: name || undefined, householdName }
        : { email, password, name: name || undefined, inviteCode }

      const response = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        setError(data.error ?? 'Registration failed.')
        return
      }

      await router.invalidate({ sync: true })
      await navigate({ to: '/' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <h1 className="font-display text-4xl text-ink">
        {bootstrap ? 'Create the first account' : 'Join with an invite code'}
      </h1>
      <form
        onSubmit={handleSubmit}
        className="ruled mt-6 flex flex-col gap-4 rounded-card border border-line bg-card p-6 shadow-card"
      >
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs tracking-wide text-ink-dim">
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs tracking-wide text-ink-dim">
            Password
          </span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs tracking-wide text-ink-dim">
            Name (optional)
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
          />
        </label>
        {bootstrap ? (
          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs tracking-wide text-ink-dim">
              Household name
            </span>
            <input
              required
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              className="field"
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs tracking-wide text-ink-dim">
              Invite code
            </span>
            <input
              required
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="field"
            />
          </label>
        )}
        {error && <p className="text-sm text-error">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-tab bg-rust px-4 py-3 text-sm font-medium text-card disabled:opacity-50"
        >
          {bootstrap ? 'Create account' : 'Join'}
        </button>
      </form>
    </div>
  )
}
