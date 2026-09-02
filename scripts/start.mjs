#!/usr/bin/env node
/**
 * Production boot: run migrations behind the advisory lock, then start the
 * built server. This is the container's real entrypoint (see Dockerfile) —
 * `node .output/server/index.mjs` alone would serve traffic before the
 * schema exists on a fresh database.
 */
import { runMigrations } from './migrate.mjs'

await runMigrations()
console.log('Migrations applied (or already up to date). Starting server…')

await import('../.output/server/index.mjs')
