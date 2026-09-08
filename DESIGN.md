---
name: doma
description: A ledger left open on the counter — chores, shopping, and whatever's next, tracked in a plain, well-kept hand.
colors:
  ground: '#e9e4d8'
  card: '#f6f3ec'
  inset: '#ece5d6'
  ink: '#1d2320'
  ink-dim: '#6f6a5f'
  ink-ghost: '#a09884'
  accent: '#8c2f24'
  accent-deep: '#6f2419'
  accent-tint: '#f0dcd4'
  second: '#5f6f5c'
  line: '#ddd6c8'
  line-soft: '#e6dfd0'
  error: '#9a2c1d'
  priority-high: '#8c2f24'
  priority-medium: '#b0705f'
  priority-low: '#d8c3b4'
typography:
  display:
    fontFamily: 'Outfit Variable, Outfit, system-ui, sans-serif'
    fontSize: '1.25rem–3rem'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 'normal to -0.015em at sheet-title scale'
  body:
    fontFamily: 'Work Sans Variable, Work Sans, system-ui, sans-serif'
    fontSize: '0.75rem–1rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 'normal'
  mono:
    fontFamily: 'JetBrains Mono Variable, JetBrains Mono, ui-monospace, monospace'
    fontSize: 'reserved, not used for UI metadata'
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 'normal'
rounded:
  control: '12px'
  card: '18px'
  sheet: '24px'
  btn: '14px'
spacing:
  sm: '0.5rem'
  md: '1rem'
  lg: '1.5rem'
  xl: '2.5rem'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.card}'
    rounded: '{rounded.btn}'
    padding: '15px'
  button-secondary:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.btn}'
    padding: '15px'
  card-front:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
    padding: '1.25rem'
  icon-rail:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink-dim}'
    rounded: '0'
    padding: '0'
  field:
    backgroundColor: '{colors.inset}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '13px 14px'
---

# Design System: doma

## Overview

**Creative North Star: "Ledger Slate"**

doma reads as a ledger left open on the counter, not a productivity dashboard and not the stationery-box metaphor ("The Recipe Box") it shipped with before this pass. A near-white drafting ground holds flat cards with no border and no paper texture; oxblood marks whatever is active or due, sage marks what's already settled. Nothing is ruled, nothing is kraft-brown, nothing is handwritten — the display face is a confident geometric sans (Outfit), body copy is a warm grotesk (Work Sans), and metadata no longer gets its own monospace register. Depth comes from ink-tinted shadows, never neutral gray. Fields and steppers sit in pressed-in _insets_ rather than bordered boxes — status still reads through ink color and a small corner dot, never a border fighting a card's rounded corners.

This is the second visual system doma has shipped (see git history / `docs/design-direction.md` for "The Recipe Box," the first). The redesign was scoped through two paired handoff documents produced outside this repo (a fresh design pass against a snapshot of the shipped app, then an implementation-detail companion), followed by a revision written after using the shipped build — rather than through this project's own `/impeccable` workflow, which was removed partway through this project's life. Structural interaction patterns carry forward from that revision: the docked sheet, the "filed, not deleted" done stack, the offline-honest mutation status line, swipe as the primary completion gesture. The card flip did not survive contact with the built app — it hid every action behind a state change and was retired for a single-face `ActionCard` with an always-visible icon rail; swipe now runs both directions (complete and skip/delete) instead of alongside a tap-to-flip.

**Key Characteristics:**

- A near-white drafting ground with flat cards, inset (pressed-in) form fields, and one warm accent (oxblood) plus one cool accent (sage) — no third hue, no border, no texture
- A geometric display face (Outfit) reserved for headings only; body copy is a warm grotesk (Work Sans); metadata reads in the same body face, not a separate monospace register
- Status reads through ink color and a small corner dot, never a heavy accent border
- Depth comes from warm, ink-tinted drop shadows (never neutral-gray), never from a bevel or gradient fill
- Completed work is filed, not deleted — the "done" stack pattern, now a plain inset toggle rather than rotated paper
- Every number input in the app is a stepper, never free-typed — nothing left to snap to 0 mid-edit

## Colors

Every hex below is the literal `--color-*` custom property shipped in `src/styles.css`.

### Primary

- **Accent** (`#8c2f24`): the one warm accent — active/due status text, overdue and due-today corner dots and occurrence pills, primary buttons (Sign in, Add chore, Add item, Done, Got it), the `::selection` background, `:focus-visible` outline ring, and the app's `theme-color` (browser chrome + PWA manifest).
- **Accent Deep** (`#6f2419`): the same register at higher contrast for text set on `accent-tint`, and the retrying-mutation message. `accent` itself is legal for a 12px uppercase kicker but not for paragraph text (6.4:1 vs the ~4.5:1 body floor).
- **Accent Tint** (`#f0dcd4`): the "due today, not the actionable one" occurrence-pill fill.

### Secondary

- **Second** (`#5f6f5c`): the settled/cool ink — weekday-strip "on" fill, filed done-stack slip text. Never used for interactive primary actions; it marks information that's already resolved, in contrast to accent's "this needs you" register.

### Neutral

- **Ground** (`#e9e4d8`): the page background, under the ambient time-of-day wash.
- **Card** (`#f6f3ec`): every card's front surface, sheet panels, form-section surfaces, and the raised half of a stepper/segmented control.
- **Inset** (`#ece5d6`): a pressed-in well — form fields, a `DoneStack` row, a stepper/segmented-control track, an `IconRail` button's hover/press fill, a priority-sheet row's selected fill. Reads as "recessed," never as a second card material.
- **Ink** (`#1d2320`) / **Ink Dim** (`#6f6a5f`) / **Ink Ghost** (`#a09884`): the text ramp. `ink` is headings/primary content; `ink-dim` (4.86:1 on card, 4.5:1 on inset) is every piece of secondary/metadata text a user actually reads. `ink-ghost` is **glyph-only** — it measures 2.6:1/2.3:1, below body-text contrast, and is legal only for the drag-handle grip, a select caret, and the done-stack's rule glyph. See The Ghost Rule below.
- **Line** (`#ddd6c8`) / **Line Soft** (`#e6dfd0`): the one remaining border color, used sparingly (secondary buttons, occurrence-pill outlines, preset chips) — cards themselves are borderless.
- **Error** (`#9a2c1d`): form validation and mutation failure text only — distinct from accent so a genuine error never reads as merely "due."

### Named Rules

**The Ghost Rule.** `ink-ghost` is for marks, not words: the drag-handle grip, a `<select>` caret, the done-stack's three-rule glyph. Every string a person reads — hints, counts, empty-state copy, version footer — is `ink-dim`. This rule exists because an earlier draft used ghost for body text and failed contrast review; don't reintroduce that.

**The Ink-Not-Border Rule.** Status (overdue, active) is carried by text color and a small corner stamp-dot, never a thick accent border competing with the card's rounded silhouette. See `ChoreCard`'s `urgent` styling and `HeroCard`'s corner dot.

**The One Warm, One Cool Rule.** Accent marks what needs attention; second marks what's already settled. No third status color exists in the shipped system — don't introduce one for a new state without collapsing it into this pair or arguing why it's exempt.

## Typography

**Display Font:** Outfit Variable (with Outfit, system-ui, sans-serif fallback)
**Body Font:** Work Sans Variable (with Work Sans, system-ui, sans-serif fallback)
**Mono Font:** JetBrains Mono Variable — kept as a token, but not currently used anywhere in the UI; metadata reads in the body face now.

**Character:** A confident geometric display face carries every heading; body copy is a warm, humane grotesk. There is no longer a third, monospace register for "system-generated facts" (dates, statuses, counts) — those read in the same body face as everything else, at a smaller size and `ink-dim` color, so the app reads as one consistent hand rather than a typewriter tape glued onto a page.

### Hierarchy

- **Display / Headline** (600, `text-4xl`/`text-5xl` page titles down to `text-xl`/`text-2xl` section and card-title level, line-height ~1.2, `-0.015em` tracking at sheet-title scale): `font-display`, every `<h1>`/`<h2>`/`<h3>`, sheet titles, hero-card title. Never used for body copy or form labels.
- **Body** (400, `text-sm`–`text-lg`): `font-body` (the theme default), used for card front/back prose, empty-state copy, member lists.
- **Metadata** (400–600, `text-[11px]`–`text-sm`, `ink-dim`, sentence case unless the string itself is a stamp word like OVERDUE): still `font-body`, just smaller and dimmer. Status stamps (OVERDUE, DUE TODAY) are the one place metadata goes uppercase with `0.06em` tracking, and only when urgent.

## Layout

Content stays spacious and card-based, never a dense data table — the target range is ~3–8 open chores and ~5–15 shopping items for a 2-person household, and the layout doesn't try to accommodate more. `AppShell`'s `<main>` caps at `max-w-3xl`, centered, with `px-4 pt-8` and a safe-area-aware bottom clearance (`pb-[calc(104px+env(safe-area-inset-bottom))]`) on mobile that clears the fixed bottom nav bar, and `md:pt-10 md:pr-8 md:pb-10 md:pl-24` on desktop (left padding clears the fixed spine).

Navigation is a fixed spine, not in-flow chrome: a 4rem-wide (`w-16`) vertical bar pinned to the left edge on `md:` and up, replaced below that breakpoint by a fixed, blurred-glass bottom bar. Both list the same three modules in the same order — Today, Chores, Shopping — with no reserved slots for unbuilt modules; a new module simply adds a tab when it ships.

The Today dashboard's card fan is the signature spatial pattern: on `md:` and up, secondary cards genuinely overlap (negative `-4.5rem` margin, descending scale 1 → 0.96 → 0.93 → 0.9, alternating small rotation, ascending z-index toward the front) rather than sitting in a same-plane row with a tilt effect; hovering a card lifts it to the front (`translateY(-6px) scale(1.02)`, z-index 10). Below `md:`, `.card-fan` drops to a plain vertical stack. The fan's wrapper carries `overflow-x-auto` with `pt-2 pb-10` reserved padding on `md:` so the transformed cards' translate/rotate/hover excursions have real box space.

Grids elsewhere (occurrence cards) use a plain 1-column mobile / 2-column (`sm:grid-cols-2`) desktop grid with `gap-4`; sections stack vertically with `gap-10` between them. The shopping item list is a single column at every width — a linear drag order needs one (see Reorderable Lists).

### Named Rules

**The Forty-Four-Pixel Rule.** Every primary, filled `btn-primary` button and every bottom-bar/spine nav tab holds a real 44px tap target, not just a comfortable-looking one. This applies to the single most-committal action per surface and to primary navigation, not to secondary text-links, small reorder controls, or quick-add chips, which stay compact on purpose.

## Elevation & Depth

The system uses real shadows, warm-tinted to the ink palette rather than neutral gray, layered rather than flat. Depth is structural (it marks a card's position in the stack or a sheet's position above the list), not merely decorative hover polish.

### Shadow Vocabulary

- **Card** (`0 10px 26px -12px rgb(29 35 32 / 0.35)`): the resting elevation for every card and form panel.
- **Lifted** (`0 12px 26px -10px rgb(29 35 32 / 0.45)`): the hero card at rest, any card's hover/focus state, and a category row being dragged.
- **Sheet** (`0 -18px 44px -14px rgb(29 35 32 / 0.5)`): the docked sheet panel, casting upward since it's pinned to the bottom edge.
- **Accent** (`0 8px 20px -10px rgb(140 47 36 / 0.5)`): the primary button's own colored glow, under its inset highlight.

### Named Rules

**The Lift-On-Front Rule.** Elevation increases only when a card becomes (or is about to become) the frontmost thing — hover/focus on any card tile, the hero card's permanent lifted shadow, a dragged reorder row. Elevation is never used as ambient screen-wide decoration.

## Shapes

Four radius steps: `--radius-control` (12px) for form fields, steppers, segmented controls, and inset rows; `--radius-card` (18px) for cards and panels; `--radius-sheet` (24px, top corners only) for the docked sheet; `--radius-btn` (14px) for every button. Nothing in the shipped system uses a fifth radius. Card silhouettes are borderless rounded rectangles — no hairline border, no ruled-baseline texture anywhere. The one recurring surface treatment is the flat card vs. inset-well distinction, not a pattern or texture.

## Components

### Buttons

- **Primary:** `.btn-primary` — accent fill with a 15% white top-wash sheen fading out by mid-height, `card` text, `15px` padding, `600 15px` body type, `shadow-accent` plus a 1px inner highlight, `scale(0.97)` on press. Used for the single most-committal action per surface (Sign in, Add chore, Add item, Generate invite code, Done, Got it). A `.btn-compact` modifier (`12px 16px`, `14px` type, `flex:none; white-space:nowrap`) stacks onto it for header-scale and inline card-back buttons so they never wrap at 390px.
- **Secondary:** `.btn-secondary` — `card` fill, `1px solid line`, `ink` text, same padding/press behavior, no sheen. Used for the lower-commitment sibling action (Skip, Register, "Sign in with Google").
- **Tertiary:** `.btn-tertiary` — plain `13px ink-dim` text, no background, `scale(0.9)` on press. Used for "Cancel," stacked below the primary action it cancels.
- **Focus:** the shared `:focus-visible` accent outline (`2px solid var(--color-accent)`, `2px` offset).

### Cards / Containers

- **Corner Style:** `rounded-card` (18px).
- **Background:** `bg-card` for a card's own face (there is no second, flipped face any more), `bg-inset` for `DoneStack`/reorderable rows and an `IconRail` button's hover fill.
- **Shadow Strategy:** `shadow-card` at rest, `shadow-lifted` on hover/focus or for the hero card and a dragged row.
- **Border:** none. Cards are flat; the one place a 1px `line` border survives is a secondary button, an occurrence-pill outline, or a preset chip.
- **Internal Padding:** `p-5`–`p-8` for cards, `p-6` for form-panel sections.

### Inputs / Fields

- **Style:** the shared `.field` utility class — `bg-inset`, no border, `rounded-control`, `13px 14px` padding, `font-body` at `15px`. A single-line `input.field`/`select.field` is pinned to a `46px` height (a `textarea.field` stays organically sized by its `rows`) — see The Reminder List Editor for why. Never a bare browser-default input.
- **Focus:** the global `:focus-visible` accent outline (no border-color shift, since there's no border).
- **Numbers are never free-typed.** Every previous `<input type="number">` (chore interval, day-of-month, reminder day-offset) is a `Stepper` — an inset well with a display-only value and two round buttons — so there is no controlled-input value left to snap to 0 when cleared mid-edit. Quantity is the one exception: a `DecimalStepper` keeps a real, freely-typable text input alongside the buttons, since it's genuinely decimal-capable.
- **A short-text field sits at a width proportionate to what it holds**, not `flex-1` filling whatever room is left — the shopping-item Unit field (`w-24`, next to the Qty stepper) is the concrete case: at `flex-1` it stretched to fill most of the row for text that's almost always 1-3 characters ("kg", "pcs").
- **Weekday selection** is a `WeekdayStrip` (seven equal-width toggle cells, `second`-filled when on), not seven checkboxes.
- **Small-enum choices** (Repeats, Assignment) are a `SegmentedControl` — an inset track with a sliding `card`-colored thumb.
- **Error / Disabled:** error text (not the field itself) renders in `text-error`. Disabled controls drop to `opacity-50`.

### Navigation

- **Desktop spine:** fixed left, `bg-[#2b2f2a]` (a warm near-black, not a token — the one deliberately off-system color, reserved for this one surface), `w-16`, each module tab is a 5rem-tall (`h-20`) vertical-text label (`writingMode: vertical-rl`) in `font-display text-card/90`; the active tab flips to horizontal text on a `bg-card`/`text-ink` panel.
- **Mobile bottom bar:** fixed bottom, translucent blurred glass (`rgb(246 243 236 / 0.72)` + `backdrop-blur(26px) saturate(1.4)`), a hairline top border, three tabs only (Today/Chores/Shopping, each a real icon — `CalendarDotIcon`/`ListChecksIcon`/`BasketIcon` — plus an `11.5px` label), active tab in `accent` with the icon at `scale(1.12)`. Bottom padding is safe-area aware (`calc(24px + env(safe-area-inset-bottom))`). No reserved slots for unbuilt modules on either surface — a module simply adds a tab when it ships.

### The Action Card (signature component)

Every actionable item — a chore, a shopping item — is an `ActionCard`: one face, auto height, no hidden state. The flip that shipped in the first pass of this redesign tested badly against the real app (every action lived behind a tap that hid the very content you'd just read) and was retired. Content — title, status, assignee, notes, metadata — fills a padded (`p-5`) top section; a full-width `IconRail` (see below) sits directly beneath it, always visible, no trigger required.

**Swipe is bidirectional and, on touch, the only completion path.** A horizontal drag (clamped ±140px) reveals a ground-level label behind the card as it translates — accent-ink "✓ Done"/"✓ Got it" to the right, error-ink "Skip"/"Delete" to the left — and releasing past ±92px runs that side's action; anything short of that springs back. Drag state lives on a ref, not render state, so a `setState` on the first `pointermove` can't reset the gesture's origin mid-drag. Pointer capture is set on the card surface itself, and `pointerdown` never calls `preventDefault`, so a tap on an `IconRail` button underneath the capture still fires its own `click`.

**Pointer devices get a second, discoverable path.** Hovering or keyboard-focusing the card reveals a pair of round buttons pinned to its left/right edges (check to complete, × for the negative action) — `opacity-0` with `focus:opacity-100` and `[@media(hover:hover)]:group-hover:opacity-100`, so they're real, always-tabbable `<button>`s that just aren't visible until hovered or focused. Swipe alone isn't a discoverable desktop affordance even though click-and-drag technically works through the same Pointer Events handlers.

**The negative-direction action differs by surface.** A chore's swipe-left/× skips today's occurrence (reversible — see The Done Stack); a shopping item's swipe-left/× deletes the item outright, which has no undo elsewhere in the schema, so it goes through the optimistic-delete-with-undo-toast path instead (see The Toast below) rather than firing immediately.

### The Icon Rail (signature component)

The action row that replaced the flip's back-face text links: a horizontal strip of icon-only buttons directly under a card's content, each a full 44px-tall touch target (The Forty-Four-Pixel Rule) separated by a hairline `line` divider, `ink-dim` at rest and `ink`-on-`bg-inset` on hover/press — no background until touched, so the row reads as part of the card rather than a separate toolbar. A chore's rail is remind → edit → delete; a shopping item's is `drag handle · remind · priority · move to category · edit · delete` (up to six slots). The reminder button carries a small accent count badge (`IconRailAction.badge`) instead of the old "(N)" text suffix. One slot may be a drag-handle activator rather than a click action — it carries the `@dnd-kit` sortable ref and listeners (`IconRailAction.handleProps`), not an `onClick`.

### Named Rules

**The Rail-Is-Actions Rule.** A card's padded content area is read-only — title, status, assignee, notes, metadata, `MutationStatus` — never a control past the swipe gesture and the hover-reveal buttons. Every named, individually-triggerable action (drag handle, remind, priority, move to category, edit, delete) lives in the `IconRail`, not scattered across the card face.

### The Done Stack (signature component)

Completed/skipped items file into a `DoneStack` instead of disappearing — the rotated-paper metaphor is retired. The toggle is a plain inset row with a three-rule glyph (`ink-ghost`, glyph-only per The Ghost Rule) and an `ink-dim` label: `"{N} done — show all"` (chores) / `"Already bought · {N}"` (shopping). Expanding it reveals each item as an inset row, `second`-colored text, entering with a staggered `slip` animation. A filed slip can carry its own small actions (`undo` on a chore occurrence, `undo`/`remove` on a bought item) — filing something is never a one-way trip.

### Mutation Status (signature component)

A shared, wordless-by-default status line for offline/failed writes: silent on success, `accent-deep` "not saved — retrying…" while an automatic retry is in flight, `error` with the server's message on hard failure. Renders `null` (no reserved space) when idle — an `ActionCard`'s content has no fixed slot to protect from a layout jump, so the rare `retrying`/`error` line just pushes the `IconRail` down half a beat. Never a toast, never a spinner — see The Toast below for the one deliberate exception, which exists for a different purpose (undo, not sync honesty) and must not be reached for here. Currently wraps only chore Done/Skip and item "Got it" — extending it to edit/delete/reorder/settings writes is a known gap, not yet done.

### The Toast (signature component)

The one exception to the standing no-toast convention: a bottom-anchored pill (`rgb(29 35 32 / 0.9)` on `card` text, `backdrop-blur`), docked above the mobile tab bar / spine on desktop, auto-dismissing after 5s. Reserved for two cases only — the swipe-left/rail-delete undo (an item's delete is genuinely irreversible once the window elapses; nothing else in the app needs a confirmation this heavy) and a chore skip's undo (already reversible via `DoneStack`, but the toast gives the same immediate "here's how to take that back" beat as delete for a consistent feel). Never used for a sync failure — that stays `MutationStatus`'s job.

### The Sheet

Add/edit forms live in a `Sheet`, not inline in the resting list — a `bg-card` panel with a 38×4px grabber, `rounded-sheet` top corners only, `shadow-sheet`, docked to the bottom edge on every viewport (never a right-side drawer). It slides up (`translateY(100%)` → `0`, 0.38s `var(--ease-spring)`) over a blurred backdrop (`rgb(29 35 32 / 0.34)` + `blur(3px)`, fading in 0.3s), snapping into place under `prefers-reduced-motion`. The close control is a 30px circular `bg-inset` button with a literal `×`. `role="dialog"` `aria-modal="true"`, traps Tab/Shift+Tab focus inside the panel, closes on Escape or backdrop click, and returns focus to whatever opened it on close. Capped at `max-h-[85dvh]` (dynamic, not static, viewport height — a mobile browser's collapsing address bar makes a static `85vh` cap unreliable) with `min-h-0` on the scrollable body, so a long form (many reminder rows) scrolls inside the panel instead of growing it past the screen.

A `Sheet` is mounted once per page, one instance per mode (add / edit / reminders / priority / move to category), at the top level of the route component — never inside a list row. A row carries a callback (`onEdit`, `onRemind`, …) that sets one shared piece of page state naming the target entity and mode; the page looks that entity up against live loader data so the sheet closes itself if the entity disappears. This is structural, not stylistic: the sheet is `fixed inset-0`, and a card sits inside a `.rise` wrapper whose transform-bearing entrance animation makes it the containing block for fixed descendants — a row-hosted sheet is positioned against its card, not the viewport, and rides off the top of the screen.

### The Occurrence Strip

A horizontal row of pills (`999px`, `12.5px`), each reading `Tue 8 Sep` — the weekday first, day before month, and the month name repeats only when it differs from the chip before it (so a monthly recurrence doesn't render three chips that all say "8"). Four states, not two: the single occurrence actually actionable from the card (the soonest pending one) is filled `accent` with the button sheen; the rest of an overdue backlog that isn't reachable from this card is `card` fill with an `accent` outline; a date due today that isn't the actionable one is `accent-tint` fill; a future date is a bare `line`-outlined `card` chip. Appears on a chore's collapsed card front and, live-recomputed from the same recurrence engine as the field values change, inside the add/edit `Sheet`.

### The Reminder List Editor

Both chore and item reminder forms share one row card — an inset shell (`radius-control + 2`, `12px 14px`) holding, top to bottom: the when-control (a `Stepper` + time field for chores, a datetime field for items) on its own line, then a right-aligned "remove" link on the line beneath. **Fixed rows, not a single wrapping flex row** — the control and "remove" used to share one line and fight over width, which on a real device pushed "remove" past the card's edge on a chore's row (the widest one: stepper + connective text + time field). Stacking them means "remove" can never collide with the control regardless of how wide it renders. Presets are `999px` pill chips (`card` fill, `1px line`), plus a dashed "+ Blank" chip; a cap note shows progress (`2 of 5`) before the cap and a fixed string (`Maximum {N} reminders.`) at it. The only remaining asymmetry between the two forms is the cap and the when-control itself, which is data, not styling.

A chore's day-offset stepper reads and writes a **positive "days before"** number (0-30) — the person types/steppers what they mean ("3" = three days before), never a negative number counting up to zero. The sign flip to the server's `offsetDays` (stored 0-or-negative, added straight onto the due date) happens only at the form's two data boundaries — reading `chore.reminders` in and building the save payload out — never in the UI itself.

`Stepper`/`DecimalStepper` are 46px tall (buttons bumped 30px→38px), matching `input.field`/`select.field`'s pinned 46px height — the two used to differ by a few px whenever they sit side by side (a reminder row's stepper next to its time field, the shopping-item Qty stepper next to the Unit field) and visibly didn't line up.

### Reorderable Lists

Shopping categories and their items reorder by drag, built on `@dnd-kit` (`@dnd-kit/core` + `/sortable` + `/utilities` — the project's first drag library). One `<DndContext>` on the shopping route holds a sortable list of category headers and, per category, a sortable list of item cards; an item drags within its category to reorder or onto another header to re-file. Every draggable carries a grip handle (`GripIcon`, `ink-ghost` — glyph-only per The Ghost Rule): on an item card the grip is the first `IconRail` slot, on a category it sits at the head of the header row. The grip is the only drag start point, so it never competes with `ActionCard`'s horizontal swipe. A dragged row drops to `opacity-40` in place, a `shadow-lifted` preview follows the pointer, and the hovered category tints `accent-tint` with an `accent` ring. Keyboard: focus a grip, Space to lift, arrow keys to move, Space to drop, Escape to cancel. For a cross-category move without a pointer, the item's `IconRail` carries a "Move to category" action (`FolderIcon`) that opens a sheet of every category plus Uncategorized — the same shape as the priority sheet. The shopping list is a single column (a linear order needs one), and its cards do not use the `.rise` entrance animation (its transform conflicts with `@dnd-kit`'s). Chores' rotation-order list still uses the older hand-rolled pointer drag (swap one step as the pointer crosses a row); migrating it to `@dnd-kit` is a follow-up.

### Categories (shopping)

Categories are managed on the list itself, not in a separate panel. A "+ New category" control at the end of the list reveals an inline input. A tap on a category's name turns it into an inline rename input (Enter saves, Escape cancels, a name clash is rejected). The header's trash icon deletes the category; its items fall to Uncategorized. An empty category stays visible with a "Drag items here" drop zone. Uncategorized shows whenever any category exists; with no categories at all the list is a flat, headerless column.

### Priority Marks

Three values of one hue — `priority-high` (`#8c2f24`, equal to `accent`), `priority-medium` (`#b0705f`), `priority-low` (`#d8c3b4`) — never red/yellow/green, and "none" has no color of its own; a picker row for it uses `ink-ghost` outline rather than a fourth hue. Carried by `FlagIcon` (outline when unset, solid `fill="currentColor"` when set): a small colored flag inline before the item name when a priority is set, the same icon colored in the `IconRail`'s priority slot, and a checked list of four rows (None/Low/Medium/High) in a dedicated `PrioritySheet` opened from that rail icon — a lighter write (`setItemPriorityAction`) than routing through the full edit form, though the edit/add forms also carry the same choice as a `SegmentedControl`. Shopping items only; chores don't carry a priority. Colors are real Tailwind utilities (`text-priority-high` etc.), not raw `var(--color-priority-*)` inline styles — Tailwind's scanner only keeps an `@theme` token whose derived utility class name appears literally in source, so a runtime-templated class string would silently resolve to nothing.

### Icons

A small, hand-picked action-icon set (`src/core/ui/icons.tsx`) — plain geometric strokes (`stroke="currentColor"`, weight 1.75, rounded caps/joins, no fill) for most icons, filled dots for the one glyph-only exception (`GripIcon`, the drag handle). Each icon inherits whatever ink/accent tone its surrounding text already carries. Paired with a text label outside the `IconRail` (which is icon-only by design, each button carrying its own `aria-label`/`title` instead — see The Icon Rail) and the three bottom-nav tab icons, which pair with their own short label directly beneath. `FlagIcon` additionally takes a `filled` boolean, toggling its pennant between outline and solid fill (see Priority Marks).

### The App Mark

`src/core/ui/AppMark.tsx` — three stacked rules in an accent rounded square, matching `DoneStack`'s new toggle glyph. Sits at the top of the desktop spine and in a mobile-only header row above each page's own title (`AppShell`, `md:hidden`).

### Route Pending / Error States

Newly added — neither existed before this pass. A route transition shows a centered, bare "Loading…" line (`RoutePending`); a thrown loader error shows "That didn't load" / "Check your connection and try again." with a `Retry` button that calls the router's own `reset()` (`RouteError`), wired as the router's `defaultPendingComponent`/`defaultErrorComponent`.

## Do's and Don'ts

### Do:

- **Do** keep the display face (Outfit) to headings only; body and metadata both stay in Work Sans, just at different sizes/colors.
- **Do** carry status through ink color and a small corner dot, matching the accent-overdue / second-settled pair — don't add a third status color without collapsing it into this system.
- **Do** use warm, ink-tinted shadow color (`rgb(29 35 32 / …)`) for any new elevation, never neutral gray.
- **Do** reach for `ink-dim` for any text a person reads; reserve `ink-ghost` for glyphs only (drag handles, carets, the done-stack rule mark) — see The Ghost Rule.
- **Do** use a `Stepper` (or `DecimalStepper` for genuinely decimal values) for any numeric input — never a bare `<input type="number">`.
- **Do** use the radius scale as assigned by role (`control`/`card`/`sheet`/`btn`) — no ad hoc fifth radius.
- **Do** keep an `ActionCard`'s content read-only and put every named action in its `IconRail`, primary complete/negative actions reachable only through swipe or the hover-reveal buttons — see The Rail-Is-Actions Rule.
- **Do** give a swipe-left/negative action an undo path — a `Toast` if it's genuinely irreversible (delete), reuse of an existing revert mechanism if it's already reversible (a chore skip via `DoneStack`) — before wiring it to fire immediately.
- **Do** pair a new icon with its text label outside the `IconRail`; inside it, icon-only is correct as long as the button carries `aria-label`/`title` (outside that and the three nav tabs, icon-only controls aren't part of the system).

### Don't:

- **Don't** put the primary flow inside a sidebar-and-card-grid dashboard layout. The tab spine plus card-fan/deck is the system's only navigation-plus-content topology.
- **Don't** fade a live-update settle — it has named, deliberate motion (a View Transitions crossfade), never a plain opacity fade, and must respect `prefers-reduced-motion` by snapping instead of animating.
- **Don't** hard-delete a completed item from view. It files into a `DoneStack`; the interaction vocabulary has no "vanish" state for finished work.
- **Don't** reach for a `Toast` outside its two reserved cases (delete-undo, skip-undo). A sync failure is `MutationStatus`'s job, not a toast's.
- **Don't** use the ambient time-of-day wash for anything but atmosphere — it must never be the only signal for a state or a piece of information.
- **Don't** add a border or a texture to a plain content card. Depth comes from a shadow, not a hairline; the ruled-baseline texture from the previous system is retired everywhere, not just on cards.
