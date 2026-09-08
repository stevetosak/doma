import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { AppMark } from '#/core/ui/AppMark'
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
        Everything the two of you need to keep the place running — chores,
        shopping, and whatever comes next.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          to="/login"
          search={{ returnTo: '/', error: undefined }}
          className="btn-primary flex-1"
        >
          Sign in
        </Link>
        <Link to="/register" className="btn-secondary flex-1">
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
          <p className="mt-1 text-xs text-ink-dim">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3 text-xs text-ink-dim">
          <Link
            to="/account"
            className="underline decoration-dotted underline-offset-4"
          >
            account
          </Link>
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
    <div className="relative mt-16 flex flex-col items-center overflow-hidden rounded-card border-2 border-dashed border-line px-8 py-16 text-center">
      <AppMark className="pointer-events-none absolute inset-0 m-auto h-40 w-40 text-ink opacity-[0.06]" />
      <p className="relative font-display text-2xl text-ink-dim">
        Nothing due today
      </p>
      <p className="relative mt-2 text-sm text-ink-dim">
        You're clear across chores and shopping. Add something from the tabs
        below.
      </p>
    </div>
  )
}

function HeroCard({ card }: { card: TodayCard }) {
  return (
    <Link
      to={card.href}
      className="relative block rounded-card bg-card p-8 shadow-lifted transition-transform hover:-translate-y-0.5"
    >
      {card.overdue && (
        <span
          aria-hidden="true"
          className="absolute top-6 right-6 h-3 w-3 rounded-full bg-accent"
        />
      )}
      {card.dueLabel && (
        <span
          className={`text-xs font-semibold tracking-[0.06em] uppercase ${
            card.overdue ? 'text-accent' : 'text-ink-dim'
          }`}
        >
          {card.dueLabel.toUpperCase()}
        </span>
      )}
      <h2 className="mt-2 font-display text-3xl text-ink">{card.title}</h2>
      {card.subtitle && (
        <p className="mt-2 text-sm text-ink-dim">{card.subtitle}</p>
      )}
    </Link>
  )
}

function TodayCardTile({ card }: { card: TodayCard }) {
  return (
    <Link
      to={card.href}
      className="relative block rounded-card bg-card p-5 shadow-card transition-shadow hover:shadow-lifted"
    >
      {card.overdue && (
        <span
          aria-hidden="true"
          className="absolute top-4 right-4 h-2.5 w-2.5 rounded-full bg-accent"
        />
      )}
      {card.dueLabel && (
        <span className="text-[11px] font-semibold tracking-[0.06em] text-accent uppercase">
          {card.dueLabel.toUpperCase()}
        </span>
      )}
      <h3 className="mt-1 font-display text-xl text-ink">{card.title}</h3>
      {card.subtitle && (
        <p className="mt-1 truncate text-xs text-ink-dim">{card.subtitle}</p>
      )}
    </Link>
  )
}
