import { and, eq, getTableColumns, getTableName } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

export class HouseholdScopeError extends Error {}

/**
 * Tenancy enforcement is structural, not disciplinary (§5.3): every module
 * table carries `household_id NOT NULL`, and this is the one place that
 * condition gets built — module queries AND this into their `.where()`
 * instead of hand-writing `eq(table.householdId, ...)` themselves, so a
 * forgotten scope fails loudly instead of silently reading another
 * household's rows.
 *
 * Throws if `table` has no `householdId` column, so a query against a
 * table that was never supposed to be tenant-scoped (or a typo'd column
 * name) fails at call time rather than quietly returning unscoped rows.
 */
export function householdScope<T extends PgTable>(
  table: T,
  householdId: string,
  extra?: SQL,
): SQL {
  const columns = getTableColumns(table)
  const householdIdColumn = columns['householdId']
  if (!householdIdColumn) {
    throw new HouseholdScopeError(
      `Table "${getTableName(table)}" has no householdId column — every module table must carry one (§5.3).`,
    )
  }
  const scopeCondition = eq(householdIdColumn, householdId)
  return extra ? (and(scopeCondition, extra) ?? scopeCondition) : scopeCondition
}
