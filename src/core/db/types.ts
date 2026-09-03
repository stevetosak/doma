import { customType } from 'drizzle-orm/pg-core'

/**
 * Case-insensitive text, for email columns. Drizzle has no built-in `citext`
 * type, and Postgres's `citext` type lives in an extension — the migration
 * that first uses this type must be preceded by one enabling it
 * (`CREATE EXTENSION IF NOT EXISTS citext;`). See
 * drizzle/0000_enable_citext.sql.
 */
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext'
  },
})
