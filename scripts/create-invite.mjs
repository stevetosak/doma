#!/usr/bin/env node
/**
 * Dev-only invite minting. There's no invite-generation UI yet (that's
 * M4's members screen) — this is how you get a code to register a second
 * account against locally. Plain JS/ESM, same style as migrate.mjs.
 *
 * Usage: node scripts/create-invite.mjs [--owner]
 *   --owner    mint an owner-role invite (default: member)
 */
import { config as loadEnv } from 'dotenv'
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'

loadEnv({ path: ['.env.local', '.env'] })

function requireEnv(name) {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

// Mirrors src/core/auth/invites.ts's generateInviteCode — kept in sync by
// hand since this script runs as plain JS, outside the TS build.
function generateInviteCode() {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = randomBytes(10)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

async function main() {
  const client = new Client({ connectionString: requireEnv('DATABASE_URL') })
  await client.connect()

  try {
    const { rows } = await client.query(`
      select h.id as household_id, h.name as household_name, m.user_id as owner_id
      from households h
      join memberships m on m.household_id = h.id and m.role = 'owner'
      order by h.created_at asc
      limit 1
    `)

    if (rows.length === 0) {
      console.error(
        'No household found yet — register the first (bootstrap) user before minting invites.',
      )
      process.exitCode = 1
      return
    }

    const {
      household_id: householdId,
      household_name: householdName,
      owner_id: ownerId,
    } = rows[0]
    const role = process.argv.includes('--owner') ? 'owner' : 'member'
    const code = generateInviteCode()

    await client.query(
      'insert into invites (household_id, code, role, created_by) values ($1, $2, $3, $4)',
      [householdId, code, role, ownerId],
    )

    console.log(`Invite code for "${householdName}" (role: ${role}): ${code}`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Failed to create invite:', err)
  process.exitCode = 1
})
