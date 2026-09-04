import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { AppShell } from '#/core/ui/AppShell'
import { useLiveSync } from '#/core/events/useLiveSync'
import { getTodayData } from '#/modules/today/today.functions'
import type { TodayCard } from '#/modules/today/today.functions'

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    context.auth.user && context.auth.household ? getTodayData() : null,
  component: Home,
})

function Home() {
  const { auth } = Route.useRouteContext()
  const data = Route.useLoaderData()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/auth/logout', { method: 'POST' })
    await router.invalidate({ sync: true })
  }

  if (!auth.user) {
    return <LoggedOutSplash />
  }

  if (!auth.household) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-4xl text-ink">doma</h1>
        <p className="mt-4 text-ink-dim">
          You're signed in but not part of a household yet. Ask whoever set up
          doma for an invite code, and register with it.
        </p>
      </div>
    )
  }

  return (
    <AppShell>
      <TodayDashboard
        householdName={data!.householdName}
        cards={data!.cards}
        isOwner={auth.household.role === 'owner'}
        onLogout={handleLogout}
      />
    </AppShell>
  )
}

function LoggedOutSplash() {
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <h1 className="font-display text-5xl text-ink">doma</h1>
      <p className="mt-3 text-ink-dim">
        The household's own recipe-box of what needs doing — chores, shopping,
        and whatever comes next.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          to="/login"
          search={{ returnTo: '/', error: undefined }}
          className="rounded-tab bg-ink px-4 py-3 text-center font-sans text-sm font-medium text-card"
        >
          Sign in
        </Link>
        <Link
          to="/register"
          className="rounded-tab border border-kraft px-4 py-3 text-center font-sans text-sm font-medium text-ink"
        >
          Register
        </Link>
      </div>
    </div>
  )
}

function TodayDashboard({
  householdName,
  cards,
  isOwner,
  onLogout,
}: {
  householdName: string
  cards: TodayCard[]
  isOwner: boolean
  onLogout: () => Promise<void>
}) {
  useLiveSync()
  const [hero, ...rest] = cards

  return (
    <div>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-ink">{householdName}</h1>
          <p className="mt-1 font-mono text-xs tracking-wide text-ink-dim">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3 font-mono text-xs tracking-wide text-ink-faint">
          {isOwner && (
            <Link
              to="/settings"
              className="underline decoration-dotted underline-offset-4"
            >
              settings
            </Link>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="underline decoration-dotted underline-offset-4"
          >
            log out
          </button>
        </div>
      </header>

      {!hero ? (
        <EmptyBox />
      ) : (
        <div className="mt-10">
          <HeroCard card={hero} />
          {rest.length > 0 && (
            <div className="mt-8 md:mt-16 md:overflow-x-auto md:pt-2 md:pb-10">
              <div className="card-fan flex flex-col gap-4 md:flex-row md:gap-0">
                {rest.map((card) => (
                  <TodayCardTile key={card.id} card={card} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyBox() {
  return (
    <div className="mt-16 flex flex-col items-center rounded-card border-2 border-dashed border-kraft/50 px-8 py-16 text-center">
      <p className="font-display text-2xl text-ink-dim">
        The box is empty today
      </p>
      <p className="mt-2 text-sm text-ink-faint">
        Nothing due across chores or shopping — check back tomorrow, or add
        something from a tab on the left.
      </p>
    </div>
  )
}

function HeroCard({ card }: { card: TodayCard }) {
  return (
    <Link
      to={card.href}
      className="ruled relative block rounded-card border border-line bg-card p-8 shadow-card-lifted transition-transform hover:-translate-y-0.5"
    >
      {card.overdue && (
        <span
          aria-hidden="true"
          className="absolute top-6 right-6 h-3 w-3 rounded-full bg-rust"
        />
      )}
      {card.dueLabel && (
        <span
          className={`font-mono text-xs font-semibold tracking-wide ${
            card.overdue ? 'text-rust' : 'text-ink-dim'
          }`}
        >
          {card.dueLabel.toUpperCase()}
        </span>
      )}
      <h2 className="mt-2 font-display text-3xl text-ink">{card.title}</h2>
      {card.subtitle && (
        <p className="mt-2 font-mono text-sm text-ink-dim">{card.subtitle}</p>
      )}
    </Link>
  )
}

function TodayCardTile({ card }: { card: TodayCard }) {
  return (
    <Link
      to={card.href}
      className="ruled relative block rounded-card border border-line bg-card p-5 shadow-card transition-shadow hover:shadow-card-lifted"
    >
      {card.overdue && (
        <span
          aria-hidden="true"
          className="absolute top-4 right-4 h-2.5 w-2.5 rounded-full bg-rust"
        />
      )}
      {card.dueLabel && (
        <span className="font-mono text-[11px] font-semibold tracking-wide text-rust">
          {card.dueLabel.toUpperCase()}
        </span>
      )}
      <h3 className="mt-1 font-display text-xl text-ink">{card.title}</h3>
      {card.subtitle && (
        <p className="mt-1 truncate font-mono text-xs text-ink-dim">
          {card.subtitle}
        </p>
      )}
    </Link>
  )
}
