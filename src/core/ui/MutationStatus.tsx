import type { MutationStatus as Status } from '#/core/mutations/useHouseholdMutation'

/**
 * The offline honesty state (PRODUCT.md) — a failed write says so, it
 * never pretends. Shared across chores/shopping so the wording and
 * styling stay one voice. Rendered only when a mutation is in flight or
 * failed (§2.1) — no reserved empty row; ActionCard's face has no fixed
 * slot to protect from a layout jump, and the rare `retrying`/`error`
 * line pushing the icon rail down half a beat reads fine.
 */
export function MutationStatus({
  status,
  error,
}: {
  status: Status
  error: string | null
}) {
  if (status === 'retrying') {
    return (
      <span className="block text-[13px] text-accent-deep">
        not saved — retrying…
      </span>
    )
  }
  if (status === 'error' && error) {
    return <span className="block text-[13px] text-error">{error}</span>
  }
  return null
}
