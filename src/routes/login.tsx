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
    <div className="p-8 max-w-sm">
      <h1 className="text-2xl font-bold">Sign in</h1>
      {oauthError && (
        <p className="text-red-700 mt-2">
          {ERROR_MESSAGES[oauthError] ?? 'Something went wrong.'}
        </p>
      )}
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full border p-1"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="block w-full border p-1"
          />
        </label>
        {error && <p className="text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="border px-3 py-1"
        >
          Sign in
        </button>
      </form>
      <a
        href={`/auth/google?returnTo=${encodeURIComponent(returnTo)}`}
        className="mt-4 block border px-3 py-1 text-center"
      >
        Sign in with Google
      </a>
      <p className="mt-4 text-sm">
        No account? <a href="/register">Register</a> (needs an invite code,
        unless this is the very first account).
      </p>
    </div>
  )
}
