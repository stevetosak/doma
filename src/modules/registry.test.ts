import { describe, expect, it } from 'vitest'
import { visibleModules } from './registry'
import type { ModuleManifest } from './types'

const chores: ModuleManifest = {
  id: 'chores',
  name: 'Chores',
  schema: {},
  nav: { path: '/chores', label: 'Chores' },
  events: [],
}
const shopping: ModuleManifest = {
  id: 'shopping',
  name: 'Shopping',
  schema: {},
  nav: { path: '/shopping', label: 'Shopping' },
  events: [],
}
const fixtureRegistry = [chores, shopping]

describe('visibleModules', () => {
  it('shows every registered module when there are no toggle rows', () => {
    expect(visibleModules([], fixtureRegistry)).toEqual(fixtureRegistry)
  })

  it('hides a module with an explicit enabled: false row', () => {
    const result = visibleModules(
      [{ moduleId: 'chores', enabled: false }],
      fixtureRegistry,
    )
    expect(result).toEqual([shopping])
  })

  it('keeps a module with an explicit enabled: true row', () => {
    const result = visibleModules(
      [{ moduleId: 'chores', enabled: true }],
      fixtureRegistry,
    )
    expect(result).toEqual(fixtureRegistry)
  })

  it('ignores a toggle row for a module that is not registered', () => {
    const result = visibleModules(
      [{ moduleId: 'unknown-module', enabled: false }],
      fixtureRegistry,
    )
    expect(result).toEqual(fixtureRegistry)
  })
})
