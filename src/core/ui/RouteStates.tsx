/**
 * Route pending/error states (§ new states) — neither existed before this
 * pass; every route navigation just showed nothing until it resolved, and
 * a thrown loader error had no recovery path at all.
 */
export function RoutePending() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="text-sm text-ink-dim">Loading…</p>
    </div>
  )
}

export function RouteError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-sm flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-2xl text-ink">That didn't load</p>
      <p className="mt-2 text-sm text-ink-dim">
        Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="btn-primary btn-compact mt-6"
      >
        Retry
      </button>
    </div>
  )
}
