---
version: 1
slug: 'src-routes-chores-tsx'
primary_target: 'src/routes/chores.tsx'
related_targets: []
---

## Scope

Extension of the established Recipe Box world (`src/routes/index.tsx`'s locked direction), not a
new direction round — no image generation available, no concept tournament (inherit world +
composition per new-work.md §3 "Extend an existing surface"). Confirmed with the user via a
shape discovery round (2026-09-04): declutter add/new-chore out of the list into a bottom
sheet; collapse the flat 14-day occurrence grid into one card per chore.

## Direction contract

THESIS: a chore is a standing commitment with a next occurrence, not a pile of dated cards —
the list should read like the tab spine's own dividers (one per chore), not a data table of
every date it will ever come due.

OWN-WORLD: inherited verbatim from DESIGN.md — cardstock/kraft palette, rust=due/active,
blue=settled, ruled card texture, `font-display` headings, `font-mono` metadata. Two additions
to the vocabulary: a **Sheet** (card-back-colored panel, ruled texture, slides up from the
bottom edge like pulling a card forward, `shadow-card-lifted`, closes back into the list) for
add/edit; an **occurrence strip** (a horizontal row of small rust/ink-faint dots or date chips,
`font-mono`) previewing upcoming due dates on both the collapsed chore card and live inside the
edit sheet as the recurrence pattern is configured.

STORY: glance at the chores list and see one card per chore with its next due date read
immediately; tap a chore to see/edit its full recurrence via the sheet, watching the strip
update live as fields change; tap "+" to add a new chore the same way, without the form ever
being visible in the resting list state.

FIRST VIEWPORT: chores list = one card per chore (title, next-due date large, occurrence strip
beneath), a rust "+" tab pinned above the list opens the add sheet. No occurrence-per-card grid
in the resting state.

FORM: extension, not a rolled direction — resolved directly with the user via shape's
AskUserQuestion round (bottom sheet over separate-page/inline; one-card-per-chore over a full
calendar-grid). No seed key; this is not a direction round.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Revision (bucket 4, 2026-09-04)

Real-usage feedback after bucket 3 shipped. Card front now also carries the chore's assignee
(moved from back) and its `notes`/description (new field, form gained a "Description" textarea).
Card back holds nothing but Done/Skip + edit/delete — formalizes what was already mostly true
into DESIGN.md's new Front-Is-Info, Back-Is-Actions Rule. The explicit "← flip back" link is
gone (redundant since bucket 1's tap-anywhere-on-back-flips-back); filed occurrences in the
`DoneStack` gained an `undo` action reverting to `pending`. All dates now render weekday-first
(`Mon 09-07`) via `formatDateWithWeekday`. Icons (`PlusIcon`/`CheckIcon`/`SkipIcon`/`EditIcon`/
`TrashIcon`/`UndoIcon`) paired with every action's existing text label.
