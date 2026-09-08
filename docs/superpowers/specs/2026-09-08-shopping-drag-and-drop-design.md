# Shopping drag-and-drop: categories and item placement

## What I Understood

### The problem

Issue #68 asks for two changes to the shopping page:

1. A user files an item into a category by a drag, not by a form field. The
   category field leaves the new-item form. A new item starts uncategorized.
2. A user reorders categories by a drag, not by the current Up/Down buttons.

You confirmed a third change: a user reorders items inside one category by a
drag.

The current code has three limits:

- The category reorder is hand-rolled. It sends one server call for each row
  the pointer crosses. Each call triggers a full page reload. The motion looks
  rough.
- Items have no manual order. The list sorts them by creation time only.
- The `ActionCard` already uses a horizontal swipe for "complete" and
  "delete". A "drag the whole card" gesture conflicts with that swipe.

### Why this solution

- **`@dnd-kit`** (your choice). A drag across nested containers, with touch and
  keyboard support, is hard to hand-roll well. `@dnd-kit` is built for this
  case. It is the first drag library in the project — a deliberate add, like
  Luxon in M5 and grammy in M8.
- **A dedicated grip handle** (your choice). The drag starts only from the
  grip. The `ActionCard` swipe stays unchanged. There is no gesture conflict.
- **One `<DndContext>` (Approach A)** (your choice). Category headers and item
  cards share one drag system. The interaction reads as one mechanism.
- **A new `shopping_items.sort` column.** A manual item order needs a stored
  position. The value is dense inside each bucket (`0, 1, 2 …`).
- **A "Move to…" rail action.** The category field leaves the edit sheet. A
  user without a pointer still needs a way to move an item between categories.
  This sheet is the guaranteed non-pointer path, and `DESIGN.md` requires one.
- **A pure `board.ts` module** for the order math. This logic is easy to get
  subtly wrong. A pure module gets real unit tests, the same call as
  `moveCategory` before it.
- **`useHouseholdMutation` for the drag save.** It gives an offline-aware
  retry. It also fills a gap that `DESIGN.md` records ("extending it to
  reorder writes is a known gap").

## Context

`src/routes/shopping.tsx` groups unchecked items into `<section>` blocks by
category. A trailing "Uncategorized" section holds items with no category. A
separate "Category order" section at the bottom of the page reorders
categories with a hand-rolled pointer drag (`CategoryOrder`, built on the
one-step `reorderCategoryAction`).

`ActionCard` (`src/core/ui/ActionCard.tsx`) owns a horizontal swipe. Right runs
`onComplete`, left runs `onNegative`. `IconRail` (`src/core/ui/IconRail.tsx`)
is the 44px icon-only action strip on each card.

`useLiveSync` calls `router.invalidate()` on every household SSE event, so a
mutation from another member reloads the whole route.

## Locked decisions

| Topic                | Decision                                                              |
| -------------------- | --------------------------------------------------------------------- |
| Item drag scope      | Move between categories **and** reorder within a category             |
| Drag trigger         | A dedicated grip handle on each card and each category header         |
| New categories       | A "+ New category" inline input on the list                           |
| Category order UI    | Fold into the list — draggable headers; delete the standalone section |
| Library              | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`            |
| Non-pointer path     | A "Move to…" rail action that opens a category-list sheet             |
| Category rename      | In scope — rename inline on the header                                |
| `@dnd-kit` structure | One `<DndContext>` for headers and items (Approach A)                 |

## Data model

### New column

`shopping_items.sort` — `integer('sort').notNull().default(0)`.

The value orders items inside one bucket. A bucket is one `category_id` value,
or `NULL` for the uncategorized bucket. The value is dense: `0, 1, 2 …` with no
gaps after each write.

`listItems` changes its order clause to `ORDER BY sort ASC, created_at ASC`.
`created_at` stays as a stable tiebreak.

`ItemView` does not gain a `sort` field. The client rebuilds the order from the
array position, so it does not need the raw value.

`shopping_categories` does not change. It already has a `sort` column.

### Migration `drizzle/0011_*.sql`

1. `drizzle-kit generate` emits the `ADD COLUMN` statement.
2. Hand-append a backfill, the same style as `0007`:

```sql
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY household_id, list_id, category_id ORDER BY created_at
  ) - 1 AS rn
  FROM shopping_items
)
UPDATE shopping_items s SET sort = ranked.rn FROM ranked WHERE ranked.id = s.id;
```

3. **Check the journal timestamp.** Open `drizzle/meta/_journal.json`. Confirm
   the new entry `when` value is greater than the previous entry `when` value.
   Migration `0010` broke production twice because this check was skipped.

## Server actions

All actions stay household-scoped and call `publish(...)` as today. All
multi-row writes run inside `db.transaction()`.

### `moveItemAction` — new, the workhorse

Input:

```ts
{ itemId: string, categoryId: string | null, orderedItemIds: string[] }
```

`orderedItemIds` is the full, final order of the unchecked item ids in the
destination bucket, and includes `itemId`.

Steps:

1. Validate every id in `orderedItemIds` belongs to this household and this
   list. Validate `itemId` belongs to the list.
2. Set `category_id = $categoryId` on `itemId`.
3. Set `sort = index` for each `(id, index)` pair in `orderedItemIds`.
4. If the bucket changed, densify the source bucket: renumber its remaining
   unchecked items `0..n` by their current `(sort, created_at)`.

One action covers both a within-category reorder (same `categoryId`, new order)
and a cross-category move.

### `reorderCategoriesAction` — replaces `reorderCategoryAction`

Input: `{ orderedIds: string[] }`.

Validate the set matches this household's category ids exactly (no missing id,
no extra id). Set `sort = index` for each.

Delete the old `reorderCategoryAction`, the `reorderCategory` repo function,
the `moveCategory` helper in `list-logic.ts`, and its test. `normalizeItemName`
and its test stay.

### `createCategoryAction` — new

Input: `{ name: string }`. Trim. Length 1 to 100.

If a category with the exact trimmed name exists, return its id (idempotent).
Otherwise insert with `sort = max(sort) + 1`. Return `{ id }`.

### `renameCategoryAction` — new

Input: `{ categoryId: string, name: string }`. Trim and validate.

Reject if another category already has the exact trimmed name. Update the name.

The asymmetry is deliberate. A "+ New category" click that hits an existing
name is a harmless no-op, so `create` is silent. A rename that collides would
merge two headers visually but not in data, so `rename` rejects.

### `deleteCategoryAction` — kept, one addition

The FK stays `onDelete: 'set null'`, so the deleted category's items fall to
the uncategorized bucket. **Addition:** after the delete, densify the
uncategorized bucket's `sort`, because the orphaned items keep their old
per-category values and can collide.

### `addItemAction` and `updateItemAction` — remove the category field

- Drop `categoryName` from both zod input schemas.
- A new item gets `category_id = null` and `sort = max(sort of uncategorized
bucket) + 1`.
- `updateItem` no longer touches `category_id` or `sort`.
- `reAddItemAction` (re-add from "recently bought") already passes no category.
  It only needs the `sort` append.

Refactor `getOrCreateCategory` in `repo.ts` into a plain
`createCategory(householdId, name)` that returns `{ id }`. Nothing else uses
the "get or create" shape after this change.

## Client architecture (`src/routes/shopping.tsx`)

### New dependencies

Pin exact versions:

- `@dnd-kit/core@6.3.1`
- `@dnd-kit/sortable@10.0.0`
- `@dnd-kit/utilities@3.2.2`

Peer requirement is `react >= 16.8`, so React 19 is fine. `@dnd-kit/sortable@10`
requires `@dnd-kit/core ^6.3`, which `6.3.1` meets.

`@dnd-kit` is a client-only React library. `DndContext` renders its children on
the server and attaches sensors on mount, so it is SSR-safe on the `/shopping`
route. It must not leak into a server-only path, unlike the M8 pg-boss import.

### Component tree

Extract the list into a `ShoppingList` component:

```
<DndContext sensors collisionDetection={closestCorners}
            onDragStart onDragOver onDragEnd onDragCancel>
  <SortableContext items={board.categoryOrder} strategy={verticalListSortingStrategy}>
     CategoryGroup                  // useSortable({ id, data: { type: 'category' } })
        header row = the drag handle + name + count + delete
        <SortableContext items={bucket.itemIds} strategy={verticalListSortingStrategy}>
           SortableItemCard         // useSortable({ id, data: { type: 'item', bucketKey } })
              <ActionCard>          // unchanged
                 <IconRail>         // grip is the first slot
  <DragOverlay>                     // a lifted card, or a lifted header
```

The uncategorized bucket renders through the same `CategoryGroup`, with a fixed
key `'__uncat__'` and no header actions. It renders **after** the category
`SortableContext`, still inside the `DndContext`. Only its inner item
`SortableContext` takes part in a drag; the group itself cannot be reordered.

### Optimistic state

```ts
type Board = {
  categoryOrder: string[] // category ids, no '__uncat__'
  itemsByBucket: Record<string, string[]> // key = category id or '__uncat__'
}
const [board, setBoard] = useState(() => buildBoard(data))
```

`buildBoard(data)` reads `data.categories` for the order and groups the
**unchecked** items by `categoryId` (a `null` category goes to `'__uncat__'`).
Checked items are not in the board; they are in the `DoneStack`.

A `useEffect([data])` runs `setBoard(buildBoard(data))` **only when `activeId ==
null`**. `data` changes after `router.invalidate()` resolves, so the rebuild
runs on fresh server state, not stale state. This is the reconciliation point:
once a drag settles, the server state and any other member's change win.

The item objects still come from `data.items`, held in a `Map<id, ItemView>`.
`board` holds order and grouping only.

### Drag handlers

- `onDragStart(e)` — set `activeId` and record `e.active.data.current.type`.
- `onDragOver(e)` — for `type === 'item'` only. If `over` sits in a different
  bucket, call `placeItem` to move the id into that bucket in `board`. This is
  optimistic and sends no request. It is the standard `@dnd-kit` multi-container
  transfer.
- `onDragEnd(e)`:
  - `type === 'category'` — reorder `board.categoryOrder`, then call
    `reorderCategoriesAction({ orderedIds })`.
  - `type === 'item'` — read the final bucket and order from `board`, then call
    `moveItemAction({ itemId, categoryId, orderedItemIds })`.
  - Wrap the call in `useHouseholdMutation` (offline-aware retry). On success or
    failure, call `router.invalidate()`. A failure snaps the list back to the
    server state.
  - Set `activeId = null`.
- `onDragCancel` — set `activeId = null`.

Render one list-level `<MutationStatus>` for the drag save. This fills the gap
`DESIGN.md` names ("extending it to reorder writes is a known gap").

### Sensors

- `PointerSensor` — `activationConstraint: { distance: 6 }`.
- `TouchSensor` — `activationConstraint: { delay: 200, tolerance: 8 }`.
- `KeyboardSensor` — `coordinateGetter: sortableKeyboardCoordinates`.

`@dnd-kit` auto-scroll is on by default, so a drag near the viewport edge
scrolls the page with no extra code.

## UI and interaction

### Grip handle

The grip is the first slot in every item card's `IconRail`, and the first
element in every category header.

- Icon: `GripIcon`, tone `ink-ghost` (The Ghost Rule allows a glyph-only mark).
- `touch-action: none` on the grip element only, so the touch sensor takes over
  there while the rest of the card keeps `pan-y` scroll and the `ActionCard`
  swipe.
- `cursor: grab`.
- It is the sortable activator (`ref={setActivatorNodeRef}`, spreads
  `attributes` and `listeners`). It is not an `onClick` action.

Extend `IconRailAction` with an optional `dragHandle` shape so one slot can
carry the activator props instead of an `onClick`. This keeps the rail API
honest and reusable (chores' rotation list can adopt it later).

### "Move to…" rail action

A new `IconRail` slot on each item card. It opens a page-level `<Sheet>`. The
`itemSheet` union from PR #77 gains a `'move'` kind, so the sheet hosts at the
page level like the others.

The sheet lists every category plus "Uncategorized". A tap calls
`moveItemAction`, with `orderedItemIds` set to the target bucket's current
order plus `itemId` at the end. This appends the item to that bucket.

This is the guaranteed keyboard and screen-reader path for a cross-category
move.

### Category header

Layout: `[grip] [name] [count] [trash]`.

- The grip reorders the category (drag, or arrow keys when focused).
- A tap on the **name** turns it into an inline `<input>`. Enter saves through
  `renameCategoryAction`. Escape cancels.
- The trash icon deletes the category (a bare click, as today — low stakes,
  because the items fall to Uncategorized and can be re-filed).
- The count shows the number of unchecked items in the category.

### "+ New category"

A button after the last category group. A click reveals an inline autofocused
`<input>`. Enter calls `createCategoryAction` and a new empty section appears.
Escape or an empty value cancels.

### Empty categories and the uncategorized bucket

- An empty category renders its header and a slim drop zone, at least 44px
  tall, with muted "Drag items here" text. It must be a real drop target.
- The uncategorized bucket renders whenever at least one category exists, so
  there is always a place to un-file an item to. It has no header actions.
- With zero categories, the list is a flat item list with no headers, the same
  as today.

### Drag feedback

- The source card or header drops to `opacity-40` in place.
- The `<DragOverlay>` shows a `shadow-lifted` copy.
- The hovered bucket gets an `accent` ring and `bg-accent-tint`.

This matches the DESIGN.md Lift-On-Front rule.

## DESIGN.md changes

- **Reorderable Lists** — rewrite. `@dnd-kit` now, not a hand-rolled one-step
  swap. Category order is the list's own headers, not a separate section. Item
  cards carry a grip: drag inside a category to reorder, drag onto another
  header to re-file. The "Move to…" rail action is the non-pointer path.
- **The Icon Rail** and **The Rail-Is-Actions Rule** — add the grip (an
  activator, not an action) and "Move to category" to the listed rail contents.
- **New "Categories" subsection** — inline create and rename, header-drag
  reorder, header-trash delete, empty categories stay visible as drop targets.
- Note the new dependency.
- Note that chores' `RotationOrderList` still uses the legacy hand-rolled drag,
  and that a migration to `@dnd-kit` is a fast-follow, not this change.

## Testing

- **New pure module `src/modules/shopping/board.ts`.** Functions:
  - `buildBoard(data)` — group unchecked items, read the category order.
  - `placeItem(board, itemId, toBucket, toIndex)` — remove the id from its
    current bucket, insert it at `(toBucket, toIndex)`, return a new `Board`.
    One function covers a within-bucket reorder and a cross-bucket move.
  - `bucketKeyToCategoryId(key)` / `categoryIdToBucketKey(id)` — the
    `'__uncat__'` mapping.

  Category-header reorder uses `arrayMove` from `@dnd-kit/sortable` directly on
  `board.categoryOrder`; it needs no wrapper.

  Table-driven unit tests for `buildBoard` and `placeItem`. This is the "easy
  to get subtly wrong" logic, the same call as `moveCategory`.

- **Server actions** — verified through the dev-server RPC-replication
  technique in the verification pass. Repo functions have no unit tests in this
  project, which matches how `reorderCategory` was handled.
- Delete `moveCategory` and its test.
- No component tests. The project has none for routes.
- `@dnd-kit` keyboard behavior — manual verification.

## Verification

1. `npm run db:migrate` on the local database. Confirm the column exists and
   the backfill ran.
2. Full check suite: `npx tsc --noEmit`, `npx eslint .`, `npm run check`
   (prettier), `npx vitest run`, `npx vite build`, then `rm -rf .output`.
   `npm run check` is a mandatory step in this repo.
3. Dev server with an authenticated session:
   - Create, rename, delete, and reorder categories.
   - Drag an item inside a category, and across categories.
   - Use "+ New category" and the "Move to…" sheet.
   - Reorder with the keyboard.
   - Reload the page. Confirm the order persists.
   - Open a second session. Confirm the change appears through live-sync.
4. Build once and grep `.output/public/assets/*.js` for `@dnd-kit`. Confirm it
   lands in the client bundle only (it is a legitimate client dependency).
   Record the bundle size delta.
5. Touch and PWA device testing is the known environment gap. State it plainly
   in the PR.

## Out of scope (YAGNI)

- Multiple shopping lists.
- A category color or icon.
- A drag of checked items or `DoneStack` items.
- A confirm dialog on category delete.
- The migration of chores' `RotationOrderList` to `@dnd-kit` — a fast-follow.
