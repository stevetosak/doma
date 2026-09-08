import type { CategoryView, ItemView } from './repo'

/** Bucket key for items with no category. */
export const UNCATEGORIZED = '__uncat__'

export interface Board {
  /** Category ids in display order. Does not include UNCATEGORIZED. */
  categoryOrder: string[]
  /** Item ids per bucket. Key is a category id or UNCATEGORIZED. */
  itemsByBucket: Record<string, string[]>
}

export function categoryIdToBucketKey(id: string | null): string {
  return id ?? UNCATEGORIZED
}

export function bucketKeyToCategoryId(key: string): string | null {
  return key === UNCATEGORIZED ? null : key
}

/**
 * Build the ordered board from loader data. Items are expected already
 * sorted (`sort ASC, created_at ASC`), so push order is display order.
 * Checked items and `hiddenIds` (client-side pending deletes) are left out.
 */
export function buildBoard(
  data: { categories: CategoryView[]; items: ItemView[] },
  hiddenIds?: ReadonlySet<string>,
): Board {
  const categoryOrder = data.categories.map((c) => c.id)
  const itemsByBucket: Record<string, string[]> = { [UNCATEGORIZED]: [] }
  for (const c of data.categories) itemsByBucket[c.id] = []
  for (const item of data.items) {
    if (item.isChecked) continue
    if (hiddenIds?.has(item.id)) continue
    const key = categoryIdToBucketKey(item.categoryId)
    ;(itemsByBucket[key] ??= []).push(item.id)
  }
  return { categoryOrder, itemsByBucket }
}

/**
 * Remove `itemId` from wherever it is and insert it at `(toBucket,
 * toIndex)`. Returns a new board; never mutates the input. `toIndex` is
 * clamped to the destination length.
 */
export function placeItem(
  board: Board,
  itemId: string,
  toBucket: string,
  toIndex: number,
): Board {
  const itemsByBucket: Record<string, string[]> = {}
  for (const [key, ids] of Object.entries(board.itemsByBucket)) {
    itemsByBucket[key] = ids.filter((id) => id !== itemId)
  }
  const target = (itemsByBucket[toBucket] ??= [])
  const clamped = Math.max(0, Math.min(toIndex, target.length))
  target.splice(clamped, 0, itemId)
  return { categoryOrder: [...board.categoryOrder], itemsByBucket }
}
