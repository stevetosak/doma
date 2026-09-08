import { describe, expect, it } from 'vitest'
import {
  UNCATEGORIZED,
  bucketKeyToCategoryId,
  buildBoard,
  categoryIdToBucketKey,
  placeItem,
} from './board'
import type { CategoryView, ItemView } from './repo'

const cat = (id: string, sort: number): CategoryView => ({ id, name: id, sort })

const item = (
  id: string,
  categoryId: string | null,
  isChecked = false,
): ItemView => ({
  id,
  name: id,
  quantity: null,
  unit: null,
  note: null,
  categoryId,
  priority: null,
  isChecked,
  addedBy: null,
  reminders: [],
})

describe('bucket key helpers', () => {
  it('round-trips a category id', () => {
    expect(bucketKeyToCategoryId(categoryIdToBucketKey('c1'))).toBe('c1')
  })
  it('maps null to the uncategorized key and back', () => {
    expect(categoryIdToBucketKey(null)).toBe(UNCATEGORIZED)
    expect(bucketKeyToCategoryId(UNCATEGORIZED)).toBeNull()
  })
})

describe('buildBoard', () => {
  const data = {
    categories: [cat('c1', 0), cat('c2', 1)],
    items: [
      item('i1', 'c1'),
      item('i2', 'c1'),
      item('i3', 'c2'),
      item('i4', null),
      item('i5', 'c1', true),
    ],
  }

  it('orders categories by the categories array', () => {
    expect(buildBoard(data).categoryOrder).toEqual(['c1', 'c2'])
  })

  it('groups unchecked items by bucket, preserving array order', () => {
    const board = buildBoard(data)
    expect(board.itemsByBucket).toEqual({
      c1: ['i1', 'i2'],
      c2: ['i3'],
      [UNCATEGORIZED]: ['i4'],
    })
  })

  it('creates an empty bucket for a category with no items', () => {
    const board = buildBoard({ categories: [cat('c9', 0)], items: [] })
    expect(board.itemsByBucket.c9).toEqual([])
  })

  it('excludes checked items', () => {
    expect(buildBoard(data).itemsByBucket.c1).not.toContain('i5')
  })

  it('excludes hidden ids', () => {
    const board = buildBoard(data, new Set(['i2']))
    expect(board.itemsByBucket.c1).toEqual(['i1'])
  })
})

describe('placeItem', () => {
  const board = {
    categoryOrder: ['c1', 'c2'],
    itemsByBucket: { c1: ['i1', 'i2', 'i3'], c2: ['i4'], [UNCATEGORIZED]: [] },
  }

  it('reorders within a bucket', () => {
    const next = placeItem(board, 'i1', 'c1', 2)
    expect(next.itemsByBucket.c1).toEqual(['i2', 'i3', 'i1'])
  })

  it('moves across buckets and removes from the source', () => {
    const next = placeItem(board, 'i2', 'c2', 0)
    expect(next.itemsByBucket.c1).toEqual(['i1', 'i3'])
    expect(next.itemsByBucket.c2).toEqual(['i2', 'i4'])
  })

  it('clamps an out-of-range index to the bucket end', () => {
    const next = placeItem(board, 'i4', 'c1', 99)
    expect(next.itemsByBucket.c1).toEqual(['i1', 'i2', 'i3', 'i4'])
  })

  it('does not mutate the input board', () => {
    placeItem(board, 'i1', 'c2', 0)
    expect(board.itemsByBucket.c1).toEqual(['i1', 'i2', 'i3'])
  })

  it('leaves categoryOrder untouched', () => {
    expect(placeItem(board, 'i1', 'c2', 0).categoryOrder).toEqual(['c1', 'c2'])
  })
})
