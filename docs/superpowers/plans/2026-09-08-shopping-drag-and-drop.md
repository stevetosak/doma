# Shopping Drag-and-Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user file shopping items into categories, reorder items inside a category, and reorder categories — all by drag, with a keyboard fallback.

**Architecture:** One `@dnd-kit` `<DndContext>` on the shopping route holds a top-level sortable list of category headers and a per-category sortable list of item cards. A pure `board.ts` module owns the optimistic order state. Every drop persists through one of two server actions (`moveItemAction`, `reorderCategoriesAction`) wrapped in `useHouseholdMutation`, then a `router.invalidate()` reconciles against the server.

**Tech Stack:** TanStack Start (React 19), Drizzle ORM on Postgres, Zod, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-shopping-drag-and-drop-design.md`

## Global Constraints

- **Branch:** `feat/shopping-drag-and-drop` (already created off `main`). Never push to `main`. Open one PR at the end.
- **Commit messages:** a single concise subject line. No `Co-Authored-By` or `Claude-Session` footer.
- **Full check suite** (run before any "done" claim): `npx tsc --noEmit`, `npx eslint .`, `npm run check` (this is `prettier --check .` — a separate gate that has broken `main` before), `npx vitest run`, `npx vite build` then `rm -rf .output`.
- **Path alias:** imports use `#/...` (maps to `src/`).
- **DB access:** every query goes through `householdScope(table, householdId, ...extraConditions)`. Multi-row writes run inside `db.transaction(async (tx) => ...)`.
- **SSE:** every mutating server action calls `publish(householdId, { module: 'shopping', entity, action })` after the write.
- **Pinned dependency versions:** `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`.
- **Local DB:** Docker Postgres, container `doma-postgres-1`, user+db `doma`. `DATABASE_URL` is in `.env.local`. Run raw SQL with `docker exec doma-postgres-1 psql -U doma -d doma -c "..."`.
- **Scratch verification scripts:** write to `scripts/_scratch.ts`, run with `npx tsx scripts/_scratch.ts`, never commit (gitignored in Task 1).

---

## File Structure

**Create:**

- `drizzle/0011_*.sql` — migration: `shopping_items.sort` column + backfill (drizzle-kit names the file).
- `src/modules/shopping/board.ts` — pure board state: `buildBoard`, `placeItem`, bucket-key helpers.
- `src/modules/shopping/board.test.ts` — unit tests for `board.ts`.

**Modify:**

- `package.json` / `package-lock.json` — add the three `@dnd-kit` packages.
- `.gitignore` — ignore `scripts/_scratch.ts`.
- `src/modules/shopping/schema.ts` — add `sort` to `shoppingItems`.
- `src/modules/shopping/repo.ts` — `sort`-ordered `listItems`; new `moveItem`, `reorderCategories`, `createCategory`, `renameCategory`; `deleteCategory` densify; `addItem` sets `sort`; drop `getOrCreateCategory` and `reorderCategory`; `updateItem` drops category.
- `src/modules/shopping/list-logic.ts` — delete `moveCategory` and `SortableCategory`.
- `src/modules/shopping/list-logic.test.ts` — delete the `moveCategory` describe block.
- `src/modules/shopping/shopping.functions.ts` — new actions; delete `reorderCategoryAction`; drop `categoryName` from `addItemInput` / `updateItemInput`.
- `src/core/ui/IconRail.tsx` — optional `handleProps` on `IconRailAction`; `onClick` becomes optional.
- `src/core/ui/icons.tsx` — add `FolderIcon`.
- `src/routes/shopping.tsx` — the client refactor (Tasks 9–16).
- `DESIGN.md` — Reorderable Lists rewrite, Icon Rail update, new Categories subsection.

---

## Task 1: Add @dnd-kit and the scratch-script ignore

**Files:**

- Modify: `package.json`, `package-lock.json`
- Modify: `.gitignore`

**Interfaces:**

- Produces: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` importable in `src/`.

- [ ] **Step 1: Install the packages, pinned**

Run:

```bash
npm install --save-exact @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 @dnd-kit/utilities@3.2.2
```

- [ ] **Step 2: Confirm the versions landed exact**

Run: `node -e "const d=require('./package.json').dependencies; console.log(d['@dnd-kit/core'], d['@dnd-kit/sortable'], d['@dnd-kit/utilities'])"`
Expected: `6.3.1 10.0.0 3.2.2` (no `^`).

- [ ] **Step 3: Add the scratch ignore**

In `.gitignore`, under the `# editor / OS` block, add:

```
# throwaway verification scripts (this plan)
scripts/_scratch.ts
```

- [ ] **Step 4: Verify the build still passes**

Run: `npx tsc --noEmit && npx vite build && rm -rf .output`
Expected: no type errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "build: add @dnd-kit for shopping drag-and-drop"
```

---

## Task 2: Add `shopping_items.sort`, migration 0011, sort-ordered list

**Files:**

- Modify: `src/modules/shopping/schema.ts`
- Create: `drizzle/0011_*.sql` (via `npm run db:generate`)
- Modify: `src/modules/shopping/repo.ts` (the `listItems` order clause)

**Interfaces:**

- Produces: `shopping_items.sort` — `integer NOT NULL DEFAULT 0`, dense per bucket. `listItems` returns items ordered `sort ASC, created_at ASC`.

- [ ] **Step 1: Add the column to the schema**

In `src/modules/shopping/schema.ts`, inside `shoppingItems`, add after `note`:

```ts
  // Dense per-bucket order (a bucket is one category_id value, or NULL).
  // Rewritten in full by moveItemAction on every drop.
  sort: integer('sort').notNull().default(0),
```

`integer` is already imported in that file.

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new file `drizzle/0011_<name>.sql` containing `ALTER TABLE "shopping_items" ADD COLUMN "sort" integer DEFAULT 0 NOT NULL;`

- [ ] **Step 3: Hand-append the backfill**

Open the new `drizzle/0011_*.sql`. After the `ADD COLUMN` line, add:

```sql
--> statement-breakpoint
-- Hand-edited (not drizzle-kit generated): seed a stable initial order per
-- bucket from creation time, so existing lists don't all collapse to sort=0.
WITH ranked AS (
	SELECT id, row_number() OVER (
		PARTITION BY household_id, list_id, category_id ORDER BY created_at
	) - 1 AS rn
	FROM shopping_items
)
UPDATE shopping_items s SET sort = ranked.rn FROM ranked WHERE ranked.id = s.id;
```

- [ ] **Step 4: Verify the journal timestamp ordering**

Run: `node -e "const j=require('./drizzle/meta/_journal.json').entries; const a=j.at(-2), b=j.at(-1); console.log(a.tag, a.when, '<', b.tag, b.when, '->', b.when > a.when)"`
Expected: ends with `-> true`. If `false`, edit `drizzle/meta/_journal.json` and set the `0011` entry's `when` to the previous entry's `when` + `1000`. Migration `0010` broke production twice from exactly this.

- [ ] **Step 5: Apply and check locally**

Run:

```bash
npm run db:migrate
docker exec doma-postgres-1 psql -U doma -d doma -c "\d shopping_items" | grep sort
docker exec doma-postgres-1 psql -U doma -d doma -c "SELECT category_id, id, sort FROM shopping_items WHERE is_checked = false ORDER BY category_id, sort LIMIT 12;"
```

Expected: `sort | integer | not null | 0`; the backfill shows `0,1,2,…` restarting per `category_id`.

- [ ] **Step 6: Order `listItems` by sort**

In `src/modules/shopping/repo.ts`, in `listItems`, change:

```ts
    .orderBy(asc(shoppingItems.createdAt))
```

to:

```ts
    .orderBy(asc(shoppingItems.sort), asc(shoppingItems.createdAt))
```

- [ ] **Step 7: Full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check && npx vitest run`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/modules/shopping/schema.ts src/modules/shopping/repo.ts drizzle/
git commit -m "feat: add shopping_items.sort column for manual item order"
```

---

## Task 3: `board.ts` pure module (TDD)

**Files:**

- Create: `src/modules/shopping/board.test.ts`
- Create: `src/modules/shopping/board.ts`

**Interfaces:**

- Produces:
  - `UNCATEGORIZED: '__uncat__'`
  - `type Board = { categoryOrder: string[]; itemsByBucket: Record<string, string[]> }`
  - `buildBoard(data: { categories: CategoryView[]; items: ItemView[] }, hiddenIds?: ReadonlySet<string>): Board`
  - `placeItem(board: Board, itemId: string, toBucket: string, toIndex: number): Board`
  - `bucketKeyToCategoryId(key: string): string | null`
  - `categoryIdToBucketKey(id: string | null): string`

- [ ] **Step 1: Write the failing test**

Create `src/modules/shopping/board.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  UNCATEGORIZED,
  buildBoard,
  bucketKeyToCategoryId,
  categoryIdToBucketKey,
  placeItem,
} from './board'
import type { CategoryView, ItemView } from './repo'

const cat = (id: string, sort: number): CategoryView => ({ id, name: id, sort })

const item = (
  id: string,
  categoryId: string | null,
  isChecked = false,
): ItemView => ({
  id,
  name: id,
  quantity: null,
  unit: null,
  note: null,
  categoryId,
  priority: null,
  isChecked,
  addedBy: null,
  reminders: [],
})

describe('bucket key helpers', () => {
  it('round-trips a category id', () => {
    expect(bucketKeyToCategoryId(categoryIdToBucketKey('c1'))).toBe('c1')
  })
  it('maps null to the uncategorized key and back', () => {
    expect(categoryIdToBucketKey(null)).toBe(UNCATEGORIZED)
    expect(bucketKeyToCategoryId(UNCATEGORIZED)).toBeNull()
  })
})

describe('buildBoard', () => {
  const data = {
    categories: [cat('c1', 0), cat('c2', 1)],
    items: [
      item('i1', 'c1'),
      item('i2', 'c1'),
      item('i3', 'c2'),
      item('i4', null),
      item('i5', 'c1', true),
    ],
  }

  it('orders categories by the categories array', () => {
    expect(buildBoard(data).categoryOrder).toEqual(['c1', 'c2'])
  })

  it('groups unchecked items by bucket, preserving array order', () => {
    const board = buildBoard(data)
    expect(board.itemsByBucket).toEqual({
      c1: ['i1', 'i2'],
      c2: ['i3'],
      [UNCATEGORIZED]: ['i4'],
    })
  })

  it('creates an empty bucket for a category with no items', () => {
    const board = buildBoard({ categories: [cat('c9', 0)], items: [] })
    expect(board.itemsByBucket.c9).toEqual([])
  })

  it('excludes checked items', () => {
    expect(buildBoard(data).itemsByBucket.c1).not.toContain('i5')
  })

  it('excludes hidden ids', () => {
    const board = buildBoard(data, new Set(['i2']))
    expect(board.itemsByBucket.c1).toEqual(['i1'])
  })
})

describe('placeItem', () => {
  const board = {
    categoryOrder: ['c1', 'c2'],
    itemsByBucket: { c1: ['i1', 'i2', 'i3'], c2: ['i4'], [UNCATEGORIZED]: [] },
  }

  it('reorders within a bucket', () => {
    const next = placeItem(board, 'i1', 'c1', 2)
    expect(next.itemsByBucket.c1).toEqual(['i2', 'i3', 'i1'])
  })

  it('moves across buckets and removes from the source', () => {
    const next = placeItem(board, 'i2', 'c2', 0)
    expect(next.itemsByBucket.c1).toEqual(['i1', 'i3'])
    expect(next.itemsByBucket.c2).toEqual(['i2', 'i4'])
  })

  it('clamps an out-of-range index to the bucket end', () => {
    const next = placeItem(board, 'i4', 'c1', 99)
    expect(next.itemsByBucket.c1).toEqual(['i1', 'i2', 'i3', 'i4'])
  })

  it('does not mutate the input board', () => {
    placeItem(board, 'i1', 'c2', 0)
    expect(board.itemsByBucket.c1).toEqual(['i1', 'i2', 'i3'])
  })

  it('leaves categoryOrder untouched', () => {
    expect(placeItem(board, 'i1', 'c2', 0).categoryOrder).toEqual(['c1', 'c2'])
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/modules/shopping/board.test.ts`
Expected: FAIL — `Failed to resolve import "./board"`.

- [ ] **Step 3: Write the implementation**

Create `src/modules/shopping/board.ts`:

```ts
import type { CategoryView, ItemView } from './repo'

/** Bucket key for items with no category. */
export const UNCATEGORIZED = '__uncat__'

export interface Board {
  /** Category ids in display order. Does not include UNCATEGORIZED. */
  categoryOrder: string[]
  /** Item ids per bucket. Key is a category id or UNCATEGORIZED. */
  itemsByBucket: Record<string, string[]>
}

export function categoryIdToBucketKey(id: string | null): string {
  return id ?? UNCATEGORIZED
}

export function bucketKeyToCategoryId(key: string): string | null {
  return key === UNCATEGORIZED ? null : key
}

/**
 * Build the ordered board from loader data. Items are expected already
 * sorted (`sort ASC, created_at ASC`), so push order is display order.
 * Checked items and `hiddenIds` (client-side pending deletes) are left out.
 */
export function buildBoard(
  data: { categories: CategoryView[]; items: ItemView[] },
  hiddenIds?: ReadonlySet<string>,
): Board {
  const categoryOrder = data.categories.map((c) => c.id)
  const itemsByBucket: Record<string, string[]> = { [UNCATEGORIZED]: [] }
  for (const c of data.categories) itemsByBucket[c.id] = []
  for (const item of data.items) {
    if (item.isChecked) continue
    if (hiddenIds?.has(item.id)) continue
    const key = categoryIdToBucketKey(item.categoryId)
    ;(itemsByBucket[key] ??= []).push(item.id)
  }
  return { categoryOrder, itemsByBucket }
}

/**
 * Remove `itemId` from wherever it is and insert it at `(toBucket,
 * toIndex)`. Returns a new board; never mutates the input. `toIndex` is
 * clamped to the destination length.
 */
export function placeItem(
  board: Board,
  itemId: string,
  toBucket: string,
  toIndex: number,
): Board {
  const itemsByBucket: Record<string, string[]> = {}
  for (const [key, ids] of Object.entries(board.itemsByBucket)) {
    itemsByBucket[key] = ids.filter((id) => id !== itemId)
  }
  const target = (itemsByBucket[toBucket] ??= [])
  const clamped = Math.max(0, Math.min(toIndex, target.length))
  target.splice(clamped, 0, itemId)
  return { categoryOrder: [...board.categoryOrder], itemsByBucket }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/modules/shopping/board.test.ts`
Expected: PASS — all specs green.

- [ ] **Step 5: Full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/modules/shopping/board.ts src/modules/shopping/board.test.ts
git commit -m "feat: add pure board module for shopping drag order"
```

---

## Task 4: `moveItem` repo function + `moveItemAction`

**Files:**

- Modify: `src/modules/shopping/repo.ts`
- Modify: `src/modules/shopping/shopping.functions.ts`
- Scratch: `scripts/_scratch.ts`

**Interfaces:**

- Consumes: `shoppingItems` (has `sort`), `householdScope`, `db.transaction`.
- Produces:
  - `moveItem(householdId: string, input: { itemId: string; categoryId: string | null; orderedItemIds: string[] }): Promise<void>`
  - `moveItemAction` — server fn, POST, `{ itemId, categoryId, orderedItemIds }` → `{ ok: true }`.

- [ ] **Step 1: Add `moveItem` to `repo.ts`**

At the top of `repo.ts`, the import from `drizzle-orm` currently reads:

```ts
import { and, asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
```

Change it to add `isNull`:

```ts
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  notInArray,
  sql,
} from 'drizzle-orm'
```

Add this function after `reorderCategory` (which Task 5 removes — for now place it after `deleteCategory`):

```ts
/**
 * The one write path for a drag drop. Sets the moved item's category,
 * rewrites the destination bucket's `sort` from `orderedItemIds`, and — if
 * the item changed buckets — closes the gap it left in the source bucket.
 * `orderedItemIds` is the full final order of the destination bucket's
 * unchecked items and includes `itemId`.
 */
export async function moveItem(
  householdId: string,
  input: {
    itemId: string
    categoryId: string | null
    orderedItemIds: string[]
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        categoryId: shoppingItems.categoryId,
        listId: shoppingItems.listId,
      })
      .from(shoppingItems)
      .where(
        householdScope(
          shoppingItems,
          householdId,
          eq(shoppingItems.id, input.itemId),
        ),
      )
    if (!current) throw new Error('Item not found')

    const owned = await tx
      .select({ id: shoppingItems.id })
      .from(shoppingItems)
      .where(
        householdScope(
          shoppingItems,
          householdId,
          and(
            eq(shoppingItems.listId, current.listId),
            inArray(shoppingItems.id, input.orderedItemIds),
          ),
        ),
      )
    if (owned.length !== input.orderedItemIds.length) {
      throw new Error('orderedItemIds does not match this list')
    }

    await tx
      .update(shoppingItems)
      .set({ categoryId: input.categoryId })
      .where(
        householdScope(
          shoppingItems,
          householdId,
          eq(shoppingItems.id, input.itemId),
        ),
      )

    for (const [index, id] of input.orderedItemIds.entries()) {
      await tx
        .update(shoppingItems)
        .set({ sort: index })
        .where(
          householdScope(shoppingItems, householdId, eq(shoppingItems.id, id)),
        )
    }

    if (current.categoryId !== input.categoryId) {
      const sourceRows = await tx
        .select({ id: shoppingItems.id })
        .from(shoppingItems)
        .where(
          householdScope(
            shoppingItems,
            householdId,
            and(
              eq(shoppingItems.listId, current.listId),
              eq(shoppingItems.isChecked, false),
              current.categoryId === null
                ? isNull(shoppingItems.categoryId)
                : eq(shoppingItems.categoryId, current.categoryId),
            ),
          ),
        )
        .orderBy(asc(shoppingItems.sort), asc(shoppingItems.createdAt))
      for (const [index, row] of sourceRows.entries()) {
        await tx
          .update(shoppingItems)
          .set({ sort: index })
          .where(
            householdScope(
              shoppingItems,
              householdId,
              eq(shoppingItems.id, row.id),
            ),
          )
      }
    }
  })
}
```

- [ ] **Step 2: Add `moveItemAction` to `shopping.functions.ts`**

In `shopping.functions.ts`, add `moveItem` to the `repo` import list. Then, after `updateItemAction`, add:

```ts
const moveItemInput = z.object({
  itemId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  orderedItemIds: z.array(z.string().uuid()).max(200),
})

export const moveItemAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => moveItemInput.parse(input))
  .handler(async ({ data }) => {
    const { householdId } = await requireMember()
    await moveItem(householdId, data)
    publish(householdId, {
      module: 'shopping',
      entity: 'item',
      action: 'updated',
    })
    return { ok: true as const }
  })
```

- [ ] **Step 3: Write the scratch verification**

Create `scripts/_scratch.ts`:

```ts
import { config } from 'dotenv'
config({ path: ['.env.local', '.env'] })
import assert from 'node:assert/strict'
import { db } from '#/core/db/client'
import { shoppingCategories, shoppingItems } from '#/modules/shopping/schema'
import { items } from '#/core/items/schema'
import { eq } from 'drizzle-orm'
import { moveItem } from '#/modules/shopping/repo'

const HH = '00000000-0000-0000-0000-0000000000aa'

async function main() {
  // A household + list row must already exist for FKs; reuse any real one.
  const [anyItem] = await db
    .select({
      householdId: shoppingItems.householdId,
      listId: shoppingItems.listId,
    })
    .from(shoppingItems)
    .limit(1)
  assert(anyItem, 'need at least one existing shopping item to borrow ids from')
  const { householdId, listId } = anyItem

  const [catA] = await db
    .insert(shoppingCategories)
    .values({ householdId, name: '_scratchA', sort: 900 })
    .returning()
  const [catB] = await db
    .insert(shoppingCategories)
    .values({ householdId, name: '_scratchB', sort: 901 })
    .returning()

  const mk = async (name: string, categoryId: string | null, sort: number) => {
    const [it] = await db
      .insert(items)
      .values({ householdId, itemType: 'shopping_item' })
      .returning()
    await db
      .insert(shoppingItems)
      .values({ id: it.id, householdId, listId, name, categoryId, sort })
    return it.id
  }
  const a1 = await mk('_s_a1', catA.id, 0)
  const a2 = await mk('_s_a2', catA.id, 1)
  const a3 = await mk('_s_a3', catA.id, 2)

  // Move a2 to catB at index 0.
  await moveItem(householdId, {
    itemId: a2,
    categoryId: catB.id,
    orderedItemIds: [a2],
  })

  const read = async (id: string) =>
    (await db.select().from(shoppingItems).where(eq(shoppingItems.id, id)))[0]
  assert.equal((await read(a2)).categoryId, catB.id, 'a2 now in catB')
  assert.equal((await read(a2)).sort, 0, 'a2 sort reset to 0 in catB')
  assert.equal((await read(a1)).sort, 0, 'catA densified: a1 -> 0')
  assert.equal((await read(a3)).sort, 1, 'catA densified: a3 -> 1')

  // Cleanup.
  for (const id of [a1, a2, a3]) await db.delete(items).where(eq(items.id, id))
  await db.delete(shoppingCategories).where(eq(shoppingCategories.id, catA.id))
  await db.delete(shoppingCategories).where(eq(shoppingCategories.id, catB.id))
  console.log('PASS')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
```

- [ ] **Step 4: Run the scratch verification**

Run: `npx tsx scripts/_scratch.ts`
Expected: prints `PASS`.

- [ ] **Step 5: Full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check && npx vitest run`
Expected: all pass. `scripts/_scratch.ts` is gitignored so eslint ignores it via `.gitignore`? No — eslint flat config does not read `.gitignore`. If eslint flags `scripts/_scratch.ts`, add `scripts/_scratch.ts` to the `ignores` array in `eslint.config.js` in this same commit.

- [ ] **Step 6: Commit**

```bash
git add src/modules/shopping/repo.ts src/modules/shopping/shopping.functions.ts eslint.config.js
git commit -m "feat: add moveItem repo fn + moveItemAction for shopping drops"
```

---

## Task 5: `reorderCategoriesAction`; remove one-step reorder + `moveCategory`

**Files:**

- Modify: `src/modules/shopping/repo.ts`
- Modify: `src/modules/shopping/shopping.functions.ts`
- Modify: `src/modules/shopping/list-logic.ts`
- Modify: `src/modules/shopping/list-logic.test.ts`

**Interfaces:**

- Produces:
  - `reorderCategories(householdId: string, orderedIds: string[]): Promise<void>`
  - `reorderCategoriesAction` — server fn, POST, `{ orderedIds: string[] }` → `{ ok: true }`.
- Removes: `reorderCategory` (repo), `reorderCategoryAction`, `moveCategory` + `SortableCategory` (`list-logic.ts`).

- [ ] **Step 1: Replace `reorderCategory` with `reorderCategories` in `repo.ts`**

Delete the whole `export async function reorderCategory(...)` block. In its place:

```ts
export async function reorderCategories(
  householdId: string,
  orderedIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: shoppingCategories.id })
      .from(shoppingCategories)
      .where(householdScope(shoppingCategories, householdId))
    const existingIds = new Set(existing.map((c) => c.id))
    if (
      existingIds.size !== orderedIds.length ||
      !orderedIds.every((id) => existingIds.has(id))
    ) {
      throw new Error('orderedIds does not match this household')
    }
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(shoppingCategories)
        .set({ sort: index })
        .where(
          householdScope(
            shoppingCategories,
            householdId,
            eq(shoppingCategories.id, id),
          ),
        )
    }
  })
}
```

Then remove the now-unused `moveCategory` import at the top of `repo.ts`:

```ts
import { moveCategory, normalizeItemName } from './list-logic'
```

becomes:

```ts
import { normalizeItemName } from './list-logic'
```

- [ ] **Step 2: Replace the action in `shopping.functions.ts`**

In the `repo` import list, replace `reorderCategory` with `reorderCategories`. Delete the `reorderCategoryInput` / `reorderCategoryAction` block. Add:

```ts
const reorderCategoriesInput = z.object({
  orderedIds: z.array(z.string().uuid()).max(100),
})

export const reorderCategoriesAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => reorderCategoriesInput.parse(input))
  .handler(async ({ data }) => {
    const { householdId } = await requireMember()
    await reorderCategories(householdId, data.orderedIds)
    publish(householdId, {
      module: 'shopping',
      entity: 'category',
      action: 'updated',
    })
    return { ok: true as const }
  })
```

- [ ] **Step 3: Delete `moveCategory` from `list-logic.ts`**

Remove the `SortableCategory` interface and the entire `moveCategory` function. Keep `normalizeItemName`. The file's top JSDoc should now read (adjust wording):

```ts
/**
 * Pure helper for the "recently bought" natural key. Small, but easy to
 * get subtly wrong, so it gets a real unit test rather than living inline.
 */
```

- [ ] **Step 4: Delete the `moveCategory` tests**

In `src/modules/shopping/list-logic.test.ts`, remove the `import` of `moveCategory` (keep `normalizeItemName`) and delete the whole `describe('moveCategory', ...)` block.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/modules/shopping/list-logic.test.ts`
Expected: PASS — only `normalizeItemName` specs remain, all green.

- [ ] **Step 6: Full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check && npx vitest run`
Expected: all pass. (`tsc` will fail in `shopping.tsx` because it still imports `reorderCategoryAction` — that is Task 10. If run standalone here, note the expected `shopping.tsx` error and proceed; it is resolved in Task 10. To keep each commit green, do Step 7 instead.)

- [ ] **Step 7: Keep the tree compiling — stub the old call site**

In `src/routes/shopping.tsx`, the `CategoryOrder` component calls `reorderCategoryAction`. Task 10 deletes `CategoryOrder` entirely. Until then, in the `shopping.functions` import block of `shopping.tsx`, temporarily keep a shim: change `CategoryOrder`'s `move` function body to:

```ts
async function move() {
  await onChange()
}
```

and remove the `reorderCategoryAction` import line from `shopping.tsx`. This makes `CategoryOrder`'s buttons a no-op for one commit; it is deleted in Task 10.

- [ ] **Step 8: Re-run the full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check && npx vitest run`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/modules/shopping/ src/routes/shopping.tsx
git commit -m "feat: replace one-step category reorder with a full-order action"
```

---

## Task 6: `createCategoryAction` + `renameCategoryAction`

**Files:**

- Modify: `src/modules/shopping/repo.ts`
- Modify: `src/modules/shopping/shopping.functions.ts`
- Scratch: `scripts/_scratch.ts`

**Interfaces:**

- Produces:
  - `createCategory(householdId: string, name: string): Promise<{ id: string }>`
  - `renameCategory(householdId: string, categoryId: string, name: string): Promise<void>`
  - `createCategoryAction` — POST `{ name }` → `{ id }`
  - `renameCategoryAction` — POST `{ categoryId, name }` → `{ ok: true }`

- [ ] **Step 1: Add `createCategory` and `renameCategory` to `repo.ts`**

Add `ne` to the `drizzle-orm` import:

```ts
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  notInArray,
  sql,
} from 'drizzle-orm'
```

Delete the existing private `getOrCreateCategory` function. Add:

```ts
/**
 * Create a category, or return the existing one if the exact trimmed name
 * is already taken. Idempotent so a "+ New category" click that repeats a
 * name is a harmless no-op.
 */
export async function createCategory(
  householdId: string,
  name: string,
): Promise<{ id: string }> {
  const trimmed = name.trim()
  const [existing] = await db
    .select({ id: shoppingCategories.id })
    .from(shoppingCategories)
    .where(
      householdScope(
        shoppingCategories,
        householdId,
        eq(shoppingCategories.name, trimmed),
      ),
    )
    .limit(1)
  if (existing) return { id: existing.id }

  const categories = await listCategories(householdId)
  const nextSort =
    categories.length > 0 ? Math.max(...categories.map((c) => c.sort)) + 1 : 0
  const [created] = await db
    .insert(shoppingCategories)
    .values({ householdId, name: trimmed, sort: nextSort })
    .returning({ id: shoppingCategories.id })
  if (!created) throw new Error('Insert did not return a row')
  return { id: created.id }
}

/**
 * Rename a category. Rejects a collision with another category's exact
 * name — a merge would look right on screen but not in the data.
 */
export async function renameCategory(
  householdId: string,
  categoryId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Category name cannot be empty')
  const [clash] = await db
    .select({ id: shoppingCategories.id })
    .from(shoppingCategories)
    .where(
      householdScope(
        shoppingCategories,
        householdId,
        and(
          eq(shoppingCategories.name, trimmed),
          ne(shoppingCategories.id, categoryId),
        ),
      ),
    )
    .limit(1)
  if (clash) throw new Error('A category with that name already exists.')
  await db
    .update(shoppingCategories)
    .set({ name: trimmed })
    .where(
      householdScope(
        shoppingCategories,
        householdId,
        eq(shoppingCategories.id, categoryId),
      ),
    )
}
```

- [ ] **Step 2: Add the actions to `shopping.functions.ts`**

Add `createCategory`, `renameCategory` to the `repo` import list; remove nothing else here yet (Task 7 handles `addItem`/`updateItem`). After `deleteCategoryAction`, add:

```ts
const createCategoryInput = z.object({
  name: z.string().trim().min(1).max(100),
})

export const createCategoryAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => createCategoryInput.parse(input))
  .handler(async ({ data }) => {
    const { householdId } = await requireMember()
    const result = await createCategory(householdId, data.name)
    publish(householdId, {
      module: 'shopping',
      entity: 'category',
      action: 'created',
    })
    return result
  })

const renameCategoryInput = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
})

export const renameCategoryAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => renameCategoryInput.parse(input))
  .handler(async ({ data }) => {
    const { householdId } = await requireMember()
    await renameCategory(householdId, data.categoryId, data.name)
    publish(householdId, {
      module: 'shopping',
      entity: 'category',
      action: 'updated',
    })
    return { ok: true as const }
  })
```

- [ ] **Step 3: Scratch-verify**

Overwrite `scripts/_scratch.ts`:

```ts
import { config } from 'dotenv'
config({ path: ['.env.local', '.env'] })
import assert from 'node:assert/strict'
import { db } from '#/core/db/client'
import { shoppingCategories, shoppingItems } from '#/modules/shopping/schema'
import { eq } from 'drizzle-orm'
import { createCategory, renameCategory } from '#/modules/shopping/repo'

async function main() {
  const [any] = await db
    .select({ householdId: shoppingItems.householdId })
    .from(shoppingItems)
    .limit(1)
  assert(any, 'need an existing shopping item to borrow a householdId')
  const { householdId } = any

  const a = await createCategory(householdId, '  _scratch cat  ')
  const b = await createCategory(householdId, '_scratch cat')
  assert.equal(a.id, b.id, 'create is idempotent on exact trimmed name')

  await renameCategory(householdId, a.id, '_scratch renamed')
  const [row] = await db
    .select()
    .from(shoppingCategories)
    .where(eq(shoppingCategories.id, a.id))
  assert.equal(row.name, '_scratch renamed', 'rename applied')

  const c = await createCategory(householdId, '_scratch other')
  await assert.rejects(
    () => renameCategory(householdId, c.id, '_scratch renamed'),
    /already exists/,
  )

  await db.delete(shoppingCategories).where(eq(shoppingCategories.id, a.id))
  await db.delete(shoppingCategories).where(eq(shoppingCategories.id, c.id))
  console.log('PASS')
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
```

Run: `npx tsx scripts/_scratch.ts`
Expected: prints `PASS`.

- [ ] **Step 4: Full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check && npx vitest run`
Expected: all pass. (`getOrCreateCategory` was only called by `addItem`/`updateItem`; those still reference it — see Task 7. If `tsc` fails on `addItem`/`updateItem` referencing the deleted `getOrCreateCategory`, do Task 7 in the same commit as Task 6. Recommended: merge Task 6 + Task 7 into one commit.)

- [ ] **Step 5: Commit (combined with Task 7 — see note)**

Proceed to Task 7 before committing.

---

## Task 7: `deleteCategory` densify; drop the category field from add/update item

**Files:**

- Modify: `src/modules/shopping/repo.ts`
- Modify: `src/modules/shopping/shopping.functions.ts`
- Scratch: `scripts/_scratch.ts`

**Interfaces:**

- Consumes: `createCategory` (Task 6).
- Produces:
  - `deleteCategory` now densifies the uncategorized bucket after the FK `set null`.
  - `AddItemInput` / `UpdateItemInput` lose `categoryName`.
  - `addItem` sets `sort` to the end of the uncategorized bucket; new items are always uncategorized.
  - `addItemInput` / `updateItemInput` zod schemas lose `categoryName`.

- [ ] **Step 1: Densify in `deleteCategory`**

Replace the body of `deleteCategory` with:

```ts
export async function deleteCategory(
  householdId: string,
  categoryId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(shoppingCategories)
      .where(
        householdScope(
          shoppingCategories,
          householdId,
          eq(shoppingCategories.id, categoryId),
        ),
      )
    // The FK's `onDelete: 'set null'` has, within this transaction, moved
    // the category's items to the uncategorized bucket. They keep their old
    // per-category `sort`, which can now collide — renumber the bucket.
    // v1 has one list per household, so household scope is enough here.
    const rows = await tx
      .select({ id: shoppingItems.id })
      .from(shoppingItems)
      .where(
        householdScope(
          shoppingItems,
          householdId,
          and(
            isNull(shoppingItems.categoryId),
            eq(shoppingItems.isChecked, false),
          ),
        ),
      )
      .orderBy(asc(shoppingItems.sort), asc(shoppingItems.createdAt))
    for (const [index, row] of rows.entries()) {
      await tx
        .update(shoppingItems)
        .set({ sort: index })
        .where(
          householdScope(
            shoppingItems,
            householdId,
            eq(shoppingItems.id, row.id),
          ),
        )
    }
  })
}
```

- [ ] **Step 2: Drop `categoryName` from `AddItemInput` and set `sort`**

In `repo.ts`, change `AddItemInput`:

```ts
export interface AddItemInput {
  householdId: string
  listId: string
  name: string
  quantity?: number
  unit?: string
  note?: string
  priority?: ItemPriority
  addedBy: string
}
```

Replace `addItem`'s body with:

```ts
export async function addItem(input: AddItemInput): Promise<string> {
  return createItemRecord(
    input.householdId,
    'shopping_item',
    async (tx, id) => {
      const [maxRow] = await tx
        .select({
          max: sql<number>`coalesce(max(${shoppingItems.sort}), -1)`,
        })
        .from(shoppingItems)
        .where(
          householdScope(
            shoppingItems,
            input.householdId,
            and(
              eq(shoppingItems.listId, input.listId),
              isNull(shoppingItems.categoryId),
              eq(shoppingItems.isChecked, false),
            ),
          ),
        )
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
          categoryId: null,
          priority: input.priority ?? null,
          sort: (maxRow?.max ?? -1) + 1,
          addedBy: input.addedBy,
        })
        .returning({ id: shoppingItems.id })
      if (!row) throw new Error('Insert did not return a row')
      return row.id
    },
  )
}
```

- [ ] **Step 3: Drop `categoryName` from `UpdateItemInput` and `updateItem`**

```ts
export interface UpdateItemInput {
  householdId: string
  itemId: string
  name: string
  quantity?: number
  unit?: string
  note?: string
  priority?: ItemPriority
}

export async function updateItem(input: UpdateItemInput): Promise<void> {
  await db
    .update(shoppingItems)
    .set({
      name: input.name.trim(),
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      note: input.note ?? null,
      priority: input.priority ?? null,
    })
    .where(
      householdScope(
        shoppingItems,
        input.householdId,
        eq(shoppingItems.id, input.itemId),
      ),
    )
}
```

- [ ] **Step 4: Update the zod schemas in `shopping.functions.ts`**

In `addItemInput` and `updateItemInput`, delete the line:

```ts
  categoryName: z.string().min(1).max(100).optional(),
```

The handlers already spread `...data`; with `categoryName` gone from the schema it is gone from `data`, and `addItem`/`updateItem` no longer accept it. No handler-body change needed.

- [ ] **Step 5: Scratch-verify the densify**

Overwrite `scripts/_scratch.ts`:

```ts
import { config } from 'dotenv'
config({ path: ['.env.local', '.env'] })
import assert from 'node:assert/strict'
import { db } from '#/core/db/client'
import { shoppingCategories, shoppingItems } from '#/modules/shopping/schema'
import { items } from '#/core/items/schema'
import { eq } from 'drizzle-orm'
import { deleteCategory } from '#/modules/shopping/repo'

async function main() {
  const [any] = await db
    .select({
      householdId: shoppingItems.householdId,
      listId: shoppingItems.listId,
    })
    .from(shoppingItems)
    .limit(1)
  assert(any)
  const { householdId, listId } = any
  const [cat] = await db
    .insert(shoppingCategories)
    .values({ householdId, name: '_scratch del', sort: 950 })
    .returning()
  const mk = async (name: string, categoryId: string | null, sort: number) => {
    const [it] = await db
      .insert(items)
      .values({ householdId, itemType: 'shopping_item' })
      .returning()
    await db
      .insert(shoppingItems)
      .values({ id: it.id, householdId, listId, name, categoryId, sort })
    return it.id
  }
  const u0 = await mk('_s_u0', null, 0)
  const c0 = await mk('_s_c0', cat.id, 0)
  const c1 = await mk('_s_c1', cat.id, 1)

  await deleteCategory(householdId, cat.id)

  const read = async (id: string) =>
    (await db.select().from(shoppingItems).where(eq(shoppingItems.id, id)))[0]
  const sorts = [await read(u0), await read(c0), await read(c1)]
    .map((r) => r.sort)
    .sort((a, b) => a - b)
  assert.deepEqual(
    sorts,
    [0, 1, 2],
    'uncategorized bucket is 0,1,2 with no collision',
  )
  for (const r of [u0, c0, c1])
    assert.equal((await read(r)).categoryId, null, 'all now uncategorized')

  for (const id of [u0, c0, c1]) await db.delete(items).where(eq(items.id, id))
  console.log('PASS')
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
```

Run: `npx tsx scripts/_scratch.ts`
Expected: prints `PASS`.

- [ ] **Step 6: Full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check && npx vitest run`
Expected: all pass. (`shopping.tsx`'s `ItemEditForm` / `NewItemForm` still send `categoryName` — `tsc` will flag the `updateItemAction` / `addItemAction` call. Fix in this commit: in `shopping.tsx`, delete the `categoryName: categoryName || undefined,` line from both `handleSubmit` payloads, and delete the whole `<Field label="Category">…</Field>` block plus the `categoryName` / `categoryListId` / `currentCategoryName` state and props from both `ItemEditForm` and `NewItemForm`. Also drop `currentCategoryName` from the `<ItemEditForm>` call site in Task 15's sheet — for now delete it from the existing call site.)

- [ ] **Step 7: Commit (Tasks 6 + 7 together)**

```bash
git add src/modules/shopping/ src/routes/shopping.tsx
git commit -m "feat: category create/rename actions; items no longer pick a category on create"
```

---

## Task 8: `IconRail` — optional drag-handle slot

**Files:**

- Modify: `src/core/ui/IconRail.tsx`

**Interfaces:**

- Produces: `IconRailAction` gains `handleProps?: ComponentProps<'button'>` and `onClick` becomes optional. When `handleProps` is set, its props are spread onto that slot's `<button>` before the fixed props, and its `className` is appended to (not replaced by) the base cell styles.

- [ ] **Step 1: Update the interface and the render**

Replace the file contents of `src/core/ui/IconRail.tsx` with:

```tsx
import type { ComponentProps, ReactNode } from 'react'

export interface IconRailAction {
  key: string
  icon: ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
  /** A small count badge over the icon's corner — the reminder bell (§2.1). */
  badge?: number
  /**
   * When set, these props are spread onto the slot's <button>, ahead of
   * the fixed props — used to make one slot a @dnd-kit sortable activator
   * (ref + drag listeners) rather than a click action. A `className` here
   * is appended to the base cell styles, not replaced.
   */
  handleProps?: ComponentProps<'button'>
}

/**
 * The action-icon row that replaced `FlipCard`'s back-face text links
 * (§2.1). Every button is a full 44px-tall touch target, icon-only, with a
 * hairline divider between neighbors — no background until pressed or
 * hovered, so the row reads as part of the card face rather than a
 * separate toolbar. One slot may be a drag handle via `handleProps`.
 */
export function IconRail({ actions }: { actions: IconRailAction[] }) {
  return (
    <div className="mt-1 flex items-stretch border-t border-line">
      {actions.map((action, i) => {
        const base = `flex h-11 flex-1 items-center justify-center text-ink-dim transition-colors hover:bg-inset hover:text-ink active:bg-inset disabled:opacity-40 ${
          i > 0 ? 'border-l border-line' : ''
        }`
        const { className: handleClass, ...handleRest } =
          action.handleProps ?? {}
        return (
          <button
            key={action.key}
            {...handleRest}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            aria-label={action.label}
            title={action.label}
            className={handleClass ? `${base} ${handleClass}` : base}
          >
            <span className="relative inline-flex">
              {action.icon}
              {action.badge != null && action.badge > 0 && (
                <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-[3px] text-[10px] leading-none font-semibold text-card">
                  {action.badge > 9 ? '9+' : action.badge}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check && npx vitest run`
Expected: all pass. `chores.tsx` and `shopping.tsx` still compile — every existing `IconRailAction` passes `onClick`, which is still accepted.

- [ ] **Step 3: Commit**

```bash
git add src/core/ui/IconRail.tsx
git commit -m "feat: IconRail can host a drag-handle slot"
```

---

## Task 9: `shopping.tsx` — extract `ShoppingList`, render from `board` state

No drag yet. This task swaps the inline grouping for `board`-driven rendering so the DnD wiring in Task 10–12 has a stable base.

**Files:**

- Modify: `src/routes/shopping.tsx`

**Interfaces:**

- Consumes: `buildBoard`, `Board`, `UNCATEGORIZED`, `bucketKeyToCategoryId` from `#/modules/shopping/board`.
- Produces: a `ShoppingList` component that renders the grouped list from a `board` state; `ShoppingPage` passes it `categories`, `visibleItems`, `memberName`, the item-sheet openers, and `refresh`.

- [ ] **Step 1: Add the board import**

At the top of `shopping.tsx`, add:

```ts
import {
  UNCATEGORIZED,
  bucketKeyToCategoryId,
  buildBoard,
} from '#/modules/shopping/board'
import type { Board } from '#/modules/shopping/board'
```

- [ ] **Step 2: Compute the visible item set in `ShoppingPage`**

`ShoppingPage` already builds `pendingDeleteIds`. Just below `checkedItems`, add:

```ts
const visibleItems = data.items.filter(
  (i) => !i.isChecked && !pendingDeleteIds.has(i.id),
)
const itemsById = new Map(data.items.map((i) => [i.id, i]))
```

- [ ] **Step 3: Add the `ShoppingList` component**

Add this above `ItemCard` (it will grow in later tasks):

```tsx
function ShoppingList({
  categories,
  items,
  hiddenIds,
  itemsById,
  memberName,
  onEdit,
  onRemind,
  onSetPriority,
  onMove,
  onRequestDelete,
  onChange,
}: {
  categories: CategoryView[]
  items: ItemView[]
  hiddenIds: ReadonlySet<string>
  itemsById: Map<string, ItemView>
  memberName: Map<string, string>
  onEdit: (id: string) => void
  onRemind: (id: string) => void
  onSetPriority: (id: string) => void
  onMove: (id: string) => void
  onRequestDelete: (id: string, name: string) => void
  onChange: () => Promise<void>
}) {
  const [board, setBoard] = useState<Board>(() =>
    buildBoard({ categories, items }, hiddenIds),
  )

  useEffect(() => {
    setBoard(buildBoard({ categories, items }, hiddenIds))
  }, [categories, items, hiddenIds])

  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const orderedKeys = [
    ...board.categoryOrder,
    ...(board.itemsByBucket[UNCATEGORIZED]?.length ? [UNCATEGORIZED] : []),
  ]

  if (orderedKeys.length === 0) {
    return (
      <p className="mt-8 text-ink-dim">
        The list is empty — add something above.
      </p>
    )
  }

  return (
    <div className="mt-8 flex flex-col gap-10">
      {orderedKeys.map((key) => {
        const category = key === UNCATEGORIZED ? null : categoryById.get(key)
        const itemIds = board.itemsByBucket[key] ?? []
        return (
          <section key={key}>
            <h2 className="text-xs font-semibold tracking-wide text-ink-dim uppercase">
              {category ? category.name : 'Uncategorized'}
            </h2>
            <div className="mt-3 flex flex-col gap-4">
              {itemIds.map((id) => {
                const item = itemsById.get(id)
                if (!item) return null
                return (
                  <ItemCard
                    key={id}
                    item={item}
                    memberName={memberName}
                    onChange={onChange}
                    onRequestDelete={() => onRequestDelete(item.id, item.name)}
                    onEdit={() => onEdit(item.id)}
                    onRemind={() => onRemind(item.id)}
                    onSetPriority={() => onSetPriority(item.id)}
                    onMove={() => onMove(item.id)}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
```

Note: this drops the `sm:grid-cols-2` grid and the per-card `.rise` wrapper. A single column is required for a linear sortable order; `.rise`'s transform animation conflicts with `@dnd-kit`'s transform. Both are intentional and go in DESIGN.md (Task 17).

- [ ] **Step 4: Give `ItemCard` an `onMove` prop (unused this task)**

In `ItemCard`'s props type add `onMove: () => void` and destructure it. Do not wire it yet (Task 15).

- [ ] **Step 5: Replace the inline list in `ShoppingPage`'s JSX**

Delete the `{orderedGroups.length === 0 ? (...) : (...)}` block (the `<section>`/`grid`/`.rise`/`ItemCard` markup) **and** the now-unused `grouped` / `orderedGroups` / `itemCountByCategory` computations above the `return`. Replace the deleted JSX with:

```tsx
<ShoppingList
  categories={data.categories}
  items={visibleItems}
  hiddenIds={pendingDeleteIds}
  itemsById={itemsById}
  memberName={memberName}
  onEdit={(id) => setItemSheet({ kind: 'edit', id })}
  onRemind={(id) => setItemSheet({ kind: 'reminders', id })}
  onSetPriority={(id) => setItemSheet({ kind: 'priority', id })}
  onMove={(id) => setItemSheet({ kind: 'move', id })}
  onRequestDelete={requestDeleteItem}
  onChange={refresh}
/>
```

`setItemSheet({ kind: 'move', ... })` needs the union widened — in the `useState` for `itemSheet`, change the kind union to `'edit' | 'reminders' | 'priority' | 'move'`. The `'move'` sheet itself is Task 15; an unmatched kind just renders no sheet, which is fine for now.

- [ ] **Step 6: `CategoryOrder` still renders — leave it**

`<CategoryOrder>` stays in the JSX for this task (Task 10 deletes it). `itemCountByCategory` was deleted in Step 5, so change the `<CategoryOrder>` call to pass a fresh count map inline:

```tsx
<CategoryOrder
  categories={data.categories}
  itemCounts={
    new Map(
      data.categories.map((c) => [
        c.id,
        visibleItems.filter((i) => i.categoryId === c.id).length,
      ]),
    )
  }
  onChange={refresh}
/>
```

- [ ] **Step 7: Full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check && npx vitest run`
Expected: all pass.

- [ ] **Step 8: Manual check**

Run: `npm run dev`, then load `/shopping` while signed in (see Task 18 for the auth curl recipe, or use a browser session). Expected: the list shows the same items grouped by category, now one column, no entrance animation on the cards. "Category order" section still present. Add/edit/reminders/priority still open. Kill the dev server.

- [ ] **Step 9: Commit**

```bash
git add src/routes/shopping.tsx
git commit -m "refactor: render the shopping list from a board state module"
```

---

## Task 10: `shopping.tsx` — `DndContext` + category-header reorder; delete `CategoryOrder`

**Files:**

- Modify: `src/routes/shopping.tsx`

**Interfaces:**

- Consumes: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`; `reorderCategoriesAction`.
- Produces: `ShoppingList` wraps its groups in one `<DndContext>` + a category `<SortableContext>`; a `CategoryGroup` component whose header grip reorders categories. `CategoryOrder` and its constant are deleted.

- [ ] **Step 1: Add the dnd-kit imports**

```ts
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
```

- [ ] **Step 2: Add the sensors and category drag to `ShoppingList`**

Inside `ShoppingList`, after the `board` state and effect:

```ts
const [activeId, setActiveId] = useState<string | null>(null)
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 8 },
  }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
)

function persistCategoryOrder(orderedIds: string[]) {
  void reorderCategoriesAction({ data: { orderedIds } }).then(() => onChange())
}

function onDragStart(e: DragStartEvent) {
  setActiveId(String(e.active.id))
}

function onDragEnd(e: DragEndEvent) {
  setActiveId(null)
  const { active, over } = e
  if (!over || active.data.current?.type !== 'category') return
  const from = board.categoryOrder.indexOf(String(active.id))
  const to = board.categoryOrder.indexOf(String(over.id))
  if (from === -1 || to === -1 || from === to) return
  const next = arrayMove(board.categoryOrder, from, to)
  setBoard((b) => ({ ...b, categoryOrder: next }))
  persistCategoryOrder(next)
}
```

- [ ] **Step 3: Wrap the groups in `DndContext` + `SortableContext`**

Change `ShoppingList`'s return to:

```tsx
return (
  <DndContext
    sensors={sensors}
    collisionDetection={closestCorners}
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
  >
    <div className="mt-8 flex flex-col gap-10">
      <SortableContext
        items={board.categoryOrder}
        strategy={verticalListSortingStrategy}
      >
        {orderedKeys.map((key) => {
          const category = key === UNCATEGORIZED ? null : categoryById.get(key)
          return (
            <CategoryGroup
              key={key}
              bucketKey={key}
              category={category ?? null}
              itemIds={board.itemsByBucket[key] ?? []}
              itemsById={itemsById}
              memberName={memberName}
              onEdit={onEdit}
              onRemind={onRemind}
              onSetPriority={onSetPriority}
              onMove={onMove}
              onRequestDelete={onRequestDelete}
              onChange={onChange}
            />
          )
        })}
      </SortableContext>
    </div>
    <DragOverlay>{null}</DragOverlay>
  </DndContext>
)
```

(The empty-list early return stays above this. `DragOverlay` content comes in Task 12.)

- [ ] **Step 4: Add `CategoryGroup`**

```tsx
function CategoryGroup({
  bucketKey,
  category,
  itemIds,
  itemsById,
  memberName,
  onEdit,
  onRemind,
  onSetPriority,
  onMove,
  onRequestDelete,
  onChange,
}: {
  bucketKey: string
  category: CategoryView | null
  itemIds: string[]
  itemsById: Map<string, ItemView>
  memberName: Map<string, string>
  onEdit: (id: string) => void
  onRemind: (id: string) => void
  onSetPriority: (id: string) => void
  onMove: (id: string) => void
  onRequestDelete: (id: string, name: string) => void
  onChange: () => Promise<void>
}) {
  const sortable = useSortable({
    id: category ? category.id : bucketKey,
    data: { type: 'category' },
    disabled: category == null,
  })

  return (
    <section
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={sortable.isDragging ? 'relative z-10' : undefined}
    >
      <header className="flex items-center gap-2">
        {category && (
          <button
            type="button"
            ref={sortable.setActivatorNodeRef}
            {...sortable.attributes}
            {...sortable.listeners}
            aria-label={`Reorder ${category.name}`}
            className="-ml-1 flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-ink-ghost"
          >
            <GripIcon className="h-4 w-4" />
          </button>
        )}
        <h2 className="flex-1 text-xs font-semibold tracking-wide text-ink-dim uppercase">
          {category ? category.name : 'Uncategorized'}
        </h2>
        <span className="text-xs text-ink-dim">{itemIds.length}</span>
        {category && (
          <button
            type="button"
            aria-label={`Delete ${category.name}`}
            onClick={async () => {
              await deleteCategoryAction({ data: { categoryId: category.id } })
              await onChange()
            }}
            className="shrink-0 text-ink-dim"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </header>
      <div className="mt-3 flex flex-col gap-4">
        {itemIds.map((id) => {
          const item = itemsById.get(id)
          if (!item) return null
          return (
            <ItemCard
              key={id}
              item={item}
              memberName={memberName}
              onChange={onChange}
              onRequestDelete={() => onRequestDelete(item.id, item.name)}
              onEdit={() => onEdit(item.id)}
              onRemind={() => onRemind(item.id)}
              onSetPriority={() => onSetPriority(item.id)}
              onMove={() => onMove(item.id)}
            />
          )
        })}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Delete the old inline group render from `ShoppingList`**

Remove the `orderedKeys.map(...)` block that still renders raw `<section>`s from Task 9 Step 3 (it is replaced by the `CategoryGroup` render in Step 3 of this task). Keep the empty-list early return.

- [ ] **Step 6: Delete `CategoryOrder`**

Remove the entire `CategoryOrder` function, the `CATEGORY_ROW_HEIGHT` constant, and the `<CategoryOrder .../>` element from `ShoppingPage`'s JSX. `deleteCategoryAction` is now called from `CategoryGroup` instead. `reorderCategoryAction` is already gone (Task 5). `GripIcon` / `TrashIcon` stay imported (used by `CategoryGroup`).

- [ ] **Step 7: Full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check && npx vitest run`
Expected: all pass.

- [ ] **Step 8: Manual check**

Run `npm run dev`, load `/shopping` signed in. Drag a category header by its grip — the categories reorder and the order survives a reload. Keyboard: Tab to a grip, Space, Arrow Down, Space — same result. Kill the dev server.

- [ ] **Step 9: Commit**

```bash
git add src/routes/shopping.tsx
git commit -m "feat: reorder shopping categories by dragging their headers"
```

---

## Task 11: `shopping.tsx` — drag items within and across categories

**Files:**

- Modify: `src/routes/shopping.tsx`

**Interfaces:**

- Consumes: `placeItem`, `moveItemAction`, `useDroppable` (`@dnd-kit/core`).
- Produces: `ItemCard` is a `useSortable`; each `CategoryGroup`'s item list is a droppable; `ShoppingList` gains `onDragOver` and item handling in `onDragEnd`.

- [ ] **Step 1: Add `useDroppable` and `placeItem` imports**

Add `useDroppable` to the `@dnd-kit/core` import. Add to the board import:

```ts
import {
  UNCATEGORIZED,
  bucketKeyToCategoryId,
  buildBoard,
  placeItem,
} from '#/modules/shopping/board'
```

- [ ] **Step 2: Make `ItemCard` sortable**

At the top of `ItemCard`, add:

```ts
const sortable = useSortable({
  id: item.id,
  data: { type: 'item', bucketKey },
})
```

`ItemCard`'s props type gains `bucketKey: string`. Wrap the returned `<ActionCard>` in a positioning div:

```tsx
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.4 : undefined,
      }}
    >
      <ActionCard ...>
        ...
        <IconRail
          actions={[
            {
              key: 'drag',
              icon: <GripIcon className="h-[18px] w-[18px]" />,
              label: 'Reorder item',
              handleProps: {
                ref: sortable.setActivatorNodeRef,
                ...sortable.attributes,
                ...sortable.listeners,
                className: 'cursor-grab touch-none',
              },
            },
            {
              key: 'remind',
              icon: <BellIcon className="h-[18px] w-[18px]" />,
              label: 'Item reminders',
              onClick: onRemind,
              badge: item.reminders.length,
            },
            {
              key: 'priority',
              icon: (
                <FlagIcon
                  className={`h-[18px] w-[18px] ${item.priority ? PRIORITY_TEXT_CLASS[item.priority] : ''}`}
                  filled={item.priority != null}
                />
              ),
              label: item.priority
                ? `Priority: ${item.priority}`
                : 'Set priority',
              onClick: onSetPriority,
            },
            {
              key: 'move',
              icon: <FolderIcon className="h-[18px] w-[18px]" />,
              label: 'Move to category',
              onClick: onMove,
            },
            {
              key: 'edit',
              icon: <EditIcon className="h-[18px] w-[18px]" />,
              label: 'Edit item',
              onClick: onEdit,
            },
            {
              key: 'delete',
              icon: <TrashIcon className="h-[18px] w-[18px]" />,
              label: 'Delete item',
              onClick: onRequestDelete,
            },
          ]}
        />
      </ActionCard>
    </div>
  )
```

`FolderIcon` is added in Task 15 Step 1 — for this task import it there or add the icon now. Add `FolderIcon` to `src/core/ui/icons.tsx` now (see Task 15 Step 1 code) and import it in `shopping.tsx` to keep this task self-contained.

- [ ] **Step 3: Wrap each `CategoryGroup` item list in a droppable + per-bucket `SortableContext`**

In `CategoryGroup`, add:

```ts
const droppable = useDroppable({
  id: bucketKey,
  data: { type: 'bucket', bucketKey },
})
```

Change the item-list `<div>` to:

```tsx
<SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
  <div
    ref={droppable.setNodeRef}
    className="mt-3 flex min-h-[44px] flex-col gap-4"
  >
    {itemIds.length === 0 ? (
      <p className="rounded-card border border-dashed border-line px-4 py-3 text-sm text-ink-dim">
        Drag items here
      </p>
    ) : (
      itemIds.map((id) => {
        const item = itemsById.get(id)
        if (!item) return null
        return (
          <ItemCard
            key={id}
            item={item}
            bucketKey={bucketKey}
            memberName={memberName}
            onChange={onChange}
            onRequestDelete={() => onRequestDelete(item.id, item.name)}
            onEdit={() => onEdit(item.id)}
            onRemind={() => onRemind(item.id)}
            onSetPriority={() => onSetPriority(item.id)}
            onMove={() => onMove(item.id)}
          />
        )
      })
    )}
  </div>
</SortableContext>
```

Note the `id: bucketKey` on the droppable. The category sortable uses `id: category.id` (a real uuid) or, for uncategorized, `id: bucketKey` = `'__uncat__'` but with `disabled: true`. To avoid a duplicate id between the uncategorized category-sortable and its bucket-droppable, give the uncategorized `CategoryGroup` no `useSortable` at all when `category == null`. Change `CategoryGroup`'s `useSortable` call to be conditional is not allowed by hook rules — instead keep `useSortable` but give it a distinct id: for the category role use `` `cat:${category?.id ?? bucketKey}` ``. Then in `onDragEnd` category branch, strip the `cat:` prefix. Simpler final rule, applied everywhere:

- category sortable id = `` `cat:${category!.id}` `` (only rendered/active when `category != null`)
- item sortable id = the raw item id
- bucket droppable id = the raw bucket key
  Update Step 2 of Task 10 (`onDragEnd`) and the `SortableContext items` for categories to use `board.categoryOrder.map((id) => 'cat:' + id)` and map back with `String(active.id).slice(4)`.

- [ ] **Step 4: Add `onDragOver` and item handling in `onDragEnd`**

Add to `ShoppingList`:

```ts
function bucketOf(id: string): string | null {
  for (const [key, ids] of Object.entries(board.itemsByBucket)) {
    if (ids.includes(id)) return key
  }
  return null
}

function resolveOverBucket(overId: string, overData: unknown): string | null {
  const data = overData as { type?: string; bucketKey?: string } | undefined
  if (data?.type === 'bucket' && data.bucketKey) return data.bucketKey
  if (data?.type === 'item') return bucketOf(overId)
  if (board.itemsByBucket[overId]) return overId
  return null
}

function onDragOver(e: DragOverEvent) {
  const { active, over } = e
  if (!over || active.data.current?.type !== 'item') return
  const activeBucket = String(active.data.current.bucketKey)
  const overBucket = resolveOverBucket(String(over.id), over.data.current)
  if (!overBucket || overBucket === activeBucket) return
  setBoard((b) => {
    const overIds = b.itemsByBucket[overBucket] ?? []
    const overIndex =
      (over.data.current as { type?: string })?.type === 'item'
        ? overIds.indexOf(String(over.id))
        : overIds.length
    return placeItem(
      b,
      String(active.id),
      overBucket,
      overIndex < 0 ? overIds.length : overIndex,
    )
  })
  if (active.data.current) active.data.current.bucketKey = overBucket
}
```

Extend `onDragEnd` — replace its body with:

```ts
function onDragEnd(e: DragEndEvent) {
  setActiveId(null)
  const { active, over } = e
  if (!over) return

  if (active.data.current?.type === 'category') {
    const from = board.categoryOrder.indexOf(String(active.id).slice(4))
    const to = board.categoryOrder.indexOf(String(over.id).slice(4))
    if (from === -1 || to === -1 || from === to) return
    const next = arrayMove(board.categoryOrder, from, to)
    setBoard((b) => ({ ...b, categoryOrder: next }))
    persistCategoryOrder(next)
    return
  }

  if (active.data.current?.type === 'item') {
    const bucket = resolveOverBucket(String(over.id), over.data.current)
    if (!bucket) return
    const ids = board.itemsByBucket[bucket] ?? []
    const currentIndex = ids.indexOf(String(active.id))
    let targetIndex =
      (over.data.current as { type?: string })?.type === 'item'
        ? ids.indexOf(String(over.id))
        : ids.length
    if (targetIndex < 0) targetIndex = ids.length
    const next = placeItem(board, String(active.id), bucket, targetIndex)
    setBoard(next)
    const orderedItemIds = next.itemsByBucket[bucket]
    void moveItemAction({
      data: {
        itemId: String(active.id),
        categoryId: bucketKeyToCategoryId(bucket),
        orderedItemIds,
      },
    }).then(() => onChange())
    if (currentIndex === -1) return
  }
}
```

Wire `onDragOver={onDragOver}` on the `<DndContext>`.

- [ ] **Step 5: Full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check && npx vitest run`
Expected: all pass.

- [ ] **Step 6: Manual check**

Run `npm run dev`, `/shopping` signed in. Drag an item by its rail grip within a category — order changes and survives reload. Drag it onto another category's items or its "Drag items here" zone — it re-files and survives reload. Kill the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/routes/shopping.tsx src/core/ui/icons.tsx
git commit -m "feat: drag shopping items to reorder and re-file into categories"
```

---

## Task 12: `shopping.tsx` — drag feedback + offline-honest save

**Files:**

- Modify: `src/routes/shopping.tsx`

**Interfaces:**

- Consumes: `useHouseholdMutation`, `MutationStatus`.
- Produces: a `<DragOverlay>` preview, a drop-target highlight, and drag persistence wrapped in `useHouseholdMutation` with a list-level `<MutationStatus>`.

- [ ] **Step 1: Wrap persistence in `useHouseholdMutation`**

In `ShoppingList`, add near the top:

```ts
const { status, error, run } = useHouseholdMutation()
```

Replace the two `void ...Action(...).then(() => onChange())` calls with:

```ts
function persistCategoryOrder(orderedIds: string[]) {
  void run(() => reorderCategoriesAction({ data: { orderedIds } })).finally(
    () => void onChange(),
  )
}
```

and, in `onDragEnd`'s item branch:

```ts
void run(() =>
  moveItemAction({
    data: {
      itemId: String(active.id),
      categoryId: bucketKeyToCategoryId(bucket),
      orderedItemIds,
    },
  }),
).finally(() => void onChange())
```

`onChange()` (`router.invalidate`) always runs, so a failed save snaps the board back to server truth via the `useEffect`.

- [ ] **Step 2: Render `<MutationStatus>` at the list level**

Just inside the outer `<div className="mt-8 ...">`, above the `<SortableContext>`:

```tsx
<MutationStatus status={status} error={error} />
```

- [ ] **Step 3: `<DragOverlay>` preview**

Add to `ShoppingList`:

```ts
const activeItem = activeId ? itemsById.get(activeId) : undefined
const activeCategory =
  activeId?.startsWith('cat:') && categoryById.get(activeId.slice(4))
```

Replace `<DragOverlay>{null}</DragOverlay>` with:

```tsx
<DragOverlay>
  {activeItem ? (
    <div className="rounded-card bg-card p-5 shadow-lifted">
      <span className="text-lg text-ink">{activeItem.name}</span>
    </div>
  ) : activeCategory ? (
    <div className="rounded-control bg-card px-3 py-2 text-xs font-semibold tracking-wide text-ink-dim uppercase shadow-lifted">
      {activeCategory.name}
    </div>
  ) : null}
</DragOverlay>
```

- [ ] **Step 4: Drop-target highlight**

In `CategoryGroup`, use `droppable.isOver`:

```tsx
        <div
          ref={droppable.setNodeRef}
          className={`mt-3 flex min-h-[44px] flex-col gap-4 rounded-card transition-colors ${
            droppable.isOver ? 'bg-accent-tint ring-1 ring-accent' : ''
          }`}
        >
```

- [ ] **Step 5: Full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check && npx vitest run`
Expected: all pass.

- [ ] **Step 6: Manual check**

Run `npm run dev`, `/shopping` signed in. During a drag: the source card fades, a lifted preview follows the cursor, the hovered bucket tints. Turn off the network in devtools and drag an item — `not saved — retrying…` shows; restore the network and it saves. Kill the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/routes/shopping.tsx
git commit -m "feat: drag preview, drop highlight, offline-honest save for shopping DnD"
```

---

## Task 13: `shopping.tsx` — "+ New category" inline input

**Files:**

- Modify: `src/routes/shopping.tsx`

**Interfaces:**

- Consumes: `createCategoryAction`.
- Produces: a `NewCategoryControl` component rendered after the last group.

- [ ] **Step 1: Add `NewCategoryControl`**

```tsx
function NewCategoryControl({
  onCreate,
}: {
  onCreate: (name: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex items-center gap-2 self-start text-sm text-ink-dim"
      >
        <PlusIcon className="h-3.5 w-3.5" />
        New category
      </button>
    )
  }

  async function submit() {
    const trimmed = name.trim()
    setName('')
    setOpen(false)
    if (!trimmed) return
    setBusy(true)
    try {
      await onCreate(trimmed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <input
        autoFocus
        className="field"
        value={name}
        disabled={busy}
        placeholder="Category name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setName('')
            setOpen(false)
          }
        }}
      />
      <button type="submit" className="btn-primary btn-compact" disabled={busy}>
        Add
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Render it in `ShoppingList`**

Immediately after the closing `</SortableContext>`, still inside the `<div className="mt-8 ...">`:

```tsx
<NewCategoryControl
  onCreate={async (name) => {
    await createCategoryAction({ data: { name } })
    await onChange()
  }}
/>
```

Move the empty-list early return so it does not hide `NewCategoryControl` — when `orderedKeys.length === 0`, still render the `DndContext` shell (or at minimum the control). Simplest: delete the early return; instead, when `orderedKeys.length === 0`, render a single line above the control:

```tsx
{
  orderedKeys.length === 0 && (
    <p className="text-ink-dim">The list is empty — add something above.</p>
  )
}
```

- [ ] **Step 3: Full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check && npx vitest run`
Expected: all pass.

- [ ] **Step 4: Manual check**

Run `npm run dev`, `/shopping` signed in. Click "New category", type a name, Enter — an empty category section appears with a "Drag items here" zone. Drag an item into it. Reload — it persists. Kill the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/routes/shopping.tsx
git commit -m "feat: create a shopping category inline from the list"
```

---

## Task 14: `shopping.tsx` — inline category rename

**Files:**

- Modify: `src/routes/shopping.tsx`

**Interfaces:**

- Consumes: `renameCategoryAction`.
- Produces: `CategoryGroup`'s header name is a button that becomes an input on tap.

- [ ] **Step 1: Add rename state to `CategoryGroup`**

```ts
const [renaming, setRenaming] = useState(false)
const [draft, setDraft] = useState(category?.name ?? '')

useEffect(() => {
  setDraft(category?.name ?? '')
}, [category?.name])

async function submitRename() {
  setRenaming(false)
  const trimmed = draft.trim()
  if (!category || !trimmed || trimmed === category.name) {
    setDraft(category?.name ?? '')
    return
  }
  try {
    await renameCategoryAction({
      data: { categoryId: category.id, name: trimmed },
    })
    await onChange()
  } catch {
    setDraft(category.name)
  }
}
```

- [ ] **Step 2: Swap the `<h2>` for a button/input**

Replace the header `<h2>` with:

```tsx
{
  renaming && category ? (
    <form
      className="flex-1"
      onSubmit={(e) => {
        e.preventDefault()
        void submitRename()
      }}
    >
      <input
        autoFocus
        className="field h-8 w-full py-0 text-sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void submitRename()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setRenaming(false)
            setDraft(category.name)
          }
        }}
      />
    </form>
  ) : (
    <button
      type="button"
      onClick={() => category && setRenaming(true)}
      disabled={!category}
      className="flex-1 text-left text-xs font-semibold tracking-wide text-ink-dim uppercase disabled:cursor-default"
    >
      {category ? category.name : 'Uncategorized'}
    </button>
  )
}
```

- [ ] **Step 3: Full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check && npx vitest run`
Expected: all pass.

- [ ] **Step 4: Manual check**

Run `npm run dev`, `/shopping` signed in. Tap a category name — it becomes an input. Change it, press Enter — the header updates and survives reload. Try renaming to an existing category's name — the input reverts (the action rejects). Escape cancels. Kill the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/routes/shopping.tsx
git commit -m "feat: rename a shopping category inline from its header"
```

---

## Task 15: `shopping.tsx` — "Move to…" sheet + `FolderIcon`

**Files:**

- Modify: `src/core/ui/icons.tsx`
- Modify: `src/routes/shopping.tsx`

**Interfaces:**

- Consumes: `moveItemAction`, the page-level `Sheet` host, `activeItem` lookup.
- Produces: `FolderIcon`; a `MoveToSheet` component; `itemSheet` kind `'move'` wired to a page-level `<Sheet>`.

- [ ] **Step 1: Add `FolderIcon` to `icons.tsx`**

Match the file's existing style (a `function` returning an `<svg>` with `stroke="currentColor"`, `strokeWidth={1.75}`, rounded caps, `fill="none"`, `viewBox="0 0 24 24"`). Add:

```tsx
export function FolderIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  )
}
```

(Confirm `IconProps` is the shared type at the top of `icons.tsx`; match whatever the existing icons use.)

- [ ] **Step 2: Add `MoveToSheet` to `shopping.tsx`**

```tsx
function MoveToSheet({
  categories,
  currentCategoryId,
  onSelect,
}: {
  categories: CategoryView[]
  currentCategoryId: string | null
  onSelect: (categoryId: string | null) => void
}) {
  const targets: { id: string | null; name: string }[] = [
    { id: null, name: 'Uncategorized' },
    ...categories.map((c) => ({ id: c.id, name: c.name })),
  ]
  return (
    <div className="flex flex-col gap-1.5">
      {targets.map((t) => {
        const selected = t.id === currentCategoryId
        return (
          <button
            key={t.id ?? '__uncat__'}
            type="button"
            onClick={() => onSelect(t.id)}
            className={`flex items-center gap-3 rounded-control px-[14px] py-[13px] text-left transition-colors ${
              selected ? 'bg-inset' : 'hover:bg-inset'
            }`}
          >
            <span className="flex-1 text-sm text-ink">{t.name}</span>
            {selected && <CheckIcon className="h-4 w-4 text-accent" />}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Add the page-level move handler + sheet in `ShoppingPage`**

Near `setItemPriority`, add:

```ts
async function moveItemToCategory(itemId: string, categoryId: string | null) {
  setItemSheet(null)
  const destIds = data.items
    .filter(
      (i) => !i.isChecked && i.categoryId === categoryId && i.id !== itemId,
    )
    .map((i) => i.id)
  await moveItemAction({
    data: { itemId, categoryId, orderedItemIds: [...destIds, itemId] },
  })
  await refresh()
}
```

Add the sheet next to the priority sheet:

```tsx
<Sheet
  open={itemSheet?.kind === 'move' && activeItem != null}
  onClose={() => setItemSheet(null)}
  title="Move to category"
>
  {activeItem && (
    <MoveToSheet
      categories={data.categories}
      currentCategoryId={activeItem.categoryId}
      onSelect={(categoryId) => moveItemToCategory(activeItem.id, categoryId)}
    />
  )}
</Sheet>
```

Import `moveItemAction` in `shopping.tsx`'s `shopping.functions` import block (if not already there from Task 11).

- [ ] **Step 4: Full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check && npx vitest run`
Expected: all pass.

- [ ] **Step 5: Manual check**

Run `npm run dev`, `/shopping` signed in. On a card, tap the folder icon — a sheet lists every category + Uncategorized with the current one checked. Tap another — the sheet closes and the item moves there, at the end. Survives reload. Kill the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/core/ui/icons.tsx src/routes/shopping.tsx
git commit -m "feat: 'Move to category' sheet as the non-pointer path"
```

---

## Task 16: `shopping.tsx` — empty categories and the uncategorized bucket

Most of this is already in place from Tasks 10–13 (empty categories render with a "Drag items here" zone; `NewCategoryControl` exists). This task tightens the uncategorized visibility rule and confirms the flat-list fallback.

**Files:**

- Modify: `src/routes/shopping.tsx`

**Interfaces:**

- Produces: uncategorized shows whenever a category exists; with zero categories the list is a flat, headerless item list.

- [ ] **Step 1: Uncategorized visibility rule**

In `ShoppingList`, replace `orderedKeys` with:

```ts
const hasCategories = board.categoryOrder.length > 0
const uncatCount = board.itemsByBucket[UNCATEGORIZED]?.length ?? 0
const showUncat = hasCategories || uncatCount > 0
const orderedKeys = [
  ...board.categoryOrder,
  ...(showUncat ? [UNCATEGORIZED] : []),
]
```

- [ ] **Step 2: Flat list when there are no categories**

In `CategoryGroup`, when `category == null` **and** `hasCategories` is false, render no header at all. Pass `hasCategories` into `CategoryGroup` and guard the header:

```tsx
{
  ;(category || hasCategories) && (
    <header className="flex items-center gap-2">...</header>
  )
}
```

For the `category == null && !hasCategories` case the header is fully suppressed and the item list renders as a bare column — the pre-DnD look for a household that never made a category.

- [ ] **Step 3: Full check suite**

Run: `npx tsc --noEmit && npx eslint . && npm run check && npx vitest run`
Expected: all pass.

- [ ] **Step 4: Manual check**

Run `npm run dev`. With categories present: an empty "Uncategorized" still shows as a drop target. Delete every category (via the header trash): the list collapses to a flat headerless column. Recreate one: headers return. Kill the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/routes/shopping.tsx
git commit -m "feat: keep uncategorized visible as a drop target; flat list with no categories"
```

---

## Task 17: DESIGN.md

**Files:**

- Modify: `DESIGN.md`

- [ ] **Step 1: Rewrite "Reorderable Lists"**

Replace the "### Reorderable Lists" section body with:

```markdown
Shopping categories and their items reorder by drag, built on `@dnd-kit`
(`@dnd-kit/core` + `/sortable` + `/utilities` — the project's first drag
library). One `<DndContext>` on the shopping route holds a sortable list of
category headers and, per category, a sortable list of item cards; an item
drags within its category to reorder or onto another header to re-file.

Every draggable carries a grip handle (`GripIcon`, `ink-ghost` — glyph-only
per The Ghost Rule). On an item card the grip is the first `IconRail` slot;
on a category it sits at the head of the header row. The grip is the only
drag start point, so it never competes with `ActionCard`'s horizontal
swipe. A dragged row drops to `opacity-40` in place, a `shadow-lifted`
preview follows the pointer, and the hovered category tints `accent-tint`
with an `accent` ring.

Keyboard: focus a grip, Space to lift, arrow keys to move, Space to drop,
Escape to cancel. For a cross-category move without a pointer, the item's
`IconRail` carries a "Move to category" action (`FolderIcon`) that opens a
sheet of every category plus Uncategorized — the same shape as the priority
sheet.

The shopping list is a single column (a linear order needs one), and its
cards do not use the `.rise` entrance animation (its transform conflicts
with `@dnd-kit`'s).

Chores' rotation-order list still uses the older hand-rolled pointer drag
(swap one step as the pointer crosses a row). Migrating it to `@dnd-kit` is
a follow-up.
```

- [ ] **Step 2: Update "The Icon Rail" / "The Rail-Is-Actions Rule"**

Wherever the rail contents are enumerated, change the shopping-item list to: `drag handle · remind · priority · move to category · edit · delete` (up to six slots). Add a sentence: "One slot may be a drag-handle activator rather than a click action — it carries the `@dnd-kit` sortable ref and listeners, not an `onClick`."

- [ ] **Step 3: Add a "Categories" subsection**

After "Priority Marks" (or the nearest shopping-specific section), add:

```markdown
### Categories (shopping)

Categories are managed on the list itself, not in a separate panel. A
"+ New category" control at the end of the list reveals an inline input.
A tap on a category's name turns it into an inline rename input (Enter
saves, Escape cancels, a name clash is rejected). The header's trash icon
deletes the category; its items fall to Uncategorized. An empty category
stays visible with a "Drag items here" drop zone. Uncategorized shows
whenever any category exists; with no categories at all the list is a
flat, headerless column.
```

- [ ] **Step 4: Format check**

Run: `npm run check`
Expected: pass (or run `npx prettier --write DESIGN.md` then re-check).

- [ ] **Step 5: Commit**

```bash
git add DESIGN.md
git commit -m "docs: DESIGN.md for shopping drag-and-drop"
```

---

## Task 18: Full verification pass + PR

**Files:**

- Delete: `scripts/_scratch.ts` (never committed; just remove it if present)

- [ ] **Step 1: Remove the scratch script**

Run: `rm -f scripts/_scratch.ts`

- [ ] **Step 2: Migration check on a clean apply**

Run:

```bash
npm run db:migrate
node -e "const j=require('./drizzle/meta/_journal.json').entries; const a=j.at(-2),b=j.at(-1); if(b.when<=a.when){console.error('JOURNAL OUT OF ORDER'); process.exit(1)} console.log('journal ok')"
```

Expected: `journal ok`.

- [ ] **Step 3: Full check suite**

Run:

```bash
npx tsc --noEmit && npx eslint . && npm run check && npx vitest run && npx vite build && rm -rf .output
```

Expected: every command exits 0.

- [ ] **Step 4: Bundle check**

Run:

```bash
npx vite build
grep -rl "@dnd-kit\|dnd-kit" .output/public/assets/*.js | head
ls -la .output/public/assets/*.js | sort -k5 -n | tail -3
rm -rf .output
```

Expected: `@dnd-kit` appears in a client chunk (it is a legitimate client dependency). Record the largest client chunk size for the PR body.

- [ ] **Step 5: Authenticated end-to-end check**

Start `npm run dev`. Get a session cookie:

```bash
node scripts/create-invite.mjs        # prints an invite code
J=/tmp/doma-dnd
mkdir -p "$J"
curl -s -i -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -d '{"email":"dnd-check@example.com","password":"testpass123","name":"DnD","inviteCode":"<CODE>"}' \
  -c "$J/cookies.txt" -o /dev/null -w "register: %{http_code}\n"
```

Then in a browser signed in as that user (or a second real member), verify each:

- Create three categories with "+ New category".
- Drag items to reorder within a category; reload — order holds.
- Drag an item onto another category; reload — it re-filed.
- Reorder categories by dragging headers; reload — order holds.
- Rename a category; reload — name holds. Rename to a clash — reverts.
- Delete a category; its items appear under Uncategorized, densely ordered.
- "Move to…" sheet files an item into a chosen category, at the end.
- Keyboard: grip → Space → arrows → Space reorders an item and a category.
- Open a second browser session as another member; a drag in one appears in the other after its live-sync refresh.

Clean up the throwaway user:

```bash
docker exec doma-postgres-1 psql -U doma -d doma -c \
 "DELETE FROM invites WHERE redeemed_by = (SELECT id FROM users WHERE email='dnd-check@example.com'); \
  DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email='dnd-check@example.com'); \
  DELETE FROM memberships WHERE user_id = (SELECT id FROM users WHERE email='dnd-check@example.com'); \
  DELETE FROM users WHERE email='dnd-check@example.com';"
```

Kill the dev server.

- [ ] **Step 6: Confirm working tree is clean of scratch files**

Run: `git status --porcelain`
Expected: empty (all task commits made; no `scripts/_scratch.ts`).

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin feat/shopping-drag-and-drop
```

PR body must state:

- What changed (drag to reorder items, re-file into categories, reorder categories; inline category create/rename; "Move to…" sheet).
- The new dependency `@dnd-kit/*` and the largest client chunk size delta.
- Migration `0011` adds `shopping_items.sort`; prod deploy runs it on boot.
- **Visible changes:** the shopping list is now one column (was two on `sm+`); item cards lost the `.rise` entrance animation; the standalone "Category order" section is gone; the item edit sheet no longer has a category field.
- Verification done: full check suite, migration journal check, authenticated end-to-end list above.
- Not verified: real touch-device / PWA drag (no device in this environment).
- End with: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

- [ ] **Step 8: STOP for review**

Do not merge. The repo rule is: `main` is prod, the user reviews and merges. Post-merge, confirm the deploy is healthy (`/api/health` version matches the merge commit) and that `/shopping` loads.

---

## Self-Review

**Spec coverage:**

| Spec section                                                                                          | Task              |
| ----------------------------------------------------------------------------------------------------- | ----------------- |
| `shopping_items.sort` + migration `0011` + journal check                                              | Task 2            |
| `listItems` sort order                                                                                | Task 2            |
| `board.ts` (`buildBoard`, `placeItem`, key helpers) + tests                                           | Task 3            |
| `moveItemAction` + `moveItem` (renumber dest, densify source, validate)                               | Task 4            |
| `reorderCategoriesAction` replaces one-step; delete `moveCategory` + test                             | Task 5            |
| `createCategoryAction` (idempotent)                                                                   | Task 6            |
| `renameCategoryAction` (reject clash) + deliberate asymmetry                                          | Task 6            |
| `deleteCategoryAction` densify                                                                        | Task 7            |
| `addItem`/`updateItem` drop `categoryName`; new item uncategorized + `sort`                           | Task 7            |
| `@dnd-kit` deps pinned                                                                                | Task 1            |
| `IconRail` drag-handle slot                                                                           | Task 8            |
| One `<DndContext>`, category `SortableContext`, per-bucket `SortableContext`                          | Tasks 10–11       |
| Optimistic `board` state + `useEffect` reconcile when not dragging                                    | Tasks 9, 11       |
| Sensors (Pointer/Touch/Keyboard)                                                                      | Task 10           |
| `onDragStart` / `onDragOver` / `onDragEnd`                                                            | Tasks 10–11       |
| `useHouseholdMutation` + list-level `MutationStatus`                                                  | Task 12           |
| Grip handle (first rail slot / header head), `touch-none`, `cursor-grab`                              | Tasks 10–11       |
| "Move to…" rail action + sheet (`itemSheet` `'move'`)                                                 | Task 15           |
| `FolderIcon`                                                                                          | Task 15           |
| Category header (grip, name→rename, count, trash)                                                     | Tasks 10, 14      |
| "+ New category" inline input                                                                         | Task 13           |
| Empty categories render as drop targets; uncategorized visibility; flat list                          | Tasks 11, 16      |
| `DragOverlay` + drop highlight + `opacity-40`                                                         | Task 12           |
| Delete standalone "Category order" section                                                            | Task 10           |
| DESIGN.md (Reorderable Lists, Icon Rail, Categories, single column, no `.rise`, legacy rotation note) | Task 17           |
| Verification (check suite, migration, bundle, e2e, touch gap)                                         | Task 18           |
| Out of scope: multi-list, category color, checked-item drag, delete confirm, rotation migration       | not built — noted |

No gaps.

**Placeholder scan:** No "TBD" / "add error handling" / "similar to Task N" / bare "write tests". Each code step has real code. Each run step has a command and an expected result.

**Type consistency:**

- `Board` shape (`categoryOrder: string[]`, `itemsByBucket: Record<string, string[]>`) is identical in Task 3, 9, 10, 11, 12, 16.
- `buildBoard(data, hiddenIds?)` — same signature in Task 3 and its callers in Task 9/11.
- `placeItem(board, itemId, toBucket, toIndex)` — same in Task 3 and Task 11.
- `moveItem(householdId, { itemId, categoryId, orderedItemIds })` — repo (Task 4) matches `moveItemAction` input (Task 4) matches the client call (Task 11) matches the "Move to…" call (Task 15).
- `reorderCategories(householdId, orderedIds)` — repo (Task 5) matches action (Task 5) matches client call (Task 10/12).
- `createCategory` returns `{ id }` — Task 6 repo, action, and no client depends on the return beyond fire-and-forget (Task 13).
- `IconRailAction.handleProps?: ComponentProps<'button'>` — defined Task 8, consumed Task 11.
- Category sortable id is `` `cat:${id}` `` and item sortable id is the raw id — set in Task 11 Step 3 and used consistently in Task 11 Step 4's `onDragEnd` (`.slice(4)`), Task 12's `activeCategory` (`.slice(4)`).

One consistency fix applied inline: Task 10 originally used the raw category id as the sortable id; Task 11 Step 3 changes it to the `cat:` prefix to avoid colliding with the uncategorized bucket droppable id. Task 10's `onDragEnd` and `SortableContext items` and Task 12's overlay lookup all use the prefixed form. When executing, apply the `cat:` prefix from Task 10 onward (Task 11 Step 3 is the authoritative statement of the id scheme).
