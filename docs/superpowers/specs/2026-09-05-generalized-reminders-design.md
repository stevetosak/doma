# Generalized items & reminders, Telegram bot UX

## Context

M8 shipped chore-specific reminders: a `chore_reminders` child table, a chores-only
`existence.ts` staleness check keyed by table name, and a reminder editor embedded inside the
chore create/edit form. The user now wants:

1. Reminders to work on shopping items too, and on whatever module comes after that — not
   hardcoded to chores.
2. The item a reminder points at to be a real, database-enforced reference, not the current
   `existenceCheckTable`/`existenceCheckId` string pair (an app-level lookup with no FK, no
   integrity guarantee).
3. Setting a reminder to be its own action on an existing chore/item, decoupled from the main
   create/edit form (for both modules — chores' reminders move out of the chore form too).
4. Telegram bot messages to use real formatting (icons, bold text) and light interactivity: an
   inline "mark done" button on a reminder DM.

## Data model

A shared `items` supertype table, in a new `src/core/items/` (cross-cutting infrastructure
alongside `core/notify`/`core/household`, not a registered feature module):

```ts
export const items = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  itemType: text('item_type').notNull(), // 'chore' | 'shopping_item' | future kinds
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
```

`chores.id` and `shopping_items.id` stop self-generating and instead reference `items.id`:

```ts
// chores/schema.ts
id: uuid('id').primaryKey().references(() => items.id, { onDelete: 'cascade' }), // no .defaultRandom()

// shopping/schema.ts
id: uuid('id').primaryKey().references(() => items.id, { onDelete: 'cascade' }),
```

A generic `reminders` table, also in `src/core/items/`, referencing `items` — this is the real,
enforced polymorphic FK the current string-pair check doesn't provide:

```ts
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
    // Relative mode (chores): N days before/after a recurring due date, at a literal time.
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

Multiple `reminders` rows may share an `itemId` — since the table isn't unique on `itemId`,
"multiple reminders per item" is free for both chores and shopping under this shape; both get
the same `MAX_REMINDERS` cap (6, unchanged from the chores-only version) enforced in the zod
schema, not the DB.

## Application-level enforcement

A bare FK is easy to bypass by inserting into `chores`/`shopping_items` directly and forgetting
the `items` row. Two shared functions in `src/core/items/repo.ts` are the _only_ way to create or
remove a polymorphic item, so the module row insert/delete can only happen through them:

```ts
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
    return insertRecord(tx, row.id)
  })
}

export async function deleteItemRecord(
  itemId: string,
  householdId: string,
): Promise<void> {
  await db
    .delete(items)
    .where(householdScope(items, householdId, eq(items.id, itemId)))
  // cascades to the module row + any reminders in one statement
}
```

`createChore` and shopping's `addItem` become thin wrappers: insert into `chores`/`shopping_items`
from inside the `createItemRecord` callback, using the id it returns. Shopping's `removeItem`
becomes a thin wrapper around `deleteItemRecord` instead of deleting from `shopping_items`
directly. Chores aren't hard-deleted today (only archived via `isArchived`), so nothing changes
there — but a future hard-delete would go through `deleteItemRecord` too.

## Notify-layer generalization

Two small shared helpers in `src/core/items/` replace `chore_reminders`' bespoke wipe-and-recreate
CRUD:

- `listRemindersForItem(itemId, householdId)`
- `replaceRemindersForItem(itemId, householdId, reminders)` — same transactional
  delete-then-bulk-insert pattern `replaceChoreReminders` already used, just against the shared
  table.

Two simplifications on `notifications` and `src/core/notify/existence.ts` fall out of having one
reminders table instead of two:

- **Existence check collapses to one lookup.** `notifications.existenceCheckTable` is dropped;
  `existenceCheckId` is renamed to `reminderId` (still a plain nullable pointer, not an enforced
  FK — a notification that already sent shouldn't get cascade-deleted just because its reminder
  was later edited away; history is append-only). `stillExists` becomes a single unconditional
  `reminders` lookup, no per-table registry needed for this part.
- **A new liveness check, keyed by `kind`** (already a free-form field on `notifications`, e.g.
  `'chore_reminder'`, new `'shopping_item_reminder'`): does the thing this reminder is _about_
  still need a nudge — is the occurrence still pending, is the item still unchecked? Checked
  alongside the existence check at both dispatch and the retry sweep. This closes a real gap:
  today, marking a chore occurrence done doesn't stop its other pending reminders from firing;
  once Telegram can mark things done directly (below), that gap needs to be closed for the
  button's own consequence to be believable.

```ts
// src/core/notify/liveness.ts
const LIVENESS: Record<string, (subjectId: string) => Promise<boolean>> = {
  chore_reminder: async (occurrenceId) => {
    /* occurrence.status === 'pending' */
  },
  shopping_item_reminder: async (itemId) => {
    /* !item.isChecked */
  },
}
export async function isStillLive(
  kind: string,
  subjectId: string,
): Promise<boolean> {
  const fn = LIVENESS[kind]
  return fn ? fn(subjectId) : true
}
```

Scheduling stays per-module, not shared — chores keep their existing occurrence-fan-out
(`reminders × pending occurrences`, now reading from the shared table), shopping gets its own
much simpler one-shot version (one `reminders` row with `fireAt` → one `notify()` call, no
fan-out). `NotifyInput`/`NotifyJobData`'s `existenceCheck?: { table, id }` field simplifies to
`reminderId?: string`.

## Telegram formatting and interactivity

- `sendTelegramMessage` gains `parse_mode: 'HTML'` and an optional inline keyboard
  (`reply_markup`). A small HTML-escape helper wraps user-supplied text (chore titles/notes, item
  names) before it goes into a message — both because unescaped `<`/`&` would break the API call
  once HTML parsing is on, and so nothing in a title/note can inject unexpected markup.
- Each module prepends its own icon in its own `reminders.ts` when building the notification body
  (e.g. 🧹 for chore reminders, 🛒 for shopping reminders) and wraps the title in `<b>`. No shared
  formatting engine — this is just string construction at the two call sites.
- Every reminder DM ships with one inline button, **✅ Mark done**. `callback_data` is
  `done:<notificationId>` (well under Telegram's 64-byte limit) — the `notifications` row already
  has `householdId`, `userId`, `kind`, and `subjectId`, so one id is enough to resolve everything
  else.
- A new callback-query handler in `telegram-bot.ts`: loads the notification by id, confirms the
  chat pressing the button is the one linked to that exact `notification.userId` (so a forged
  callback can't act on someone else's reminder), then dispatches by `kind` to a small completion
  registry mirroring the liveness one — `'chore_reminder'` → `setOccurrenceStatus(..., 'done',
...)`, `'shopping_item_reminder'` → `setItemChecked(..., true, ...)`. Answers with a toast and
  edits the message to drop the button (idempotent either way — re-marking an already-done
  occurrence is a no-op).

## UI: decoupled reminder editor

Both a chore and a shopping item get a small, separate reminder affordance (a bell icon) next to
their existing actions — the same footer row as `edit`/`remove` on shopping's `ItemCard` back
face; the equivalent spot in the chore list row. Tapping it opens a small dedicated sheet for just
that item's reminders.

One shared list-management shell (add row, remove row, enforce `MAX_REMINDERS`, the "Maximum N
reminders" note) with a pluggable row renderer: chores render the existing day-offset + time-of-
day inputs and presets; shopping renders a single date+time picker per row. `createChoreAction`/
`updateChoreAction` stop touching reminders entirely. Each module gets its own thin action —
`setChoreRemindersAction({ choreId, reminders })` / `setShoppingItemRemindersAction({ itemId,
reminders })` — calling `replaceRemindersForItem` then its own scheduling function.

## Migration

One hand-edited migration file, same style as the earlier `chore_reminders` backfill:

1. `CREATE TABLE items (...)`.
2. Backfill `items` from `chores` and `shopping_items`, **reusing their existing ids exactly**
   (`INSERT INTO items (id, household_id, item_type, created_at) SELECT id, household_id,
'chore', created_at FROM chores`, same for shopping). No id anywhere else in the app ever
   changes.
3. Drop the `DEFAULT gen_random_uuid()` on `chores.id` / `shopping_items.id`, add the FK to
   `items.id` on each.
4. `CREATE TABLE reminders (...)` with the relative/absolute CHECK constraint.
5. Backfill `reminders` from `chore_reminders` (`item_id` = the old `chore_id`, which already
   equals the matching `items.id` from step 2).
6. Drop `chore_reminders`.
7. On `notifications`: drop `existence_check_table`, rename `existence_check_id` →
   `reminder_id`.

Verification before trusting it: row counts must match exactly across old/new tables, dry-run
against the docker-compose Postgres first, confirm the app boots clean afterward.

## Scope notes

- Only two modules exist today (chores, shopping) — `itemType`/`kind` values are added as
  literals, not through a formal module-registration interface. A third module repeats the same
  small pattern (one liveness entry, one completion entry, its own reminders.ts).
- Not building: a centralized cross-module reminders page (per-item inline editors only, per
  discussion); a generic notification-formatting engine (icons/bold are just string literals per
  module); more Telegram interactivity than the one mark-done button (no /commands, no menus).
