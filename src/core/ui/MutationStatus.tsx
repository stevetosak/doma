import type { MutationStatus as Status } from '#/core/mutations/useHouseholdMutation'

/**
 * The offline honesty state (PRODUCT.md, §5 of the direction brief) — a
 * failed write says so, it never pretends. Shared across chores/shopping so
 * the wording and styling stay one voice.
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
      <span className="font-mono text-[11px] tracking-wide text-rust-ink">
        not saved — retrying…
      </span>
    )
  }
  if (status === 'error' && error) {
    return (
      <span className="font-mono text-[11px] tracking-wide text-error">
        {error}
      </span>
    )
  }
  return null
}
