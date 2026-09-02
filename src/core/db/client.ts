import { drizzle } from 'drizzle-orm/node-postgres'

import { requireEnv } from '#/core/env'
import * as schema from './schema'

export const db = drizzle(requireEnv('DATABASE_URL'), { schema })
