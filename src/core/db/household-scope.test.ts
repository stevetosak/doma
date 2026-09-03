import { eq } from 'drizzle-orm'
import { PgDialect, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { HouseholdScopeError, householdScope } from './household-scope'

const scopedTable = pgTable('fixture_scoped', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull(),
  name: text('name').notNull(),
})

const unscopedTable = pgTable('fixture_unscoped', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
})

const HOUSEHOLD_ID = '11111111-1111-1111-1111-111111111111'
const dialect = new PgDialect()

describe('householdScope', () => {
  it('builds an eq(householdId, ...) condition for a scoped table', () => {
    const condition = householdScope(scopedTable, HOUSEHOLD_ID)
    expect(condition).toEqual(eq(scopedTable.householdId, HOUSEHOLD_ID))
  })

  it('ANDs in an extra condition when given one', () => {
    const extra = eq(scopedTable.name, 'x')
    const condition = householdScope(scopedTable, HOUSEHOLD_ID, extra)
    const { sql, params } = dialect.sqlToQuery(condition)
    expect(sql).toContain('household_id')
    expect(sql).toContain('name')
    expect(sql).toMatch(/and/i)
    expect(params).toEqual([HOUSEHOLD_ID, 'x'])
  })

  it('refuses a table with no householdId column', () => {
    expect(() => householdScope(unscopedTable, HOUSEHOLD_ID)).toThrow(
      HouseholdScopeError,
    )
  })
})
