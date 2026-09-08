/**
 * `?add=1` on /shopping and /chores opens that page's add sheet on load.
 * It is the target of the "Add shopping item" / "Add chore" home-screen
 * shortcuts declared in `public/manifest.webmanifest`. Shared so both
 * routes parse the flag identically; the value is normalised to `true` or
 * absent so the route can clear it with `navigate({ search: {} })`.
 */
export function validateAddSearch(search: Record<string, unknown>): {
  add?: true
} {
  return search.add === '1' || search.add === true ? { add: true } : {}
}
