import { drizzle } from 'drizzle-orm/node-postgres'

import { requireEnv } from '#/core/env'
import * as schema from './schema'

export const db = drizzle(requireEnv('DATABASE_URL'), { schema })

/** The `tx` handle inside `db.transaction(async (tx) => ...)` — derived rather than imported from drizzle's internals, so it always matches this project's actual schema type. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
