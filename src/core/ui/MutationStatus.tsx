import type { MutationStatus as Status } from '#/core/mutations/useHouseholdMutation'

/**
 * The offline honesty state (PRODUCT.md) — a failed write says so, it
 * never pretends. Shared across chores/shopping so the wording and
 * styling stay one voice. A reserved min-height (§2.8) keeps the card
 * from jumping when the status appears or clears.
 */
export function MutationStatus({
  status,
  error,
}: {
  status: Status
  error: string | null
}) {
  return (
    <span className="block min-h-[16px] text-[13px]">
      {status === 'retrying' && (
        <span className="text-accent-deep">not saved — retrying…</span>
      )}
      {status === 'error' && error && (
        <span className="text-error">{error}</span>
      )}
    </span>
  )
}
