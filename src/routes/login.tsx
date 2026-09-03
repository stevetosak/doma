import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { sanitizeRedirectTarget } from '#/core/auth/redirect'

const ERROR_MESSAGES: Record<string, string> = {
  oauth_cancelled: 'Google sign-in was cancelled.',
  oauth_failed: 'Google sign-in failed — please try again.',
  invite_invalid: 'That invite code is invalid or has expired.',
  google_unverified_conflict:
    "That Google account's email isn't verified and matches an existing doma account. Sign in with your password first, then link Google from settings.",
  google_invite_required: 'Signing up with Google still needs an invite code.',
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: sanitizeRedirectTarget(
      typeof search.returnTo === 'string' ? search.returnTo : undefined,
    ),
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  component: LoginPage,
})

function LoginPage() {
  const { returnTo, error: oauthError } = Route.useSearch()
  const router = useRouter()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        setError(data.error ?? 'Login failed.')
        return
      }
      await router.invalidate({ sync: true })
      await navigate({ to: returnTo })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <h1 className="font-display text-4xl text-ink">Sign in</h1>
      {oauthError && (
        <p className="mt-3 text-sm text-error">
          {ERROR_MESSAGES[oauthError] ?? 'Something went wrong.'}
        </p>
      )}
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
        </label>
        {error && <p className="text-sm text-error">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-tab bg-rust px-4 py-2 text-sm font-medium text-card disabled:opacity-50"
        >
          Sign in
        </button>
      </form>
      <a
        href={`/auth/google?returnTo=${encodeURIComponent(returnTo)}`}
        className="mt-3 block rounded-tab border border-kraft/50 bg-card px-4 py-2 text-center text-sm text-ink shadow-card"
      >
        Sign in with Google
      </a>
      <p className="mt-6 font-mono text-xs text-ink-dim">
        No account?{' '}
        <a href="/register" className="text-rust underline decoration-dotted">
          Register
        </a>{' '}
        (needs an invite code, unless this is the very first account).
      </p>
    </div>
  )
}
