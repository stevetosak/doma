import { describe, expect, it } from 'vitest'
import { validateAddSearch } from './add-shortcut'

describe('validateAddSearch', () => {
  it('recognises ?add=1 from the shortcut URL', () => {
    expect(validateAddSearch({ add: '1' })).toEqual({ add: true })
  })

  it('recognises an already-parsed boolean true', () => {
    expect(validateAddSearch({ add: true })).toEqual({ add: true })
  })

  it('drops the flag when absent, empty, or any other value', () => {
    expect(validateAddSearch({})).toEqual({})
    expect(validateAddSearch({ add: '0' })).toEqual({})
    expect(validateAddSearch({ add: 'yes' })).toEqual({})
    expect(validateAddSearch({ add: false })).toEqual({})
    expect(validateAddSearch({ other: '1' })).toEqual({})
  })

  it('never returns add:false — the route clears it by omission', () => {
    expect(validateAddSearch({ add: 'nope' })).not.toHaveProperty('add')
  })
})
