import { createFileRoute, useRouter } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const { auth } = Route.useRouteContext()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/auth/logout', { method: 'POST' })
    await router.invalidate({ sync: true })
  }

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold">doma</h1>
      <p className="mt-4 text-lg">
        The household hub is under construction. Milestone 2 (auth) — the real
        UI lands from Milestone 5 onward, built into the locked direction in{' '}
        <code>docs/design-direction.md</code>.
      </p>

      {auth.user ? (
        <div className="mt-6">
          <p>
            Signed in as <strong>{auth.user.email}</strong>
            {auth.household
              ? ` — ${auth.household.role} of ${auth.household.name}`
              : ' (no household yet)'}
          </p>
          <button onClick={handleLogout} className="mt-2 border px-3 py-1">
            Log out
          </button>
        </div>
      ) : (
        <div className="mt-6 flex gap-3">
          <a href="/login" className="border px-3 py-1">
            Sign in
          </a>
          <a href="/register" className="border px-3 py-1">
            Register
          </a>
        </div>
      )}
    </div>
  )
}
