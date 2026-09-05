# Generalized Items & Reminders + Telegram Bot UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize doma's reminder system beyond chores (to shopping items and future modules) via a real, DB-enforced polymorphic `items`/`reminders` model; decouple reminder-editing from the create/edit forms into its own per-item action; and give Telegram reminder DMs real formatting plus an inline "mark done" button.

**Architecture:** A shared `items` supertype table that `chores` and `shopping_items` key off (their `id` becomes a real FK to `items.id`, not a self-generated uuid), and one generic `reminders` table referencing `items.id` (relative offset-mode for chores, absolute fire-time mode for shopping, enforced by a CHECK constraint). Two shared functions (`createItemRecord`/`deleteItemRecord`) are the only path to creating/removing a polymorphic item, so the FK can't be silently bypassed in code either. The notify layer's existing exactly-once dispatch/outbox/sweep needs only two small generalizations: a single existence lookup (was per-table) and a new `kind`-keyed liveness check. Telegram formatting and the mark-done button are additive changes to the transport layer.

**Tech Stack:** TanStack Start, Drizzle ORM (`drizzle-orm@^0.45.1`, `drizzle-kit@^0.31.9`) against Postgres, pg-boss, grammy (Telegram), Zod, Luxon, Vitest, React 19.

**Spec:** `docs/superpowers/specs/2026-09-05-generalized-reminders-design.md`

## Global Constraints

- One branch + one PR per phase (5 phases below = 5 PRs), matching this project's standing workflow: push, open the PR, **stop and wait for review** before starting the next phase. Never push directly to `main`.
- This repo has **no DB-integration test suite** — every existing `.test.ts` file tests pure, DB-free logic only (see `src/modules/chores/reminder-time.test.ts`, `recurrence.test.ts`, `src/modules/shopping/list-logic.test.ts`, `src/core/db/household-scope.test.ts`). Follow that convention: write real Vitest unit tests only for pure logic introduced below (there are three such pieces — `resolveReminderFireAt`/`toLocalInputValue` in Phase 4, `escapeHtml` in Phase 5). Everything DB-touching is verified manually against the docker-compose Postgres, with exact commands given per task.
- A `reminders` row is exactly one of two modes — relative (`offsetDays`+`hour`+`minute`, all set, `fireAt` null) or absolute (`fireAt` set, the other three null) — enforced by a CHECK constraint in the DB and by each module's own Zod schema only ever populating one shape. Never partially fill a row.
- Once Phase 5 lands, all Telegram messages use `parse_mode: 'HTML'`. Any user-supplied string (a chore title/notes, a shopping item name) interpolated into a title/body **must** go through `escapeHtml` first — never interpolate raw user content once HTML mode is on.
- GitHub tracking: milestone **M9 — Generalized reminders & notifications** (#17). Phase 1 → issue #51, Phase 2 → #52, Phase 3 → #53, Phase 4 → #54, Phase 5 → #55. Reference the issue number in each phase's PR body and close the issue when the PR merges (`gh issue close <n> --repo stevetosak/doma`), or let "Closes #<n>" in the PR body do it automatically.

---

## Phase 1 (issue #51): Generic items/reminders schema + DB-enforced polymorphic FK

**Files:**

- Create: `src/core/items/schema.ts`
- Create: `src/core/items/repo.ts`
- Modify: `src/core/db/client.ts`
- Modify: `src/core/db/schema.ts`
- Modify: `src/modules/chores/schema.ts`
- Modify: `src/modules/chores/module.ts`
- Modify: `src/modules/chores/repo.ts`
- Modify: `src/modules/chores/reminders.ts`
- Modify: `src/modules/chores/chores.functions.ts`
- Modify: `src/modules/shopping/schema.ts`
- Modify: `src/modules/shopping/repo.ts`
- Modify: `src/core/notify/existence.ts`
- Create: `drizzle/0008_<generated-slug>.sql` (exact filename picked by drizzle-kit)

**Interfaces:**

- Produces: `createItemRecord<T>(householdId: string, itemType: string, insertRecord: (tx: Transaction, itemId: string) => Promise<T>): Promise<T>`, `deleteItemRecord(itemId: string, householdId: string): Promise<void>`, `listRemindersForItem(itemId: string, householdId: string): Promise<ReminderRow[]>`, `replaceRemindersForItem(itemId: string, householdId: string, rows: ReminderInput[]): Promise<void>` — all from `#/core/items/repo` — and `type Transaction` from `#/core/db/client`. `ReminderInput = { offsetDays?: number; hour?: number; minute?: number; fireAt?: Date }`, `ReminderRow = { id: string; offsetDays: number | null; hour: number | null; minute: number | null; fireAt: Date | null }`.
- Consumes (later phases): Phase 2 imports `reminders`/`items` schema from `#/core/items/schema`. Phase 3/4 import `listRemindersForItem`/`replaceRemindersForItem` from `#/core/items/repo`.

### Task 1: Shared `items`/`reminders` schema + `Transaction` type

- [ ] **Step 1: Add a `Transaction` type export to the DB client**

`src/core/db/client.ts` — full new content:

```ts
import { drizzle } from 'drizzle-orm/node-postgres'

import { requireEnv } from '#/core/env'
import * as schema from './schema'

export const db = drizzle(requireEnv('DATABASE_URL'), { schema })

/** The `tx` handle inside `db.transaction(async (tx) => ...)` — derived rather than imported from drizzle's internals, so it always matches this project's actual schema type. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
```

- [ ] **Step 2: Create the shared schema**

`src/core/items/schema.ts` (new file):

```ts
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { households } from '#/core/household/schema'

/**
 * Cross-cutting infrastructure (like core/notify), not a feature module —
 * a real, DB-enforced polymorphic reference every module's primary entity
 * (a chore, a shopping item, whatever comes later) can key off, replacing
 * the old string-based existenceCheckTable/Id lookup. See the M9 design
 * spec (docs/superpowers/specs/2026-09-05-generalized-reminders-design.md).
 */

export const items = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  // 'chore' | 'shopping_item' | future kinds — a plain string, not a pgEnum,
  // so a new module doesn't need a migration just to add its own value.
  itemType: text('item_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    // Relative mode (chores): N days before/after a recurring due date, at
    // a literal time. See src/modules/chores/reminder-time.ts.
    offsetDays: integer('offset_days'),
    hour: integer('hour'),
    minute: integer('minute'),
    // Absolute mode (shopping): a single literal fire time, no recurrence.
    fireAt: timestamp('fire_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'reminders_mode_check',
      sql`(${table.offsetDays} is not null and ${table.hour} is not null and ${table.minute} is not null and ${table.fireAt} is null)
       or (${table.offsetDays} is null and ${table.hour} is null and ${table.minute} is null and ${table.fireAt} is not null)`,
    ),
  ],
)
```

- [ ] **Step 3: Wire the schema barrel**

`src/core/db/schema.ts` — add one line (order matches the file's existing core-then-modules grouping):

```ts
export * from '#/core/auth/schema'
export * from '#/core/household/schema'
export * from '#/core/notify/schema'
export * from '#/core/items/schema'
export * from '#/modules/chores/schema'
export * from '#/modules/shopping/schema'
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from these three files (existing errors elsewhere, if any, are unrelated — don't fix them here).

- [ ] **Step 5: Commit**

```bash
git add src/core/db/client.ts src/core/db/schema.ts src/core/items/schema.ts
git commit -m "feat: add shared items/reminders schema"
```

### Task 2: `core/items/repo.ts` — the enforcement layer

**Interfaces:**

- Consumes: `db`, `Transaction` from `#/core/db/client`; `householdScope` from `#/core/db/household-scope`; `items`, `reminders` from `./schema`.
- Produces: `createItemRecord`, `deleteItemRecord`, `listRemindersForItem`, `replaceRemindersForItem`, `ReminderInput`, `ReminderRow` (signatures above).

- [ ] **Step 1: Write the repo**

`src/core/items/repo.ts` (new file):

```ts
import { eq } from 'drizzle-orm'
import { db } from '#/core/db/client'
import type { Transaction } from '#/core/db/client'
import { householdScope } from '#/core/db/household-scope'
import { items, reminders } from './schema'

/**
 * The only way to create a polymorphic item (§ data model in the M9 spec):
 * the module's own row insert only ever happens inside `insertRecord`, so
 * there's no code path that creates a chore/shopping-item row without also
 * creating its `items` row — a structural guarantee, not just the DB's FK.
 */
export async function createItemRecord<T>(
  householdId: string,
  itemType: string,
  insertRecord: (tx: Transaction, itemId: string) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(items)
      .values({ householdId, itemType })
      .returning({ id: items.id })
    if (!row) throw new Error('Insert did not return a row')
    return insertRecord(tx, row.id)
  })
}

/**
 * The only way to remove a polymorphic item — cascades to the module row
 * (chores.id/shopping_items.id both reference items.id ON DELETE CASCADE)
 * and any reminders in one statement.
 */
export async function deleteItemRecord(
  itemId: string,
  householdId: string,
): Promise<void> {
  await db
    .delete(items)
    .where(householdScope(items, householdId, eq(items.id, itemId)))
}

export interface ReminderInput {
  offsetDays?: number
  hour?: number
  minute?: number
  fireAt?: Date
}

export interface ReminderRow {
  id: string
  offsetDays: number | null
  hour: number | null
  minute: number | null
  fireAt: Date | null
}

/**
 * Wipe-and-recreate, matching the chores-only version this replaces
 * (replaceChoreReminders) — the caller always submits the whole desired
 * set in one shot. Transactional so a failed insert never leaves an
 * item's reminders deleted-but-not-replaced. Callers pass only the fields
 * for their own mode (relative or absolute) — the rest default to null,
 * which is what the DB's CHECK constraint requires.
 */
export async function replaceRemindersForItem(
  itemId: string,
  householdId: string,
  rows: ReminderInput[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(reminders)
      .where(
        householdScope(reminders, householdId, eq(reminders.itemId, itemId)),
      )
    if (rows.length === 0) return
    await tx.insert(reminders).values(
      rows.map((r) => ({
        householdId,
        itemId,
        offsetDays: r.offsetDays ?? null,
        hour: r.hour ?? null,
        minute: r.minute ?? null,
        fireAt: r.fireAt ?? null,
      })),
    )
  })
}

export async function listRemindersForItem(
  itemId: string,
  householdId: string,
): Promise<ReminderRow[]> {
  return db
    .select({
      id: reminders.id,
      offsetDays: reminders.offsetDays,
      hour: reminders.hour,
      minute: reminders.minute,
      fireAt: reminders.fireAt,
    })
    .from(reminders)
    .where(householdScope(reminders, householdId, eq(reminders.itemId, itemId)))
    .orderBy(
      reminders.offsetDays,
      reminders.hour,
      reminders.minute,
      reminders.fireAt,
    )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/core/items/repo.ts
git commit -m "feat: add createItemRecord/deleteItemRecord and generic reminders CRUD"
```

### Task 3: Rewire chores onto the generic tables

**Interfaces:**

- Consumes: `createItemRecord`, `listRemindersForItem`, `replaceRemindersForItem` from `#/core/items/repo`.
- Produces: `createChore` unchanged signature; `listChoresWithOccurrences`'s `ChoreView.reminders` unchanged shape (`{id, offsetDays, hour, minute}[]`).

- [ ] **Step 1: `chores/schema.ts` — `chores.id` references `items.id`, drop `choreReminders`**

Full new content for `src/modules/chores/schema.ts`:

```ts
import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { households } from '#/core/household/schema'
import { users } from '#/core/auth/schema'
import { items } from '#/core/items/schema'

/**
 * Chores module (M5, §5.3). Reminders live in the shared `reminders`
 * table (M9, `#/core/items/schema`) — `chores.id` is itself a reference
 * into the shared `items` table rather than a self-generated uuid, which
 * is what lets a reminder point at "this chore" with a real, DB-enforced
 * FK regardless of which module owns the item. See
 * src/modules/chores/reminder-time.ts / reminders.ts for the scheduling
 * that reads reminders back out.
 */

export const choreRecurrenceKind = pgEnum('chore_recurrence_kind', [
  'once',
  'daily',
  'weekly',
  'monthly',
])

export const choreAssignmentMode = pgEnum('chore_assignment_mode', [
  'fixed',
  'rotating',
])

export const choreOccurrenceStatus = pgEnum('chore_occurrence_status', [
  'pending',
  'done',
  'skipped',
])

export const chores = pgTable('chores', {
  id: uuid('id')
    .primaryKey()
    .references(() => items.id, { onDelete: 'cascade' }),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  notes: text('notes'),
  recurrenceKind: choreRecurrenceKind('recurrence_kind').notNull(),
  interval: integer('interval').notNull().default(1),
  weekdays: integer('weekdays').array(),
  dayOfMonth: integer('day_of_month'),
  startsOn: date('starts_on', { mode: 'string' }).notNull(),
  endsOn: date('ends_on', { mode: 'string' }),
  assignmentMode: choreAssignmentMode('assignment_mode').notNull(),
  assigneeUserId: uuid('assignee_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  rotation: uuid('rotation').array(),
  createdBy: uuid('created_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const choreOccurrences = pgTable(
  'chore_occurrences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    choreId: uuid('chore_id')
      .notNull()
      .references(() => chores.id, { onDelete: 'cascade' }),
    dueOn: date('due_on', { mode: 'string' }).notNull(),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: choreOccurrenceStatus('status').notNull().default('pending'),
    completedBy: uuid('completed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('chore_occurrences_chore_due_on_key').on(
      table.choreId,
      table.dueOn,
    ),
  ],
)
```

(The only substantive changes from today's file: the new `import { items } from '#/core/items/schema'`, `chores.id` dropping `.defaultRandom()` in favor of `.references(() => items.id, { onDelete: 'cascade' })`, the whole `choreReminders` table export deleted, and the top doc comment rewritten.)

- [ ] **Step 2: `chores/module.ts` — drop `choreReminders`**

Full new content for `src/modules/chores/module.ts`:

```ts
import type { ModuleManifest } from '#/modules/types'
import { choreOccurrences, chores } from './schema'

export const choresModule: ModuleManifest = {
  id: 'chores',
  name: 'Chores',
  schema: { chores, choreOccurrences },
  nav: { path: '/chores', label: 'Chores' },
  events: [],
}
```

- [ ] **Step 3: `chores/repo.ts` — `createChore` via `createItemRecord`, reminders query rewired, old reminder CRUD removed**

In `src/modules/chores/repo.ts`:

Replace the import line `import { and, eq, gte, lte, or } from 'drizzle-orm'` with:

```ts
import { and, eq, gte, inArray, lte, or } from 'drizzle-orm'
```

Replace `import { choreOccurrences, choreReminders, chores } from './schema'` with:

```ts
import { choreOccurrences, chores } from './schema'
import { reminders } from '#/core/items/schema'
import { createItemRecord } from '#/core/items/repo'
```

Replace the whole `createChore` function body:

```ts
export async function createChore(input: CreateChoreInput): Promise<string> {
  return createItemRecord(input.householdId, 'chore', async (tx, id) => {
    const [row] = await tx
      .insert(chores)
      .values({
        id,
        householdId: input.householdId,
        title: input.title,
        notes: input.notes ?? null,
        recurrenceKind: input.recurrenceKind,
        interval: input.interval,
        weekdays: input.weekdays ?? null,
        dayOfMonth: input.dayOfMonth ?? null,
        startsOn: input.startsOn,
        endsOn: input.endsOn ?? null,
        assignmentMode: input.assignmentMode,
        assigneeUserId: input.assigneeUserId ?? null,
        rotation: input.rotation ?? null,
        createdBy: input.createdBy,
      })
      .returning({ id: chores.id })
    if (!row) throw new Error('Insert did not return a row')
    return row.id
  })
}
```

Delete the `ReminderInput`, `ReminderRow` interfaces and the `replaceChoreReminders`/`listRemindersForChore` functions entirely (lines that currently sit between `UpdateChoreInput`/`updateChore` and `ChoreRow` — the ones documented as "Wipe-and-recreate, matching deletePendingOccurrencesFrom's own..."). Callers now import the generic versions from `#/core/items/repo` directly (Task steps 4-5 below).

In `listChoresWithOccurrences`, replace the third query block (currently `const reminderRows = await db.select().from(choreReminders).where(householdScope(choreReminders, householdId))...`) with:

```ts
const choreIds = choreRows.map((c) => c.id)
const reminderRows =
  choreIds.length > 0
    ? await db
        .select({
          id: reminders.id,
          itemId: reminders.itemId,
          offsetDays: reminders.offsetDays,
          hour: reminders.hour,
          minute: reminders.minute,
        })
        .from(reminders)
        .where(
          householdScope(
            reminders,
            householdId,
            inArray(reminders.itemId, choreIds),
          ),
        )
        .orderBy(reminders.offsetDays, reminders.hour, reminders.minute)
    : []
```

and the grouping loop right after it from:

```ts
const remindersByChore = new Map<string, ChoreReminderView[]>()
for (const r of reminderRows) {
  const list = remindersByChore.get(r.choreId) ?? []
  list.push({
    id: r.id,
    offsetDays: r.offsetDays,
    hour: r.hour,
    minute: r.minute,
  })
  remindersByChore.set(r.choreId, list)
}
```

to:

```ts
const remindersByChore = new Map<string, ChoreReminderView[]>()
for (const r of reminderRows) {
  if (r.offsetDays == null || r.hour == null || r.minute == null) continue
  const list = remindersByChore.get(r.itemId) ?? []
  list.push({
    id: r.id,
    offsetDays: r.offsetDays,
    hour: r.hour,
    minute: r.minute,
  })
  remindersByChore.set(r.itemId, list)
}
```

(`choreIds` must be declared once — if `listChoresWithOccurrences` already computes something equivalent for the occurrences query, reuse it rather than declaring twice; otherwise add the one `const choreIds = choreRows.map((c) => c.id)` line shown above.)

- [ ] **Step 4: `chores/reminders.ts` — read from the generic table**

Full new content for `src/modules/chores/reminders.ts`:

```ts
import { notify } from '#/core/notify/notify'
import { listRemindersForItem } from '#/core/items/repo'
import { getChore, listPendingOccurrencesForChore } from '#/modules/chores/repo'
import { computeReminderAt } from './reminder-time'
import { formatDateWithWeekday } from './time'

/**
 * Schedules a Telegram reminder (via notify()) for every (pending
 * occurrence x configured reminder) pair of a chore, if the occurrence has
 * an assignee. Called both right after materializing (create/edit — so a
 * reminder for a chore due tomorrow is scheduled immediately, not after
 * the next nightly cron) and from the nightly `chores.materialize` job for
 * every household. Safe to call repeatedly — see notify()'s dedupe note.
 */
export async function scheduleRemindersForChore(
  choreId: string,
  householdId: string,
  timezone: string,
): Promise<void> {
  const chore = await getChore(choreId, householdId)
  if (!chore) return

  const reminderRows = await listRemindersForItem(choreId, householdId)
  if (reminderRows.length === 0) return

  const occurrences = await listPendingOccurrencesForChore(choreId, householdId)
  for (const occurrence of occurrences) {
    if (!occurrence.assigneeUserId) continue
    for (const reminder of reminderRows) {
      if (
        reminder.offsetDays == null ||
        reminder.hour == null ||
        reminder.minute == null
      ) {
        continue // not a relative-mode row — shouldn't happen for a chore, but stay defensive
      }
      await notify({
        householdId,
        userId: occurrence.assigneeUserId,
        moduleId: 'chores',
        kind: 'chore_reminder',
        subjectId: occurrence.id,
        title: `${chore.title} is due`,
        body: `Due ${formatDateWithWeekday(occurrence.dueOn, timezone)}${
          chore.notes ? ` — ${chore.notes}` : ''
        }`,
        deepLink: '/chores',
        at: computeReminderAt(
          occurrence.dueOn,
          timezone,
          reminder.offsetDays,
          reminder.hour,
          reminder.minute,
        ),
        dedupeKey: `chore-occ:${occurrence.id}:reminder:${reminder.id}`,
        existenceCheck: { table: 'reminders', id: reminder.id },
      })
    }
  }
}
```

(Only the import lines, `listRemindersForItem` call, the null-guard, and `existenceCheck`'s table name — `'chore_reminders'` → `'reminders'` — actually change; everything else is identical to today. `existenceCheck`'s shape simplifies further in Phase 2.)

- [ ] **Step 5: `chores.functions.ts` — import the generic replace function**

In `src/modules/chores/chores.functions.ts`, replace:

```ts
import {
  archiveChore,
  createChore,
  deletePendingOccurrencesFrom,
  listChoresWithOccurrences,
  replaceChoreReminders,
  setOccurrenceStatus,
  updateChore,
} from '#/modules/chores/repo'
```

with:

```ts
import {
  archiveChore,
  createChore,
  deletePendingOccurrencesFrom,
  listChoresWithOccurrences,
  setOccurrenceStatus,
  updateChore,
} from '#/modules/chores/repo'
import { replaceRemindersForItem } from '#/core/items/repo'
```

and change both call sites — `await replaceChoreReminders(choreId, household.id, reminders)` (in `createChoreAction`) and `await replaceChoreReminders(choreId, household.id, reminders)` (in `updateChoreAction`) — to `await replaceRemindersForItem(choreId, household.id, reminders)`.

- [ ] **Step 6: `existence.ts` — point at the one shared table**

Full new content for `src/core/notify/existence.ts`:

```ts
import { eq } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { reminders } from '#/core/items/schema'

/**
 * Per-table existence checks a notify() caller can attach via
 * existenceCheck (see notify.ts). Now that every reminder definition
 * lives in the one shared `reminders` table (M9), there's only ever one
 * possible table — this stays a lookup keyed by table name (rather than
 * an unconditional single query) only because notify.ts's public shape
 * hasn't changed yet; Phase 2 drops the table discriminator entirely.
 */
const CHECKS: Record<string, (id: string) => Promise<boolean>> = {
  reminders: async (id) => {
    const [row] = await db
      .select({ id: reminders.id })
      .from(reminders)
      .where(eq(reminders.id, id))
    return Boolean(row)
  },
}

/** True if there's nothing to check, or the checked row still exists. */
export async function stillExists(
  check: { table: string; id: string } | null | undefined,
): Promise<boolean> {
  if (!check) return true
  const fn = CHECKS[check.table]
  return fn ? fn(check.id) : true
}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes. If `ChoreReminderView`/`ReminderInput`/`ReminderRow` (the chores-local ones) are still imported anywhere from `chores/repo`, fix the import to the new location or remove it — `ChoreReminderView` (the _view_ type used by `ChoreView.reminders`, distinct from the deleted `ReminderInput`/`ReminderRow` CRUD types) stays in `chores/repo.ts` unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/modules/chores/schema.ts src/modules/chores/module.ts src/modules/chores/repo.ts src/modules/chores/reminders.ts src/modules/chores/chores.functions.ts src/core/notify/existence.ts
git commit -m "feat: rewire chores reminders onto the shared items/reminders tables"
```

### Task 4: Rewire shopping onto `createItemRecord`/`deleteItemRecord`

- [ ] **Step 1: `shopping/schema.ts` — `shoppingItems.id` references `items.id`**

In `src/modules/shopping/schema.ts`, add `import { items } from '#/core/items/schema'` to the imports, and change the `shoppingItems` table's `id` field from:

```ts
  id: uuid('id').primaryKey().defaultRandom(),
```

to:

```ts
  id: uuid('id')
    .primaryKey()
    .references(() => items.id, { onDelete: 'cascade' }),
```

(This is the only field that changes — `shoppingLists`, `shoppingCategories`, and `shoppingItemHistory` are untouched; only `shoppingItems` becomes a polymorphic item.)

- [ ] **Step 2: `shopping/repo.ts` — `addItem` via `createItemRecord`, `removeItem` via `deleteItemRecord`**

Add to the imports: `import { createItemRecord, deleteItemRecord } from '#/core/items/repo'`.

Replace the `addItem` function body:

```ts
export async function addItem(input: AddItemInput): Promise<string> {
  const categoryId = input.categoryName
    ? await getOrCreateCategory(input.householdId, input.categoryName)
    : null

  return createItemRecord(
    input.householdId,
    'shopping_item',
    async (tx, id) => {
      const [row] = await tx
        .insert(shoppingItems)
        .values({
          id,
          householdId: input.householdId,
          listId: input.listId,
          name: input.name.trim(),
          quantity: input.quantity ?? null,
          unit: input.unit ?? null,
          note: input.note ?? null,
          categoryId,
          addedBy: input.addedBy,
        })
        .returning({ id: shoppingItems.id })
      if (!row) throw new Error('Insert did not return a row')
      return row.id
    },
  )
}
```

Replace the `removeItem` function body:

```ts
export async function removeItem(
  itemId: string,
  householdId: string,
): Promise<void> {
  await deleteItemRecord(itemId, householdId)
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/modules/shopping/schema.ts src/modules/shopping/repo.ts
git commit -m "feat: rewire shopping items onto createItemRecord/deleteItemRecord"
```

### Task 5: Migration + verification + PR

- [ ] **Step 1: Generate the migration**

Run: `npm run db:generate`

This produces `drizzle/0008_<random-slug>.sql` and updates `drizzle/meta/_journal.json` + a new `drizzle/meta/0008_snapshot.json`. Note the exact filename it picks.

- [ ] **Step 2: Replace the generated SQL with the hand-edited target**

The auto-generated file will create `items`/`reminders` and alter `chores`/`shopping_items`, but with **no backfill** and possibly an order that adds the `chores.id`/`shopping_items.id` foreign keys before `items` has any matching rows (which Postgres will reject, since both tables already have data). Overwrite the generated file's content with exactly this (adjust only the CHECK constraint's literal syntax if drizzle-kit's own generated form differs — the semantics must stay identical):

```sql
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Hand-edited, not drizzle-kit generated. Backfills items from the
-- chores/shopping_items rows that already exist, reusing their ids
-- exactly so nothing that already stores a chore/item id anywhere else
-- (occurrences, notifications, the outbox) needs to change.
INSERT INTO "items" ("id", "household_id", "item_type", "created_at")
SELECT "id", "household_id", 'chore', "created_at" FROM "chores";
--> statement-breakpoint
INSERT INTO "items" ("id", "household_id", "item_type", "created_at")
SELECT "id", "household_id", 'shopping_item', "created_at" FROM "shopping_items";
--> statement-breakpoint
ALTER TABLE "chores" ALTER COLUMN "id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "shopping_items" ALTER COLUMN "id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "chores" ADD CONSTRAINT "chores_id_items_id_fk" FOREIGN KEY ("id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_id_items_id_fk" FOREIGN KEY ("id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"offset_days" integer,
	"hour" integer,
	"minute" integer,
	"fire_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_mode_check" CHECK (("reminders"."offset_days" IS NOT NULL AND "reminders"."hour" IS NOT NULL AND "reminders"."minute" IS NOT NULL AND "reminders"."fire_at" IS NULL) OR ("reminders"."offset_days" IS NULL AND "reminders"."hour" IS NULL AND "reminders"."minute" IS NULL AND "reminders"."fire_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Hand-edited: backfill reminders from the existing chore_reminders rows
-- before that table is dropped below. Reuses each row's id exactly, since
-- any not-yet-fired pg-boss job already carries that id as its
-- existenceCheck.id (src/core/notify/existence.ts) and must still resolve
-- correctly against the new table.
INSERT INTO "reminders" ("id", "household_id", "item_id", "offset_days", "hour", "minute", "created_at")
SELECT "id", "household_id", "chore_id", "offset_days", "hour", "minute", "created_at" FROM "chore_reminders";
--> statement-breakpoint
DROP TABLE "chore_reminders";
```

- [ ] **Step 3: Dry-run against the local docker-compose Postgres**

Run (adjust the container/service name if different — check `docker compose ps`):

```bash
docker compose exec -T postgres psql -U postgres -d doma -c \
  "SELECT (SELECT count(*) FROM chores) AS chores, (SELECT count(*) FROM shopping_items) AS items, (SELECT count(*) FROM chore_reminders) AS old_reminders;"
```

Note the three counts, then run the migration:

```bash
npm run db:migrate
```

Then verify:

```bash
docker compose exec -T postgres psql -U postgres -d doma -c \
  "SELECT item_type, count(*) FROM items GROUP BY item_type; SELECT count(*) FROM reminders; SELECT count(*) FROM chore_reminders;"
```

Expected: `items` grouped counts match the `chores`/`shopping_items` counts from before; `reminders`'s count matches the old `chore_reminders` count from before; the last query errors with `relation "chore_reminders" does not exist` (table is gone).

- [ ] **Step 4: Full functional check**

Start the dev server (`npm run dev`), and through the UI: create a chore with a reminder a few minutes out, confirm it still schedules (check `notifications` for a `pending` row with the expected `scheduled_for`); create a shopping item, then remove it, and confirm via `SELECT * FROM items WHERE id = '<that id>'` that the cascade deleted its `items` row too (zero rows).

- [ ] **Step 5: Full check suite**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass. For `build`, also run `grep -l "grammy\|pg-boss" .output/public/assets/*.js` and confirm it prints nothing (the PR #48 client-bundle-leak fix must still hold — this phase doesn't touch `start.ts`, but it's a cheap, cheap-to-skip-wrongly check worth re-running whenever `chores.functions.ts`/`shopping` files change).

- [ ] **Step 6: Commit, push, open the PR**

```bash
git add drizzle/0008_*.sql drizzle/meta/_journal.json drizzle/meta/0008_snapshot.json
git commit -m "feat: migrate to the shared items/reminders schema"
git push -u origin feat/generic-items-reminders-schema
gh pr create --repo stevetosak/doma --title "feat: generic items/reminders schema (M9)" --body "Closes #51.

Replaces chore-specific \`chore_reminders\` with a shared, DB-enforced \`items\`/\`reminders\` model — \`chores.id\`/\`shopping_items.id\` now reference \`items.id\` (a real FK, not a string lookup), and reminders reference \`items.id\` generically. \`createItemRecord\`/\`deleteItemRecord\` are the only path to creating/removing a polymorphic item.

No behavior change from a user's perspective — chores' reminders work exactly as before, just on the new tables. Design: docs/superpowers/specs/2026-09-05-generalized-reminders-design.md.

## Test plan
- [x] Migration dry-run: row counts match across old/new tables
- [x] Full functional test: chore reminder still schedules, shopping item removal cascades through items
- [x] npm test / tsc / lint / build all green, client bundle leak check clean"
```

(Run this from a branch created at the start of Phase 1 — `git checkout -b feat/generic-items-reminders-schema` off an up-to-date `main`, before Task 1's Step 1.)

**STOP. Wait for review/merge of this PR before starting Phase 2.**

---

## Phase 2 (issue #52): Notify layer — simplify existence, add liveness

**Files:**

- Modify: `src/core/notify/schema.ts`
- Modify: `src/core/notify/notify.ts`
- Modify: `src/core/notify/existence.ts`
- Create: `src/core/notify/liveness.ts`
- Modify: `src/core/notify/dispatch.ts`
- Modify: `src/core/notify/outbox-repo.ts`
- Modify: `src/core/notify/sweep.ts`
- Modify: `src/modules/chores/reminders.ts`
- Create: `drizzle/0009_<generated-slug>.sql`

**Interfaces:**

- Consumes: `stillExists` (simplified), the shared `reminders` table from Phase 1.
- Produces: `NotifyInput.reminderId?: string` (replaces `existenceCheck`), `isStillLive(kind: string, subjectId: string): Promise<boolean>` from `#/core/notify/liveness`.

### Task 6: Collapse the existence check to one lookup, drop the table discriminator

- [ ] **Step 1: Schema — drop `existenceCheckTable`, rename `existenceCheckId` → `reminderId`**

In `src/core/notify/schema.ts`, replace:

```ts
  existenceCheckTable: text('existence_check_table'),
  existenceCheckId: text('existence_check_id'),
```

with:

```ts
  // If set, dispatch/the retry sweep re-verify this reminder still exists
  // (existence.ts) — a plain lookup pointer, not an enforced FK, so a
  // notification that already sent isn't cascade-deleted just because its
  // reminder was later edited away. Null for a notification with nothing
  // that can go stale.
  reminderId: uuid('reminder_id'),
```

(This needs `uuid` added to the `drizzle-orm/pg-core` import in that file, if not already imported — it is: check the existing import list at the top of the file and add `uuid` if missing. It's already there, since `notifications.id`/`householdId`/etc. use it.)

- [ ] **Step 2: `existence.ts` — one unconditional lookup, no registry**

Full new content for `src/core/notify/existence.ts`:

```ts
import { eq } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { reminders } from '#/core/items/schema'

/** True if there's nothing to check, or the reminder still exists. */
export async function stillExists(
  reminderId: string | null | undefined,
): Promise<boolean> {
  if (!reminderId) return true
  const [row] = await db
    .select({ id: reminders.id })
    .from(reminders)
    .where(eq(reminders.id, reminderId))
  return Boolean(row)
}
```

- [ ] **Step 3: New `liveness.ts` — the `kind`-keyed check**

`src/core/notify/liveness.ts` (new file):

```ts
import { eq } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { choreOccurrences } from '#/modules/chores/schema'

/**
 * Is the thing a reminder is *about* still actionable — not just whether
 * the reminder definition exists (existence.ts), but whether marking it
 * done anywhere (the app, or Telegram's mark-done button) should stop
 * further reminders about it. Keyed by `notifications.kind`, same small
 * lookup-table style as existence.ts's old CHECKS map. Only 'chore_reminder'
 * exists yet — shopping's 'shopping_item_reminder' is added in Phase 4.
 */
const LIVENESS: Record<string, (subjectId: string) => Promise<boolean>> = {
  chore_reminder: async (occurrenceId) => {
    const [occ] = await db
      .select({ status: choreOccurrences.status })
      .from(choreOccurrences)
      .where(eq(choreOccurrences.id, occurrenceId))
    return occ?.status === 'pending'
  },
}

/** True if there's no registered check for this kind, or the check passes. */
export async function isStillLive(
  kind: string,
  subjectId: string,
): Promise<boolean> {
  const fn = LIVENESS[kind]
  return fn ? fn(subjectId) : true
}
```

- [ ] **Step 4: `notify.ts` — `reminderId` replaces `existenceCheck`**

In `src/core/notify/notify.ts`, replace the `existenceCheck?: { table: string; id: string }` field (in both `NotifyInput` and `NotifyJobData`) with:

```ts
  /**
   * If set, dispatch and the retry sweep re-verify this reminder still
   * exists (existence.ts) and is still live (liveness.ts) before sending —
   * a job whose backing reminder was deleted/edited, or whose subject
   * (an occurrence, an item) is already done/checked, is silently dropped
   * instead of sent. Omit for a notification with nothing that can go stale.
   */
  reminderId?: string
```

and in `notify()`'s `data` construction, replace `existenceCheck: input.existenceCheck,` with `reminderId: input.reminderId,`.

- [ ] **Step 5: `dispatch.ts` — check both existence and liveness**

Full new content for `src/core/notify/dispatch.ts`:

```ts
import { stillExists } from './existence'
import { isStillLive } from './liveness'
import { claimOutboxRow, markFailed, markSent } from './outbox-repo'
import { getTelegramLink } from './telegram-links-repo'
import { sendTelegramMessage } from './telegram-bot'
import type { NotifyJobData } from './notify'

/**
 * The `notify.dispatch` job handler (registered in
 * src/core/jobs/bootstrap.ts) and the entry point the 15-minute sweep
 * (sweep.ts) shares its claim step with.
 */
export async function dispatchNotification(data: NotifyJobData): Promise<void> {
  if (!(await stillExists(data.reminderId))) return // the reminder was deleted or replaced since this was scheduled
  if (!(await isStillLive(data.kind, data.subjectId))) return // already done/checked elsewhere

  const link = await getTelegramLink(data.userId)
  if (!link) {
    // No channel to send through yet. Deliberately don't claim the outbox
    // row here — if they link Telegram later, the next time this
    // dedupeKey is scheduled (chores' nightly materialize re-runs this for
    // every still-pending occurrence) it'll go through normally.
    return
  }

  const claimed = await claimOutboxRow({
    householdId: data.householdId,
    userId: data.userId,
    moduleId: data.moduleId,
    kind: data.kind,
    subjectId: data.subjectId,
    title: data.title,
    body: data.body,
    deepLink: data.deepLink,
    scheduledFor: new Date(data.at),
    dedupeKey: data.dedupeKey,
    reminderId: data.reminderId ?? null,
  })
  if (!claimed) return // already sent, already failed-and-tracked, or in flight elsewhere

  try {
    await sendTelegramMessage(link.chatId, `${data.title}\n\n${data.body}`)
    await markSent(claimed.id)
  } catch (err) {
    console.error('Telegram send failed:', err)
    await markFailed(claimed.id, 1)
  }
}
```

- [ ] **Step 6: `outbox-repo.ts` — rename the field**

In `src/core/notify/outbox-repo.ts`: replace `existenceCheckTable?: string | null` / `existenceCheckId?: string | null` (in `NewOutboxRow`) with `reminderId?: string | null`; replace `existenceCheckTable: string | null` / `existenceCheckId: string | null` (in `RetryableOutboxRow`) with `reminderId: string | null`; in `findRetryableFailed`'s `.select({...})`, replace `existenceCheckTable: notifications.existenceCheckTable, existenceCheckId: notifications.existenceCheckId,` with `reminderId: notifications.reminderId,`.

- [ ] **Step 7: `sweep.ts` — check both, using the renamed field**

Full new content for `src/core/notify/sweep.ts`:

```ts
import { stillExists } from './existence'
import { isStillLive } from './liveness'
import { findRetryableFailed, markFailed, markSent } from './outbox-repo'
import { getTelegramLink } from './telegram-links-repo'
import { sendTelegramMessage } from './telegram-bot'

/**
 * The 15-minute safety net (§5.5): retries outbox rows that already failed
 * a send, up to a capped attempt count (findRetryableFailed). This is the
 * only thing the sweep does — a reminder that was never scheduled at all
 * (no outbox row exists yet) is instead caught by the next nightly
 * `chores.materialize` run, which re-schedules every still-pending
 * occurrence's reminder unconditionally (safe: see notify()'s dedupe note).
 */
export async function retryFailedNotifications(): Promise<void> {
  const rows = await findRetryableFailed()
  for (const row of rows) {
    if (!(await stillExists(row.reminderId))) continue // deleted or replaced since scheduling — leave it 'failed', the attempts cap eventually stops revisiting it

    const link = await getTelegramLink(row.userId)
    if (!link) continue // still not linked — leave it failed, try again next sweep

    try {
      await sendTelegramMessage(link.chatId, `${row.title}\n\n${row.body}`)
      await markSent(row.id)
    } catch (err) {
      console.error('Telegram retry failed:', err)
      await markFailed(row.id, row.attempts + 1)
    }
  }
}
```

Note `isStillLive` isn't checked here: `findRetryableFailed()` doesn't currently select `kind`/`subjectId` (only `id`, `userId`, `title`, `body`, `attempts`, `reminderId`). Add `kind: notifications.kind, subjectId: notifications.subjectId,` to `RetryableOutboxRow` and the `findRetryableFailed` select in Step 6 above, then add the check here:

```ts
if (!(await isStillLive(row.kind, row.subjectId))) continue
```

right after the `stillExists` check.

- [ ] **Step 8: `chores/reminders.ts` — use `reminderId`**

In `src/modules/chores/reminders.ts`, replace `existenceCheck: { table: 'reminders', id: reminder.id },` with `reminderId: reminder.id,`.

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 10: Commit**

```bash
git add src/core/notify/schema.ts src/core/notify/existence.ts src/core/notify/liveness.ts src/core/notify/notify.ts src/core/notify/dispatch.ts src/core/notify/outbox-repo.ts src/core/notify/sweep.ts src/modules/chores/reminders.ts
git commit -m "feat: simplify existence check, add kind-keyed liveness check"
```

### Task 7: Migration + verification + PR

- [ ] **Step 1: Generate + hand-edit the migration**

Run: `npm run db:generate`. This should produce something close to (adjust to match what's actually generated, but the effect must be identical):

```sql
ALTER TABLE "notifications" RENAME COLUMN "existence_check_id" TO "reminder_id";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "existence_check_table";
```

If drizzle-kit instead generates a `DROP COLUMN existence_check_id` + `ADD COLUMN reminder_id` pair (i.e. it doesn't detect the rename), replace it with the `RENAME COLUMN` form above — a drop+add would silently lose every existing row's pointer (harmless for `sent` rows, but would make any `pending`/`failed` row's stale reminder wrongly appear "still exists" until the next edit, since `stillExists(null)` returns true).

- [ ] **Step 2: Dry-run + verify**

```bash
npm run db:migrate
docker compose exec -T postgres psql -U postgres -d doma -c "\d notifications"
```

Expected: `reminder_id` present, `existence_check_table`/`existence_check_id` gone.

- [ ] **Step 3: Functional test — liveness actually suppresses a stale reminder**

With the dev server running: create a chore due today with two reminders (one a couple of minutes out, one further out), mark its occurrence "Done" through the UI before the first reminder fires, and confirm via `SELECT status FROM notifications WHERE subject_id = '<occurrence id>'` that neither reminder ever flips to `sent` (both stay `pending` until pg-boss processes them, then dispatch's `isStillLive` check silently returns without sending — no DM arrives, and the row is never claimed so it stays `pending` rather than `sent` or `failed`).

- [ ] **Step 4: Full check suite**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`

- [ ] **Step 5: Commit, push, open the PR**

```bash
git add drizzle/0009_*.sql drizzle/meta/_journal.json drizzle/meta/0009_snapshot.json
git commit -m "feat: migrate notifications to a single reminder_id pointer"
git push -u origin feat/notify-liveness-check
gh pr create --repo stevetosak/doma --title "feat: notify layer liveness check (M9)" --body "Closes #52.

Collapses existenceCheckTable/existenceCheckId into a single reminderId pointer (only one table can ever be referenced now), and adds a kind-keyed liveness check: a reminder for an occurrence/item that's already done/checked no longer fires, even if the reminder definition itself is untouched. Checked at both dispatch and the retry sweep.

## Test plan
- [x] Migration dry-run: reminder_id present, old columns gone
- [x] Functional test: marking an occurrence done before its reminder fires suppresses it
- [x] npm test / tsc / lint / build all green"
```

**STOP. Wait for review/merge before starting Phase 3.**

---

## Phase 3 (issue #53): Chores — decoupled reminder editor

**Files:**

- Modify: `src/core/ui/icons.tsx`
- Create: `src/core/ui/ReminderListEditor.tsx`
- Modify: `src/modules/chores/chores.functions.ts`
- Modify: `src/routes/chores.tsx`

**Interfaces:**

- Consumes: `replaceRemindersForItem` from `#/core/items/repo`; `scheduleRemindersForChore` from `#/modules/chores/reminders`.
- Produces: `setChoreRemindersAction` (server fn) from `#/modules/chores/chores.functions`; `BellIcon` from `#/core/ui/icons`; `ReminderListEditor<T extends { key: number }>` from `#/core/ui/ReminderListEditor` (Phase 4 reuses this).

### Task 8: `BellIcon` + shared `ReminderListEditor`

- [ ] **Step 1: Add `BellIcon`**

In `src/core/ui/icons.tsx`, add (matching the file's existing style — `BASE_PROPS`, `IconProps`):

```ts
export function BellIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  )
}
```

- [ ] **Step 2: Extract the shared list-editing shell**

`src/core/ui/ReminderListEditor.tsx` (new file):

```tsx
import type { ReactNode } from 'react'
import { PlusIcon, TrashIcon } from '#/core/ui/icons'

/**
 * The add/remove/cap-enforcement shell every per-item reminder editor
 * uses (chores: day-offset + time-of-day rows; shopping: a single
 * date+time row) — shared because the fiddly part (list state, presets,
 * the "Maximum N" note) is identical; the row content itself is not.
 */
export function ReminderListEditor<T extends { key: number }>({
  rows,
  max,
  onAdd,
  onRemove,
  renderRow,
  presets,
}: {
  rows: T[]
  max: number
  onAdd: () => void
  onRemove: (key: number) => void
  renderRow: (row: T) => ReactNode
  presets?: { label: string; onClick: () => void }[]
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-xs tracking-wide text-ink-dim">
        Reminders
      </span>

      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              {renderRow(row)}
              <button
                type="button"
                onClick={() => onRemove(row.key)}
                className="flex items-center gap-1 font-mono text-[11px] tracking-wide text-ink-faint underline decoration-dotted underline-offset-4"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {presets?.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={rows.length >= max}
            onClick={preset.onClick}
            className="rounded-tab border border-kraft px-3 py-1.5 font-mono text-[11px] tracking-wide text-ink disabled:opacity-50"
          >
            + {preset.label}
          </button>
        ))}
        <button
          type="button"
          disabled={rows.length >= max}
          onClick={onAdd}
          className="flex items-center gap-1 rounded-tab border border-dotted border-kraft px-3 py-1.5 font-mono text-[11px] tracking-wide text-ink-faint disabled:opacity-50"
        >
          <PlusIcon className="h-3 w-3" />
          Blank
        </button>
      </div>

      {rows.length >= max && (
        <p className="font-mono text-[11px] text-ink-faint">
          Maximum {max} reminders.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/core/ui/icons.tsx src/core/ui/ReminderListEditor.tsx
git commit -m "feat: add BellIcon and the shared ReminderListEditor shell"
```

### Task 9: `setChoreRemindersAction`, drop reminders from the chore form's own actions

**Interfaces:**

- Produces: `setChoreRemindersAction({ data: { choreId: string, reminders: {offsetDays,hour,minute}[] } }): Promise<{ok: true}>`.

- [ ] **Step 1: Add the action, remove reminders from create/update**

In `src/modules/chores/chores.functions.ts`:

Change the import `import { replaceRemindersForItem } from '#/core/items/repo'` — already added in Phase 1, unchanged.

Remove `reminders: z.array(reminderInput).max(MAX_REMINDERS).default([]),` from the `createChoreInput` object (the `reminderInput` schema itself stays — it's reused below).

Replace `createChoreAction`'s handler body:

```ts
  .handler(async ({ data }) => {
    const { userId, household } = await requireMember()
    const choreId = await createChore({
      householdId: household.id,
      createdBy: userId,
      ...data,
    })
    await materializeChoreOccurrences(choreId, household.id, household.timezone)
    publish(household.id, {
      module: 'chores',
      entity: 'chore',
      action: 'created',
    })
    return { id: choreId }
  })
```

Replace `updateChoreAction`'s handler body:

```ts
  .handler(async ({ data }) => {
    const { household } = await requireMember()
    const { choreId, ...fields } = data
    await updateChore(choreId, household.id, fields)
    await deletePendingOccurrencesFrom(
      choreId,
      household.id,
      todayInZone(household.timezone),
    )
    await materializeChoreOccurrences(choreId, household.id, household.timezone)
    await scheduleRemindersForChore(choreId, household.id, household.timezone)
    publish(household.id, {
      module: 'chores',
      entity: 'chore',
      action: 'updated',
    })
    return { ok: true as const }
  })
```

(`updateChoreAction` keeps calling `scheduleRemindersForChore` — editing a chore's schedule regenerates occurrences, and any existing reminders need rescheduling against them, even though this action no longer edits the reminders themselves.)

Add the new action, right after `updateChoreAction`:

```ts
const setChoreRemindersInput = z.object({
  choreId: z.string().uuid(),
  reminders: z.array(reminderInput).max(MAX_REMINDERS),
})

export const setChoreRemindersAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => setChoreRemindersInput.parse(input))
  .handler(async ({ data }) => {
    const { household } = await requireMember()
    await replaceRemindersForItem(data.choreId, household.id, data.reminders)
    await scheduleRemindersForChore(
      data.choreId,
      household.id,
      household.timezone,
    )
    publish(household.id, {
      module: 'chores',
      entity: 'chore',
      action: 'updated',
    })
    return { ok: true as const }
  })
```

Add `scheduleRemindersForChore` to the existing `import { scheduleRemindersForChore } from '#/modules/chores/reminders'` line (already imported — no change needed there, it's already used by `createChoreAction` today... actually `createChoreAction` no longer calls it after this edit, but `updateChoreAction` and the new action both still do, so the import stays).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `src/routes/chores.tsx` referencing the now-removed `reminders` field on `createChoreInput`/`updateChoreInput` — expected, fixed in Task 10.

- [ ] **Step 3: Commit**

```bash
git add src/modules/chores/chores.functions.ts
git commit -m "feat: add setChoreRemindersAction, decouple reminders from chore create/edit"
```

### Task 10: Chores UI — pull reminders out of `ChoreForm`, add the per-chore reminder sheet

- [ ] **Step 1: Remove reminders from `ChoreForm`**

In `src/routes/chores.tsx`:

Remove the `nextReminderKey`/`reminders` state block (currently right after the `rotation` state):

```ts
const nextReminderKey = useRef(0)
const [reminders, setReminders] = useState<ReminderFormRow[]>(() =>
  (initial?.reminders ?? []).map((r: ChoreReminderView) => ({
    key: nextReminderKey.current++,
    offsetDays: r.offsetDays,
    hour: r.hour,
    minute: r.minute,
  })),
)
```

Remove the `addReminderRow`/`updateReminderRow`/`removeReminderRow` functions entirely.

In `handleSubmit`'s `fields` object, remove the `reminders: reminders.map(...)` entry.

Remove the whole reminders JSX block — the `<div className="flex flex-col gap-3">` containing the "Reminders" label, the row list, the preset buttons, and the "Maximum N reminders" note (currently sitting right before the submit-button `<div className="flex items-center gap-3">`).

`REMINDER_PRESETS`, `ReminderFormRow`, `timeInputValue`, `parseTimeInputValue` stay at module scope — they're reused by the new `ChoreReminderForm` in Step 3 below. `MAX_REMINDERS` stays imported from `chores.functions`.

- [ ] **Step 2: Add the reminder affordance to `ChoreCard`**

In `ChoreCard`, add state right after `const [editOpen, setEditOpen] = useState(false)`:

```ts
const [remindersOpen, setRemindersOpen] = useState(false)
```

In the footer `<div className="mt-auto flex gap-3 ...">` (the one with `edit`/`delete`), add a third button between them:

```tsx
<button
  type="button"
  onClick={() => setRemindersOpen(true)}
  className="flex items-center gap-1 underline decoration-dotted underline-offset-4"
>
  <BellIcon className="h-3.5 w-3.5" />
  remind{chore.reminders.length > 0 ? ` (${chore.reminders.length})` : ''}
</button>
```

Add a second `<Sheet>` right after the existing "Edit chore" one:

```tsx
<Sheet
  open={remindersOpen}
  onClose={() => setRemindersOpen(false)}
  title="Chore reminders"
>
  <ChoreReminderForm
    chore={chore}
    onSaved={async () => {
      setRemindersOpen(false)
      await onChange()
    }}
    onCancel={() => setRemindersOpen(false)}
  />
</Sheet>
```

Add `BellIcon` to the icon import list at the top of the file.

- [ ] **Step 3: Write `ChoreReminderForm`**

Add this new component right after `ChoreCard` (before `ChoreForm`):

```tsx
function ChoreReminderForm({
  chore,
  onSaved,
  onCancel,
}: {
  chore: ChoreView
  onSaved: () => Promise<void>
  onCancel: () => void
}) {
  const nextKey = useRef(0)
  const [rows, setRows] = useState<ReminderFormRow[]>(() =>
    chore.reminders.map((r) => ({
      key: nextKey.current++,
      offsetDays: r.offsetDays,
      hour: r.hour,
      minute: r.minute,
    })),
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function addRow(offsetDays: number, hour: number, minute: number) {
    setRows((current) =>
      current.length >= MAX_REMINDERS
        ? current
        : [...current, { key: nextKey.current++, offsetDays, hour, minute }],
    )
  }

  function updateRow(
    key: number,
    patch: Partial<Omit<ReminderFormRow, 'key'>>,
  ) {
    setRows((current) =>
      current.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    )
  }

  function removeRow(key: number) {
    setRows((current) => current.filter((r) => r.key !== key))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await setChoreRemindersAction({
        data: {
          choreId: chore.id,
          reminders: rows.map(({ offsetDays, hour, minute }) => ({
            offsetDays,
            hour,
            minute,
          })),
        },
      })
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <ReminderListEditor
        rows={rows}
        max={MAX_REMINDERS}
        onAdd={() => addRow(0, 8, 0)}
        onRemove={removeRow}
        presets={REMINDER_PRESETS.map((preset) => ({
          label: preset.label,
          onClick: () => addRow(preset.offsetDays, preset.hour, preset.minute),
        }))}
        renderRow={(row) => (
          <>
            <input
              type="number"
              min={-30}
              max={0}
              className="field w-20"
              value={row.offsetDays}
              onChange={(e) =>
                updateRow(row.key, { offsetDays: Number(e.target.value) })
              }
            />
            <span className="font-mono text-xs text-ink-faint">
              days before, at
            </span>
            <input
              type="time"
              className="field w-32"
              value={timeInputValue(row.hour, row.minute)}
              onChange={(e) => {
                const parsed = parseTimeInputValue(e.target.value)
                if (parsed) updateRow(row.key, parsed)
              }}
            />
          </>
        )}
      />
      {error && <p className="text-sm text-rust">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded-tab bg-rust px-4 py-3 text-sm font-medium text-card disabled:opacity-50"
        >
          Save reminders
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 font-mono text-xs tracking-wide text-ink-faint underline decoration-dotted underline-offset-4"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
```

Add imports at the top of the file: `import { ReminderListEditor } from '#/core/ui/ReminderListEditor'` and `import { setChoreRemindersAction } from '#/modules/chores/chores.functions'` (add to the existing `chores.functions` import list rather than a new import line).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 5: Manual functional test**

Start the dev server. Create a chore with no reminders. Open its "remind" sheet, add two reminders via presets, save — confirm the button now reads "remind (2)" and `SELECT * FROM reminders WHERE item_id = '<chore id>'` shows two rows. Edit the chore's recurrence (e.g. change the weekday) and confirm the reminders survive (still 2 rows, `scheduleRemindersForChore` reschedules against the new occurrences).

- [ ] **Step 6: Full check suite**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`

- [ ] **Step 7: Commit, push, open the PR**

```bash
git add src/routes/chores.tsx
git commit -m "feat: decouple chore reminders into their own editor sheet"
git push -u origin feat/chores-reminder-editor
gh pr create --repo stevetosak/doma --title "feat: decoupled chore reminder editor (M9)" --body "Closes #53.

Reminders move out of the chore create/edit form into their own per-chore sheet (a new bell-icon action next to edit/delete), via a new setChoreRemindersAction. Extracted the row-list shell (ReminderListEditor) for shopping's item reminders to reuse in the next phase.

## Test plan
- [x] Create chore with no reminders, add reminders via the new sheet, confirm DB rows
- [x] Edit chore recurrence, confirm reminders survive and reschedule
- [x] npm test / tsc / lint / build all green"
```

**STOP. Wait for review/merge before starting Phase 4.**

---

## Phase 4 (issue #54): Shopping — item reminders (absolute date/time)

**Files:**

- Create: `src/modules/shopping/reminder-time.ts`
- Create: `src/modules/shopping/reminder-time.test.ts`
- Create: `src/modules/shopping/reminders.ts`
- Modify: `src/modules/shopping/repo.ts`
- Modify: `src/modules/shopping/shopping.functions.ts`
- Modify: `src/routes/shopping.tsx`

**Interfaces:**

- Produces: `resolveReminderFireAt(localDateTime: string, timezone: string): Date`, `toLocalInputValue(iso: string, timezone: string): string`, `defaultLocalInputValue(timezone: string): string` from `#/modules/shopping/reminder-time`; `scheduleRemindersForItem(itemId: string, householdId: string, userId: string, itemName: string): Promise<void>` from `#/modules/shopping/reminders`; `setItemRemindersAction` from `#/modules/shopping/shopping.functions`; `ItemView.reminders: {id: string; fireAt: string}[]`.

### Task 11: Pure time helpers (TDD)

- [ ] **Step 1: Write the failing test**

`src/modules/shopping/reminder-time.test.ts` (new file):

```ts
import { describe, expect, it } from 'vitest'
import {
  defaultLocalInputValue,
  resolveReminderFireAt,
  toLocalInputValue,
} from './reminder-time'

describe('resolveReminderFireAt', () => {
  it('interprets a datetime-local string in the given zone', () => {
    const result = resolveReminderFireAt('2026-03-15T18:00', 'Europe/Skopje')
    expect(result.toISOString()).toBe('2026-03-15T17:00:00.000Z')
  })

  it('is timezone-aware — the same local string means a different instant elsewhere', () => {
    const skopje = resolveReminderFireAt('2026-03-15T18:00', 'Europe/Skopje')
    const auckland = resolveReminderFireAt(
      '2026-03-15T18:00',
      'Pacific/Auckland',
    )
    expect(skopje.getTime()).not.toBe(auckland.getTime())
  })

  it('handles a DST spring-forward date correctly', () => {
    // Europe/Skopje goes CET (+1) -> CEST (+2) at 2026-03-29 02:00 local.
    const before = resolveReminderFireAt('2026-03-29T01:00', 'Europe/Skopje')
    const after = resolveReminderFireAt('2026-03-29T03:00', 'Europe/Skopje')
    expect(after.getTime() - before.getTime()).toBe(60 * 60 * 1000) // 1h wall-clock gap = 1h real gap (the 02:00-03:00 hour doesn't exist)
  })
})

describe('toLocalInputValue / resolveReminderFireAt round-trip', () => {
  it('round-trips through the same zone', () => {
    const original = '2026-06-01T09:30'
    const asDate = resolveReminderFireAt(original, 'Europe/Skopje')
    expect(toLocalInputValue(asDate.toISOString(), 'Europe/Skopje')).toBe(
      original,
    )
  })
})

describe('defaultLocalInputValue', () => {
  it('returns a well-formed datetime-local string', () => {
    const value = defaultLocalInputValue('Europe/Skopje')
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/shopping/reminder-time.test.ts`
Expected: FAIL — `reminder-time.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

`src/modules/shopping/reminder-time.ts` (new file):

```ts
import { DateTime } from 'luxon'

/**
 * Pure — no repo/db import, same as chores' reminder-time.ts — so this
 * stays unit-testable without DATABASE_URL. A shopping item has no due
 * date to offset from, so its reminder is a single absolute fire time,
 * entered as a plain <input type="datetime-local"> value (household-local
 * wall-clock, no timezone info of its own).
 */
export function resolveReminderFireAt(
  localDateTime: string,
  timezone: string,
): Date {
  return DateTime.fromISO(localDateTime, { zone: timezone }).toJSDate()
}

/** The inverse — for pre-filling an existing reminder's input value. */
export function toLocalInputValue(iso: string, timezone: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' })
    .setZone(timezone)
    .toFormat("yyyy-MM-dd'T'HH:mm")
}

/** A sane default for a freshly-added blank row: one hour from now. */
export function defaultLocalInputValue(timezone: string): string {
  return DateTime.now()
    .setZone(timezone)
    .plus({ hours: 1 })
    .toFormat("yyyy-MM-dd'T'HH:mm")
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/shopping/reminder-time.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/shopping/reminder-time.ts src/modules/shopping/reminder-time.test.ts
git commit -m "feat: add shopping reminder time helpers"
```

### Task 12: Repo + scheduling

- [ ] **Step 1: `shopping/repo.ts` — reminders on `ItemView`, a `getItem` lookup**

Add to the imports: `import { inArray } from 'drizzle-orm'` (extend the existing `import { and, asc, desc, eq, notInArray, sql } from 'drizzle-orm'` line to include `inArray`), and `import { reminders } from '#/core/items/schema'`.

Add a new interface right above `ItemView`:

```ts
export interface ItemReminderView {
  id: string
  fireAt: string
}
```

Add `reminders: ItemReminderView[]` as a field on `ItemView`.

Replace the `listItems` function:

```ts
export async function listItems(
  householdId: string,
  listId: string,
): Promise<ItemView[]> {
  const itemRows = await db
    .select({
      id: shoppingItems.id,
      name: shoppingItems.name,
      quantity: shoppingItems.quantity,
      unit: shoppingItems.unit,
      note: shoppingItems.note,
      categoryId: shoppingItems.categoryId,
      isChecked: shoppingItems.isChecked,
      addedBy: shoppingItems.addedBy,
    })
    .from(shoppingItems)
    .where(
      householdScope(
        shoppingItems,
        householdId,
        eq(shoppingItems.listId, listId),
      ),
    )
    .orderBy(asc(shoppingItems.createdAt))

  const itemIds = itemRows.map((i) => i.id)
  const reminderRows =
    itemIds.length > 0
      ? await db
          .select({
            id: reminders.id,
            itemId: reminders.itemId,
            fireAt: reminders.fireAt,
          })
          .from(reminders)
          .where(
            householdScope(
              reminders,
              householdId,
              inArray(reminders.itemId, itemIds),
            ),
          )
          .orderBy(reminders.fireAt)
      : []

  const remindersByItem = new Map<string, ItemReminderView[]>()
  for (const r of reminderRows) {
    if (r.fireAt == null) continue
    const list = remindersByItem.get(r.itemId) ?? []
    list.push({ id: r.id, fireAt: r.fireAt.toISOString() })
    remindersByItem.set(r.itemId, list)
  }

  return itemRows.map((item) => ({
    ...item,
    reminders: remindersByItem.get(item.id) ?? [],
  }))
}
```

Add a small lookup used by the scheduling step, right after `updateItem`:

```ts
export async function getItem(
  itemId: string,
  householdId: string,
): Promise<{ name: string } | undefined> {
  const [row] = await db
    .select({ name: shoppingItems.name })
    .from(shoppingItems)
    .where(
      householdScope(shoppingItems, householdId, eq(shoppingItems.id, itemId)),
    )
  return row
}
```

- [ ] **Step 2: `shopping/reminders.ts` — one-shot scheduling**

`src/modules/shopping/reminders.ts` (new file):

```ts
import { notify } from '#/core/notify/notify'
import { listRemindersForItem } from '#/core/items/repo'

/**
 * Unlike chores' fan-out over pending occurrences, a shopping item has no
 * recurrence — each reminders row schedules exactly one notify() call, at
 * its own stored fireAt. The recipient is whoever set the reminder, not
 * necessarily whoever added the item.
 */
export async function scheduleRemindersForItem(
  itemId: string,
  householdId: string,
  userId: string,
  itemName: string,
): Promise<void> {
  const reminderRows = await listRemindersForItem(itemId, householdId)
  for (const reminder of reminderRows) {
    if (reminder.fireAt == null) continue // not an absolute-mode row — shouldn't happen for a shopping item, but stay defensive
    await notify({
      householdId,
      userId,
      moduleId: 'shopping',
      kind: 'shopping_item_reminder',
      subjectId: itemId,
      title: `Reminder: ${itemName}`,
      body: 'Still on your shopping list.',
      deepLink: '/shopping',
      at: reminder.fireAt,
      dedupeKey: `shopping-item:${itemId}:reminder:${reminder.id}`,
      reminderId: reminder.id,
    })
  }
}
```

Add the matching liveness entry to `src/core/notify/liveness.ts` (from Phase 2) — add the import `import { shoppingItems } from '#/modules/shopping/schema'` and a second `LIVENESS` entry:

```ts
  shopping_item_reminder: async (itemId) => {
    const [item] = await db
      .select({ isChecked: shoppingItems.isChecked })
      .from(shoppingItems)
      .where(eq(shoppingItems.id, itemId))
    return item ? !item.isChecked : false
  },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/modules/shopping/repo.ts src/modules/shopping/reminders.ts src/core/notify/liveness.ts
git commit -m "feat: shopping item reminders — repo + scheduling"
```

### Task 13: `setItemRemindersAction` + timezone in `requireMember`

- [ ] **Step 1: Extend `requireMember`, add the action**

In `src/modules/shopping/shopping.functions.ts`, replace the `MemberContext` interface and `requireMember` function:

```ts
interface MemberContext {
  userId: string
  householdId: string
  timezone: string
}

async function requireMember(): Promise<MemberContext> {
  const auth = await resolveAuthContext()
  if (!auth.user || !auth.household) {
    throw new ShoppingAccessError('Not signed in to a household.')
  }
  return {
    userId: auth.user.id,
    householdId: auth.household.id,
    timezone: auth.household.timezone,
  }
}
```

Add `timezone: string` to `ShoppingData` and thread it through `getShoppingData`:

```ts
export interface ShoppingData {
  listId: string
  items: ItemView[]
  categories: CategoryView[]
  recentlyBought: RecentlyBoughtView[]
  members: HouseholdMember[]
  timezone: string
}

export const getShoppingData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ShoppingData> => {
    const { householdId, timezone } = await requireMember()
    const listId = await getOrCreateDefaultList(householdId)
    const [items, categories, recentlyBought, members] = await Promise.all([
      listItems(householdId, listId),
      listCategories(householdId),
      listRecentlyBought(householdId, listId),
      listMembers(householdId),
    ])
    return { listId, items, categories, recentlyBought, members, timezone }
  },
)
```

Add to the imports: `import { replaceRemindersForItem } from '#/core/items/repo'`, `import { resolveReminderFireAt } from '#/modules/shopping/reminder-time'`, `import { scheduleRemindersForItem } from '#/modules/shopping/reminders'`, and add `getItem` to the existing `#/modules/shopping/repo` import list.

Add the action, after `updateItemAction`:

```ts
export const MAX_ITEM_REMINDERS = 6

const itemReminderInput = z.object({
  fireAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
})

const setItemRemindersInput = z.object({
  itemId: z.string().uuid(),
  reminders: z.array(itemReminderInput).max(MAX_ITEM_REMINDERS),
})

export const setItemRemindersAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => setItemRemindersInput.parse(input))
  .handler(async ({ data }) => {
    const { userId, householdId, timezone } = await requireMember()
    await replaceRemindersForItem(
      data.itemId,
      householdId,
      data.reminders.map((r) => ({
        fireAt: resolveReminderFireAt(r.fireAt, timezone),
      })),
    )
    const item = await getItem(data.itemId, householdId)
    if (item)
      await scheduleRemindersForItem(
        data.itemId,
        householdId,
        userId,
        item.name,
      )
    publish(householdId, {
      module: 'shopping',
      entity: 'item',
      action: 'updated',
    })
    return { ok: true as const }
  })
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/modules/shopping/shopping.functions.ts
git commit -m "feat: add setItemRemindersAction"
```

### Task 14: Shopping UI — the per-item reminder sheet

- [ ] **Step 1: Thread `timezone` down to `ItemCard`**

In `src/routes/shopping.tsx`, find where `ItemCard` is rendered from the page-level items list (via `data.items.map(...)`) and add a `timezone={data.timezone}` prop; add `timezone: string` to `ItemCard`'s props type.

- [ ] **Step 2: Add the reminder affordance to `ItemCard`**

Add state right after `const [editOpen, setEditOpen] = useState(false)`:

```ts
const [remindersOpen, setRemindersOpen] = useState(false)
```

In the footer `<div className="mt-auto flex gap-3 ...">` (with `edit`/`remove`), add a third button between them:

```tsx
<button
  type="button"
  onClick={() => setRemindersOpen(true)}
  className="flex items-center gap-1 underline decoration-dotted underline-offset-4"
>
  <BellIcon className="h-3.5 w-3.5" />
  remind{item.reminders.length > 0 ? ` (${item.reminders.length})` : ''}
</button>
```

Add a second `<Sheet>` after the existing "Edit item" one:

```tsx
<Sheet
  open={remindersOpen}
  onClose={() => setRemindersOpen(false)}
  title="Item reminders"
>
  <ItemReminderForm
    item={item}
    timezone={timezone}
    onSaved={async () => {
      setRemindersOpen(false)
      await onChange()
    }}
    onCancel={() => setRemindersOpen(false)}
  />
</Sheet>
```

Add `BellIcon` to the icon import list at the top of the file, and `import { ReminderListEditor } from '#/core/ui/ReminderListEditor'`, `import { defaultLocalInputValue, toLocalInputValue } from '#/modules/shopping/reminder-time'`, and add `setItemRemindersAction`, `MAX_ITEM_REMINDERS` to the existing `shopping.functions` import list.

- [ ] **Step 3: Write `ItemReminderForm`**

Add this new component right after `ItemCard` (before `ItemEditForm`):

```tsx
interface ItemReminderRow {
  key: number
  fireAt: string
}

function ItemReminderForm({
  item,
  timezone,
  onSaved,
  onCancel,
}: {
  item: ItemView
  timezone: string
  onSaved: () => Promise<void>
  onCancel: () => void
}) {
  const nextKey = useRef(0)
  const [rows, setRows] = useState<ItemReminderRow[]>(() =>
    item.reminders.map((r) => ({
      key: nextKey.current++,
      fireAt: toLocalInputValue(r.fireAt, timezone),
    })),
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function addRow() {
    setRows((current) =>
      current.length >= MAX_ITEM_REMINDERS
        ? current
        : [
            ...current,
            {
              key: nextKey.current++,
              fireAt: defaultLocalInputValue(timezone),
            },
          ],
    )
  }

  function updateRow(key: number, fireAt: string) {
    setRows((current) =>
      current.map((r) => (r.key === key ? { ...r, fireAt } : r)),
    )
  }

  function removeRow(key: number) {
    setRows((current) => current.filter((r) => r.key !== key))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await setItemRemindersAction({
        data: {
          itemId: item.id,
          reminders: rows.map(({ fireAt }) => ({ fireAt })),
        },
      })
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <ReminderListEditor
        rows={rows}
        max={MAX_ITEM_REMINDERS}
        onAdd={addRow}
        onRemove={removeRow}
        renderRow={(row) => (
          <input
            type="datetime-local"
            className="field"
            value={row.fireAt}
            onChange={(e) => updateRow(row.key, e.target.value)}
          />
        )}
      />
      {error && <p className="text-sm text-rust">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded-tab bg-rust px-4 py-3 text-sm font-medium text-card disabled:opacity-50"
        >
          Save reminders
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 font-mono text-xs tracking-wide text-ink-faint underline decoration-dotted underline-offset-4"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
```

(No preset buttons here — per the design discussion, an exact date/time picker with no relative presets, unlike chores.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 5: Manual functional test**

Start the dev server. Add a shopping item, open its "remind" sheet, add a reminder a few minutes out, save — confirm `SELECT * FROM reminders WHERE item_id = '<item id>'` shows one row with the expected `fire_at` (converted from local time), and `notifications` gets a matching `pending` row. Check the item off before it fires and confirm (per Phase 2's liveness check) the reminder never sends.

- [ ] **Step 6: Full check suite**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`

- [ ] **Step 7: Commit, push, open the PR**

```bash
git add src/routes/shopping.tsx
git commit -m "feat: shopping item reminders UI"
git push -u origin feat/shopping-item-reminders
gh pr create --repo stevetosak/doma --title "feat: shopping item reminders (M9)" --body "Closes #54.

Shopping items get the same reminder capability as chores — an absolute date/time picker (no due date to offset from), multiple per item, same per-item bell-icon sheet pattern as chores' decoupled editor.

## Test plan
- [x] Add item, set a reminder, confirm DB row + scheduled notification
- [x] Check item off before it fires, confirm liveness check suppresses it
- [x] npm test / tsc / lint / build all green"
```

**STOP. Wait for review/merge before starting Phase 5.**

---

## Phase 5 (issue #55): Telegram — HTML formatting, icons, inline mark-done

**Files:**

- Create: `src/core/notify/html.ts`
- Create: `src/core/notify/html.test.ts`
- Modify: `src/core/notify/telegram-bot.ts`
- Modify: `src/core/notify/telegram-links-repo.ts`
- Modify: `src/core/notify/dispatch.ts`
- Modify: `src/core/notify/sweep.ts`
- Modify: `src/modules/chores/reminders.ts`
- Modify: `src/modules/shopping/reminders.ts`
- Create: `src/core/notify/mark-done.ts`

**Interfaces:**

- Produces: `escapeHtml(text: string): string` from `#/core/notify/html`; `getLinkByChatId(chatId: string): Promise<{ userId: string } | undefined>` from `#/core/notify/telegram-links-repo`; `sendTelegramMessage(chatId: string, text: string, options?: { replyMarkup?: InlineKeyboard }): Promise<void>` (signature change); `handleMarkDoneCallback(notificationId: string, chatId: string): Promise<void>` from `#/core/notify/mark-done`.

### Task 15: `escapeHtml` (TDD)

- [ ] **Step 1: Write the failing test**

`src/core/notify/html.test.ts` (new file):

```ts
import { describe, expect, it } from 'vitest'
import { escapeHtml } from './html'

describe('escapeHtml', () => {
  it('passes plain text through unchanged', () => {
    expect(escapeHtml('Buy milk')).toBe('Buy milk')
  })

  it('escapes ampersands, angle brackets', () => {
    expect(escapeHtml('Tom & Jerry <script>')).toBe(
      'Tom &amp; Jerry &lt;script&gt;',
    )
  })

  it('escapes ampersands before angle brackets, not double-escaping the result', () => {
    // If '&' were escaped after '<'/'>' , the '&lt;' produced by escaping '<'
    // would itself get re-escaped into '&amp;lt;' — wrong.
    expect(escapeHtml('<')).toBe('&lt;')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/notify/html.test.ts`
Expected: FAIL — `html.ts` doesn't exist.

- [ ] **Step 3: Implement**

`src/core/notify/html.ts` (new file):

```ts
/**
 * Telegram messages send with parse_mode HTML (telegram-bot.ts) — any
 * user-supplied text interpolated into a title/body (a chore title, an
 * item name, notes) must go through this first. Order matters: '&' must
 * be replaced before '<'/'>' , or the '&lt;'/'&gt;' this produces would
 * get re-escaped on a second pass.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/notify/html.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/notify/html.ts src/core/notify/html.test.ts
git commit -m "feat: add escapeHtml for Telegram HTML-mode messages"
```

### Task 16: `sendTelegramMessage` — HTML mode + inline keyboard support

- [ ] **Step 1: Update the signature**

In `src/core/notify/telegram-bot.ts`, add `InlineKeyboard` to the `grammy` import: `import { Bot, InlineKeyboard, webhookCallback } from 'grammy'`. Replace `sendTelegramMessage`:

```ts
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: { replyMarkup?: InlineKeyboard },
): Promise<void> {
  const instance = await ensureInited()
  await instance.api.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: options?.replyMarkup,
  })
}
```

- [ ] **Step 2: Add the callback-query handler**

In `buildBot()`, right after the `instance.command('start', ...)` block, add:

```ts
instance.callbackQuery(/^done:/, async (ctx) => {
  const notificationId = ctx.callbackQuery.data.slice('done:'.length)
  const chatId = String(ctx.chat?.id ?? '')
  await handleMarkDoneCallback(notificationId, chatId)
  await ctx.answerCallbackQuery({ text: 'Marked done ✅' })
  await ctx.editMessageReplyMarkup()
})
```

Add the import: `import { handleMarkDoneCallback } from './mark-done'` (created in Task 18 — this creates a forward reference; Task 18 must land before this file typechecks cleanly, so do Task 18 first if executing tasks out of the written order, or accept a transient typecheck failure between these two tasks within the same phase/PR).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: fails until Task 18's `mark-done.ts` exists — that's fine within this phase, both land in the same PR. Re-run after Task 18.

- [ ] **Step 4: Commit**

```bash
git add src/core/notify/telegram-bot.ts
git commit -m "feat: Telegram HTML parse mode, inline keyboard, mark-done callback wiring"
```

### Task 17: Formatting — icons + `escapeHtml` in both modules' reminder bodies

- [ ] **Step 1: Chores**

In `src/modules/chores/reminders.ts`, add the import `import { escapeHtml } from '#/core/notify/html'`, and change the `title`/`body` fields in the `notify()` call:

```ts
        title: `🧹 <b>${escapeHtml(chore.title)}</b> is due`,
        body: `Due ${formatDateWithWeekday(occurrence.dueOn, timezone)}${
          chore.notes ? ` — ${escapeHtml(chore.notes)}` : ''
        }`,
```

- [ ] **Step 2: Shopping**

In `src/modules/shopping/reminders.ts`, add the import `import { escapeHtml } from '#/core/notify/html'`, and change the `title` field (body has no user content, stays as-is):

```ts
      title: `🛒 Reminder: <b>${escapeHtml(itemName)}</b>`,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/modules/chores/reminders.ts src/modules/shopping/reminders.ts
git commit -m "feat: add icons and HTML-escaped titles to reminder messages"
```

### Task 18: The mark-done completion registry + inline button on every send

- [ ] **Step 1: `getLinkByChatId`**

In `src/core/notify/telegram-links-repo.ts`, add:

```ts
export async function getLinkByChatId(
  chatId: string,
): Promise<{ userId: string } | undefined> {
  const [row] = await db
    .select({ userId: telegramLinks.userId })
    .from(telegramLinks)
    .where(eq(telegramLinks.chatId, chatId))
  return row
}
```

- [ ] **Step 2: The completion registry**

`src/core/notify/mark-done.ts` (new file):

```ts
import { eq } from 'drizzle-orm'
import { db } from '#/core/db/client'
import { setOccurrenceStatus } from '#/modules/chores/repo'
import { setItemChecked } from '#/modules/shopping/repo'
import { getLinkByChatId } from './telegram-links-repo'
import { notifications } from './schema'

/**
 * Same small lookup-table style as existence.ts/liveness.ts, keyed by
 * notifications.kind — what "mark done" means differs per module (a
 * chore occurrence's status vs a shopping item's checked flag).
 */
const COMPLETIONS: Record<
  string,
  (subjectId: string, householdId: string, userId: string) => Promise<void>
> = {
  chore_reminder: (occurrenceId, householdId, userId) =>
    setOccurrenceStatus(occurrenceId, householdId, 'done', userId),
  shopping_item_reminder: (itemId, householdId, userId) =>
    setItemChecked(itemId, householdId, true, userId),
}

/**
 * Handles a "✅ Mark done" button press. Authorizes by confirming the
 * pressing chat is the exact one linked to this notification's own
 * recipient — a forged callback_data can't act on someone else's
 * reminder. Silently no-ops on any mismatch (unknown notification, wrong
 * chat, unrecognized kind) rather than surfacing an error to the button
 * presser — there's nothing actionable they could do about it.
 */
export async function handleMarkDoneCallback(
  notificationId: string,
  chatId: string,
): Promise<void> {
  const [notification] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, notificationId))
  if (!notification) return

  const link = await getLinkByChatId(chatId)
  if (!link || link.userId !== notification.userId) return

  const complete = COMPLETIONS[notification.kind]
  if (!complete) return
  await complete(
    notification.subjectId,
    notification.householdId,
    notification.userId,
  )
}
```

- [ ] **Step 3: Attach the button on every send — `dispatch.ts`**

In `src/core/notify/dispatch.ts`, add the import `import { InlineKeyboard } from 'grammy'`, and change the send line:

```ts
try {
  const keyboard = new InlineKeyboard().text(
    '✅ Mark done',
    `done:${claimed.id}`,
  )
  await sendTelegramMessage(link.chatId, `${data.title}\n\n${data.body}`, {
    replyMarkup: keyboard,
  })
  await markSent(claimed.id)
} catch (err) {
  console.error('Telegram send failed:', err)
  await markFailed(claimed.id, 1)
}
```

- [ ] **Step 4: Attach the button on retries — `sweep.ts`**

In `src/core/notify/sweep.ts`, add the same import, and change the send line:

```ts
try {
  const keyboard = new InlineKeyboard().text('✅ Mark done', `done:${row.id}`)
  await sendTelegramMessage(link.chatId, `${row.title}\n\n${row.body}`, {
    replyMarkup: keyboard,
  })
  await markSent(row.id)
} catch (err) {
  console.error('Telegram retry failed:', err)
  await markFailed(row.id, row.attempts + 1)
}
```

- [ ] **Step 5: Typecheck (this resolves Task 16's forward reference too)**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/core/notify/telegram-links-repo.ts src/core/notify/mark-done.ts src/core/notify/dispatch.ts src/core/notify/sweep.ts
git commit -m "feat: inline mark-done button on Telegram reminders"
```

### Task 19: Real end-to-end verification + PR

This phase's change is only meaningfully verified against a real Telegram bot and a real linked chat — the same manual process already used for M8 and the M9 CSRF fix (`.env.local` with `TELEGRAM_BOT_TOKEN` + `TELEGRAM_POLLING=true`, per this project's established local-testing pattern; remember grammy's `bot.start()` auto-deletes the production webhook, so stop the local dev server promptly once done).

- [ ] **Step 1: Full check suite**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`

- [ ] **Step 2: Real delivery test — formatting**

With local polling enabled and a real linked chat: schedule a chore reminder a couple of minutes out. Confirm the Telegram DM shows the 🧹 icon, a **bold** chore title, and one inline "✅ Mark done" button (not plain text with no button, and not a raw unescaped `<b>` in the message).

- [ ] **Step 3: Real delivery test — mark-done**

Tap "✅ Mark done" on the DM. Confirm: the button disappears from the message (via `editMessageReplyMarkup`), a toast reading "Marked done ✅" appears, and `SELECT status FROM chore_occurrences WHERE id = '<the occurrence id>'` shows `done`. Then confirm the liveness check (Phase 2) actually prevents a pile-up: if that chore had a second, later reminder scheduled for the same occurrence, verify it never sends.

- [ ] **Step 4: Real delivery test — shopping**

Set a shopping item reminder a couple of minutes out. Confirm the DM shows the 🛒 icon and the mark-done button checks the item off (`shopping_items.is_checked = true`) when tapped.

- [ ] **Step 5: Stop local polling**

Kill the local dev server so the bot reverts to production's webhook (per the established caution from the earlier CSRF-fix session).

- [ ] **Step 6: Commit any leftover changes, push, open the PR**

```bash
git push -u origin feat/telegram-mark-done
gh pr create --repo stevetosak/doma --title "feat: Telegram HTML formatting + inline mark-done (M9)" --body "Closes #55.

Reminder DMs now use HTML parse mode with icons and bold text (escaped via escapeHtml for any user-supplied content), plus one inline ✅ Mark done button per reminder — wired through a small kind-keyed completion registry (mirrors the liveness registry from Phase 2) and authorized against the pressing chat's own linked user.

This is the last M9 phase — items/reminders generalization, decoupled editors, and Telegram UX are all complete after this merges.

## Test plan
- [x] Real Telegram delivery: chore reminder shows icon/bold/button
- [x] Mark-done button flips the occurrence to done, button disappears, later reminder for the same occurrence is suppressed
- [x] Real Telegram delivery: shopping reminder shows icon/button, mark-done checks the item
- [x] npm test / tsc / lint / build all green"
```

**STOP. Wait for review/merge.** Once this merges, M9 (#17) can be closed (`gh api repos/stevetosak/doma/milestones/17 -f state=closed`, once all 5 issues auto-closed by their PRs' "Closes #N").

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1-4/Phase 1), application-level enforcement (`createItemRecord`/`deleteItemRecord`, Task 2/Phase 1), notify-layer generalization (Phase 2), Telegram formatting + interactivity (Phase 5), decoupled reminder editor (Phase 3 chores, Phase 4 shopping), migration (Task 5/Phase 1, Task 7/Phase 2) — every spec section has a task.
- **Type consistency checked:** `ReminderInput`/`ReminderRow` (core/items/repo, Phase 1) are the one shape both `chores/reminders.ts` and `shopping/reminders.ts` read via `listRemindersForItem`, each null-guarding the fields it doesn't use — same names throughout. `reminderId` (renamed from `existenceCheck.id` in Phase 2) is used identically in `notify.ts`, `dispatch.ts`, `sweep.ts`, `outbox-repo.ts`, and both modules' `reminders.ts`. `ReminderListEditor<T extends {key: number}>` (Phase 3) is consumed with matching `{key, ...}` row shapes in both `ChoreReminderForm` (Phase 3) and `ItemReminderForm` (Phase 4).
- **Known ordering nuance flagged inline:** Task 16 (telegram-bot.ts) references `handleMarkDoneCallback` before Task 18 creates it — both land in the same Phase 5 PR, so this is a transient intra-phase state, not a real gap; noted explicitly in Task 16 Step 2/3.
