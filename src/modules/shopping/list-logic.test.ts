import { describe, expect, it } from 'vitest'
import { normalizeItemName } from './list-logic'

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
