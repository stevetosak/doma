import { eq } from 'drizzle-orm'
import { householdModules } from '#/core/household/schema'
import { db } from '#/core/db/client'
import type { ModuleToggleRow } from '#/modules/registry'

export async function listModuleToggles(
  householdId: string,
): Promise<ModuleToggleRow[]> {
  const rows = await db
    .select({
      moduleId: householdModules.moduleId,
      enabled: householdModules.enabled,
    })
    .from(householdModules)
    .where(eq(householdModules.householdId, householdId))
  return rows
}

export async function setModuleEnabled(
  householdId: string,
  moduleId: string,
  enabled: boolean,
): Promise<void> {
  await db
    .insert(householdModules)
    .values({ householdId, moduleId, enabled })
    .onConflictDoUpdate({
      target: [householdModules.householdId, householdModules.moduleId],
      set: { enabled },
    })
}
