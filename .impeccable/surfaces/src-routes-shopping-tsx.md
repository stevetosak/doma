---
version: 1
slug: 'src-routes-shopping-tsx'
primary_target: 'src/routes/shopping.tsx'
related_targets: []
---

## Scope

Extension of the established Recipe Box world (`src/routes/index.tsx`'s locked direction), not a
new direction round — no image generation available, no concept tournament (inherit world +
composition per new-work.md §3 "Extend an existing surface"). Confirmed with the user via a
shape discovery round (2026-09-04): declutter add-item out of the list into a bottom sheet;
move the "Got it" check-off to the card front so the most frequent action doesn't require a
flip.

## Direction contract

THESIS: checking an item off is the single most frequent action on this page and must not cost
a flip — the flip stays for the slower, secondary job of reading a note or editing.

OWN-WORLD: inherited verbatim from DESIGN.md — cardstock/kraft palette, rust=due/active,
blue=settled, ruled card texture. One addition to the vocabulary: the **Sheet** (shared with
chores.tsx's brief) for add/edit; the front face of `ItemCard` gains a large tap target
(checkbox + name) as its primary control, replacing the current small native checkbox buried on
the back.

STORY: scan the shopping list, tap an item's front to check it off directly (files into the
done stack, same as today), flip only to see a note or edit; tap "+" to add a new item via the
sheet, without the add form cluttering the resting list.

FIRST VIEWPORT: shopping list unchanged in grouping/category structure; each item card's front
now carries the check control as its dominant element. A rust "+" tab pinned above the list
opens the add sheet.

FORM: extension, not a rolled direction — resolved directly with the user via shape's
AskUserQuestion round (front-face check-off over back-only redesign; bottom sheet over
separate-page/inline). No seed key; this is not a direction round.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance.
