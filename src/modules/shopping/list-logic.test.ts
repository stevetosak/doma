import { describe, expect, it } from 'vitest'
import { moveCategory, normalizeItemName } from './list-logic'

describe('normalizeItemName', () => {
  it('lowercases and trims', () => {
    expect(normalizeItemName('  Milk  ')).toBe('milk')
  })

  it('collapses internal whitespace', () => {
    expect(normalizeItemName('olive   oil')).toBe('olive oil')
  })

  it('treats differently-cased/spaced input as the same key', () => {
    expect(normalizeItemName('MILK')).toBe(normalizeItemName(' milk '))
  })
})

describe('moveCategory', () => {
  const categories = [
    { id: 'a', sort: 0 },
    { id: 'b', sort: 1 },
    { id: 'c', sort: 2 },
  ]

  it('swaps with the previous category when moving up', () => {
    expect(moveCategory(categories, 'b', 'up')).toEqual([
      { id: 'b', sort: 0 },
      { id: 'a', sort: 1 },
    ])
  })

  it('swaps with the next category when moving down', () => {
    expect(moveCategory(categories, 'b', 'down')).toEqual([
      { id: 'b', sort: 2 },
      { id: 'c', sort: 1 },
    ])
  })

  it('is a no-op moving the first category up', () => {
    expect(moveCategory(categories, 'a', 'up')).toBeNull()
  })

  it('is a no-op moving the last category down', () => {
    expect(moveCategory(categories, 'c', 'down')).toBeNull()
  })

  it('is a no-op for an unknown id', () => {
    expect(moveCategory(categories, 'missing', 'up')).toBeNull()
  })

  it('is a no-op on a single-category list', () => {
    expect(moveCategory([{ id: 'only', sort: 0 }], 'only', 'up')).toBeNull()
    expect(moveCategory([{ id: 'only', sort: 0 }], 'only', 'down')).toBeNull()
  })
})
