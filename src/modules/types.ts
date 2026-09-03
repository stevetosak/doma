import type { PgTable } from 'drizzle-orm/pg-core'

/**
 * The module contract (§5.2). A module = a folder under `src/modules/` that
 * exports one manifest; `registry.ts` collects every manifest into the nav,
 * the dashboard, the schema barrel, the job registry and the event topic
 * list. No modules exist yet — chores (M5) and shopping (M6) are the first
 * two real ones.
 *
 * `icon` is typed loosely (a lucide icon name) rather than importing
 * `lucide-react` — that dependency lands with M5's UI work, not before
 * there's anything to render with it.
 */
export interface ModuleManifest {
  /** Stable — used as a DB key (household_modules.module_id) and an event-topic prefix. Never rename once shipped. */
  id: string
  name: string
  icon?: string
  /** Merged into the single migration set via src/core/db/schema.ts. */
  schema: Record<string, PgTable>
  nav?: { path: string; label: string }
  /** SSE topics this module publishes (M7). */
  events: readonly string[]
  // `widgets` (dashboard contributions), `jobs` (pg-boss registrations) and
  // `onEnable` (seed defaults) are deliberately not here yet — nothing in
  // the app has a dashboard, pg-boss, or an enable-time seeding hook to
  // consume them (M8 territory). Add them when a real module needs them.
}
