import type { ModuleManifest } from '#/modules/types'
import {
  shoppingCategories,
  shoppingItemHistory,
  shoppingItems,
  shoppingLists,
} from './schema'

export const shoppingModule: ModuleManifest = {
  id: 'shopping',
  name: 'Shopping',
  schema: {
    shoppingLists,
    shoppingCategories,
    shoppingItems,
    shoppingItemHistory,
  },
  nav: { path: '/shopping', label: 'Shopping' },
  events: [],
}
