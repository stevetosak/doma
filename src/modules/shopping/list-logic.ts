/**
 * Pure helpers (§1: proportionate testing for non-recurrence/auth logic,
 * but these two are small and easy to get subtly wrong, so they get real
 * unit tests rather than only living inline in the repo layer).
 */

/** The natural key for "recently bought" dedup — same item, any casing/whitespace. */
export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export interface SortableCategory {
  id: string
  sort: number
}

/**
 * Swaps a category with its neighbor in the given direction. `categories`
 * must already be sorted ascending by `sort`. Returns the (at most two)
 * rows whose `sort` needs updating, or `null` for a no-op move (unknown
 * id, or already at that end of the list).
 */
export function moveCategory(
  categories: readonly SortableCategory[],
  categoryId: string,
  direction: 'up' | 'down',
): SortableCategory[] | null {
  const index = categories.findIndex((c) => c.id === categoryId)
  if (index === -1) return null

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= categories.length) return null

  const current = categories[index] as SortableCategory
  const target = categories[targetIndex] as SortableCategory
  return [
    { id: current.id, sort: target.sort },
    { id: target.id, sort: current.sort },
  ]
}
