import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { AppShell } from '#/core/ui/AppShell'
import {
  createTelegramLinkAction,
  getTelegramStatus,
} from '#/core/notify/telegram.functions'

export const Route = createFileRoute('/account')({
  beforeLoad: ({ context }) => {
    if (!context.auth.user) {
      throw redirect({
        to: '/login',
        search: { returnTo: '/account', error: undefined },
      })
    }
  },
  loader: () => getTelegramStatus(),
  component: AccountPage,
})

function AccountPage() {
  const status = Route.useLoaderData()

  return (
    <AppShell>
      <h1 className="font-display text-4xl text-ink">Account</h1>

      <section className="ruled mt-8 rounded-card border border-line bg-card p-6 shadow-card">
        <h2 className="font-display text-2xl text-ink">Telegram reminders</h2>
        {!status.configured ? (
          <p className="mt-2 text-sm text-ink-dim">
            Telegram isn't set up for this household yet.
          </p>
        ) : (
          <TelegramLinkPanel linked={status.linked} />
        )}
      </section>
    </AppShell>
  )
}

function TelegramLinkPanel({ linked }: { linked: boolean }) {
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleLink() {
    setError(null)
    setSubmitting(true)
    try {
      const result = await createTelegramLinkAction()
      setDeepLink(result.deepLink)
    } catch {
      setError('Could not create a link — try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (linked && !deepLink) {
    return (
      <p className="mt-2 text-sm text-ink-dim">
        Linked — chore reminders you turn on will DM you here.{' '}
        <button
          type="button"
          onClick={handleLink}
          disabled={submitting}
          className="text-rust underline decoration-dotted underline-offset-4 disabled:opacity-50"
        >
          Re-link
        </button>
      </p>
    )
  }

  return (
    <div className="mt-2">
      <p className="text-sm text-ink-dim">
        Link your Telegram to get a DM before a chore is due.
      </p>
      {deepLink ? (
        <p className="mt-3 font-mono text-sm text-ink">
          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-rust underline decoration-dotted underline-offset-4"
          >
            Open Telegram to finish linking
          </a>{' '}
          — the link works once and expires in 15 minutes.
        </p>
      ) : (
        <button
          type="button"
          onClick={handleLink}
          disabled={submitting}
          className="mt-3 rounded-tab bg-rust px-4 py-3 text-sm font-medium text-card disabled:opacity-50"
        >
          Get a link
        </button>
      )}
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </div>
  )
}
