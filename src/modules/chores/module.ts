import type { ModuleManifest } from '#/modules/types'
import { choreOccurrences, choreReminders, chores } from './schema'

export const choresModule: ModuleManifest = {
  id: 'chores',
  name: 'Chores',
  schema: { chores, choreOccurrences, choreReminders },
  nav: { path: '/chores', label: 'Chores' },
  events: [],
}
