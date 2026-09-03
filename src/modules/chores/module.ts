import type { ModuleManifest } from '#/modules/types'
import { choreOccurrences, chores } from './schema'

export const choresModule: ModuleManifest = {
  id: 'chores',
  name: 'Chores',
  schema: { chores, choreOccurrences },
  nav: { path: '/chores', label: 'Chores' },
  events: [],
}
