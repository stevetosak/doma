#!/usr/bin/env node
/**
 * Runs pending drizzle migrations behind a Postgres session advisory lock,
 * then releases it. This is doma's one migration entrypoint — used both by
 * `npm run db:migrate` (local/manual) and by scripts/start.mjs, which runs
 * it at boot before serving traffic.
 *
 * The advisory lock isn't load-bearing today (the deployment is
 * `replicas: 1` / `strategy: Recreate`, so there's never a second pod
 * racing this at boot), but it's the simplest correct choice — identical
 * locally and in-cluster, no extra manifest, and it stays correct if that
 * ever changes. Plain JS/ESM (no TypeScript, no bundler) so it can run
 * directly with plain `node` in both the dev toolchain and the slim
 * production image.
 */
import { config as loadEnv } from 'dotenv'
import { Client } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

loadEnv({ path: ['.env.local', '.env'] })

function requireEnv(name) {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

// Fixed, arbitrary session-lock key (pg_advisory_lock takes a single
// bigint). Its value carries no meaning beyond "stable across runs" — two
// doma processes migrating the same database serialize on it instead of
// racing.
const MIGRATION_LOCK_KEY = 84_271_930_581

export async function runMigrations() {
  const client = new Client({ connectionString: requireEnv('DATABASE_URL') })
  await client.connect()

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY])
    const db = drizzle(client)
    await migrate(db, { migrationsFolder: './drizzle' })
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
    await client.end()
  }
}

const isMain =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  runMigrations()
    .then(() => {
      console.log('Migrations applied (or already up to date).')
    })
    .catch((err) => {
      console.error('Migration failed:', err)
      process.exit(1)
    })
}
