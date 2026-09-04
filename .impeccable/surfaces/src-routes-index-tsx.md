---
version: 1
slug: 'src-routes-index-tsx'
primary_target: 'src/routes/index.tsx'
related_targets:
  ['src/routes/__root.tsx', 'src/routes/chores.tsx', 'src/routes/shopping.tsx']
---

## Direction contract

THESIS: doma is the household's own recipe/index-card file box on the counter, not a
dashboard — refuses the sidebar-and-card-grid SaaS genre and the cream/serif/lamplight
default this brief would reach for by habit.

OWN-WORLD: cream cardstock cards, kraft tab dividers, rust/terracotta ink for active/due,
quiet graphite-blue for settled/typed metadata, ruled baseline lines, rounded-corner card
silhouette, a drafting/handwriting-adjacent display face for headers over a clean grotesk/mono
for metadata.

STORY: glance at what's due across chores + shopping, tap a card to flip it (assignee/detail
on the back), complete an item and it files face-down into a riffle-able done stack instead of
vanishing; a partner's live tick settles into view mid-glance with an unhurried cascade, never
a snap.

FIRST VIEWPORT: the box open — a hero card (the single most urgent item across every module)
pulled furthest forward, today's remaining cards fanned behind it, a tab spine down the left
edge (Chores, Shopping active; Meals, Bills, Maintenance reserved and honestly blank, same
weight as active tabs).

FORM: The Recipe Box — assigned candidate #7 of 7 grounded household-object directions
(rolled, not ranked), seed key fb35f7a9.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Revision (mobile pass, 2026-09-04)

Fixed a real horizontal-overflow bug: at the `md:` breakpoint boundary (768px, exactly where
the card fan's overlap CSS first activates), a household with more than ~3 "rest" cards
overflowed the page — the fan has no cap and no wrap, so the last tile simply rendered past
the viewport edge. Fix: the fan's wrapper div now carries `md:overflow-x-auto` with
`md:pt-2 md:pb-10` reserved padding (the transformed cards' translate/rotate/hover excursions
need real box space, since CSS transforms don't grow an `auto`-height container). The fan still
overlaps and recedes exactly as before when it fits; it becomes a horizontally scrollable strip
only when a household's today-cards genuinely exceed the viewport.

Also bumped the two `LoggedOutSplash` primary/secondary CTAs (`Sign in` / `Register`) from
`py-2` to `py-3` — see The Forty-Four-Pixel Rule in DESIGN.md.
