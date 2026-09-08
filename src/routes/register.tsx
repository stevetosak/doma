import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { AppLogo } from '#/core/ui/AppLogo'
import { Field } from '#/core/ui/Field'
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
      <AppLogo
        markClassName="h-9 w-9"
        wordClassName="text-2xl"
        className="mb-8"
      />
      <h1 className="font-display text-4xl text-ink">
        {bootstrap ? 'Create the first account' : 'Join with an invite code'}
      </h1>
      <form
        onSubmit={handleSubmit}
        className="mt-6 flex flex-col gap-4 rounded-card bg-card p-6 shadow-card"
      >
        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
        </Field>
        <Field label="Name (optional)">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
          />
        </Field>
        {bootstrap ? (
          <Field label="Household name">
            <input
              required
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              className="field"
            />
          </Field>
        ) : (
          <Field label="Invite code">
            <input
              required
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="field"
            />
          </Field>
        )}
        {error && <p className="text-sm text-error">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary">
          {bootstrap ? 'Create account' : 'Join'}
        </button>
      </form>
    </div>
  )
}
