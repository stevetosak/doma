import { choresModule } from '#/modules/chores/module'
import { shoppingModule } from '#/modules/shopping/module'
import type { ModuleManifest } from '#/modules/types'

/**
 * Every registered module. "Adding a module = a new folder + one import
 * line" (§5.2).
 */
export const modules: ModuleManifest[] = [choresModule, shoppingModule]

export function getModule(id: string): ModuleManifest | undefined {
  return modules.find((m) => m.id === id)
}

export interface ModuleToggleRow {
  moduleId: string
  enabled: boolean
}

/**
 * Which of `registered` are visible for a household, given its
 * `household_modules` rows. A module with no row is enabled by default
 * (§5.2 — toggles only record an override); an explicit `enabled: false`
 * row hides it. Pure — the DB read lives in module-toggles-repo.ts.
 * `registered` defaults to the real registry; tests pass a fixture list.
 */
export function visibleModules(
  toggles: readonly ModuleToggleRow[],
  registered: readonly ModuleManifest[] = modules,
): ModuleManifest[] {
  const overrides = new Map(toggles.map((t) => [t.moduleId, t.enabled]))
  return registered.filter((m) => overrides.get(m.id) ?? true)
}
