---
name: doma
description: The household's own recipe/index-card file box on the counter — chores, shopping, and whatever's next.
colors:
  ground: '#eadfc6'
  ground-deep: '#ddcda8'
  card: '#faf6ea'
  card-back: '#f2ead6'
  kraft: '#ab8352'
  kraft-dark: '#7c5c34'
  kraft-ink: '#4a3620'
  ink: '#2a241c'
  ink-dim: '#524a40'
  ink-faint: '#686056'
  rust: '#a1401a'
  rust-ink: '#7c3113'
  rust-soft: '#ecd8c3'
  rust-wash: '#f4e5d2'
  blue: '#3d5266'
  blue-soft: '#dde5e8'
  line: '#d9c8a3'
  line-soft: '#e6dabb'
  error: '#9a2c1d'
typography:
  display:
    fontFamily: 'Architects Daughter, Segoe Print, cursive'
    fontSize: '1.25rem–3rem'
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: 'normal'
  body:
    fontFamily: 'Public Sans Variable, Public Sans, system-ui, sans-serif'
    fontSize: '0.875rem–1rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 'normal'
  label:
    fontFamily: 'JetBrains Mono Variable, JetBrains Mono, ui-monospace, monospace'
    fontSize: '0.6875rem–0.75rem'
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: '0.02em'
rounded:
  tab: '0.5rem'
  card: '0.85rem'
spacing:
  sm: '0.5rem'
  md: '1rem'
  lg: '1.5rem'
  xl: '2.5rem'
components:
  button-primary:
    backgroundColor: '{colors.rust}'
    textColor: '{colors.card}'
    rounded: '{rounded.tab}'
    padding: '0.5rem 1rem'
  button-primary-disabled:
    backgroundColor: '{colors.rust}'
    textColor: '{colors.card}'
    rounded: '{rounded.tab}'
    padding: '0.5rem 1rem'
  button-ghost:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.tab}'
    padding: '0.5rem 1rem'
  card-front:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
    padding: '1.25rem'
  card-back:
    backgroundColor: '{colors.card-back}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
    padding: '1.25rem'
  field:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.tab}'
    padding: '0.4rem 0.65rem'
---

# Design System: doma

## Overview

**Creative North Star: "The Recipe Box"**

doma reads as the household's own recipe/index-card file box left open on the counter, not a productivity dashboard. Cream cardstock cards sit under kraft-brown tab dividers; a rust/terracotta ink marks whatever is active or due, and a quiet graphite-blue marks settled, already-typed metadata. Every card face is ruled like real index-card stock. The box is genuinely a box — a "screen" is a stack of cards you flip through, and navigation is a tab spine down the left edge (a bottom bar on mobile), not a sidebar-and-card-grid SaaS layout.

This build shipped the world essentially as specified in `docs/design-direction.md` — no material divergence between the locked direction and the built surfaces. The one thing the build adds beyond the brief's letter is an ambient time-of-day background wash (`useAmbientWash.ts`) that tints the page behind the cards on a 4-part day cycle (morning/midday/evening/night), confirmed in the brief's "raises carried" list as atmosphere-only, never load-bearing for meaning or state.

doma is explicitly not corporate/SaaS, not clinical, and not twee/scrapbook — it avoids both the sidebar-dashboard genre and the cream-paper-plus-serif-plus-lamplight default a "warm domestic app" brief reaches for by habit.

**Key Characteristics:**

- Cardstock-cream palette with kraft-brown structure and one warm accent (rust) plus one cool accent (blue) — no third hue
- A handwritten display face (Architects Daughter) reserved for headings only; body and metadata stay in a clean grotesk/mono pairing
- Status reads through ink color and a small corner dot, never a heavy accent border
- Depth comes from warm, brown-tinted drop shadows (never neutral-gray), never from a bevel or gradient fill
- Completed work is filed, not deleted — the "done" stack pattern

## Colors

The palette is cardstock-cream and kraft-brown with two accent inks; every hex is the literal `--color-*` custom property shipped in `src/styles.css`.

### Primary

- **Rust** (`#a1401a`): the one warm accent — active/due status text, overdue corner dots, primary buttons (Sign in, Add chore, Add item, Done), the `::selection` background, `:focus-visible` outline ring, and the app's `theme-color` (browser chrome + PWA manifest).

### Secondary

- **Blue** (`#3d5266`): the settled/typed-metadata ink — due dates on card backs, filed items in the done stack. Never used for interactive elements; it marks information that is already resolved, in contrast to rust's "this needs you" register.

### Neutral

- **Ground** (`#eadfc6`) / **Ground Deep** (`#ddcda8`): the counter itself — page background and its darker variant used in the ambient wash gradient.
- **Card** (`#faf6ea`): card front surface, form surfaces, field backgrounds.
- **Card Back** (`#f2ead6`): the flipped card face and filed/done-stack item background — one step warmer-dim than the front, so a flipped or filed card reads as "the other side of the paper," not a new material.
- **Kraft** (`#ab8352`) / **Kraft Dark** (`#7c5c34`) / **Kraft Ink** (`#4a3620`): the tab-divider family — desktop spine background (kraft-dark), mobile bar top border and reserved-tab dividers (kraft), category-label ink (kraft-ink, e.g. shopping aisle headers).
- **Ink** (`#2a241c`) / **Ink Dim** (`#524a40`) / **Ink Faint** (`#686056`): the three-step text ramp — headings/primary content, secondary text (subtitles, dates), and tertiary/hint text (mono captions, "tap to flip").
- **Line** (`#d9c8a3`) / **Line Soft** (`#e6dabb`): card borders and the ruled-baseline stripe pattern respectively.
- **Error** (`#9a2c1d`): form validation and mutation failure text only — distinct from rust so a genuine error never reads as merely "due."

### Named Rules

**The Ink-Not-Border Rule.** Status (overdue, active) is carried by text color and a small corner stamp-dot, never a thick accent border competing with the card's rounded silhouette. See `FlipCard`'s `ACCENT_DOT` and `HeroCard`'s corner dot.

**The One Warm, One Cool Rule.** Rust marks what needs attention; blue marks what's already settled. No third status color exists in the shipped system — don't introduce one for a new state without collapsing it into this pair or arguing why it's exempt.

## Typography

**Display Font:** Architects Daughter (with Segoe Print, cursive fallback)
**Body Font:** Public Sans Variable (with Public Sans, system-ui, sans-serif fallback)
**Label/Mono Font:** JetBrains Mono Variable (with JetBrains Mono, ui-monospace, monospace fallback)

**Character:** A handwriting-adjacent display face reads as the household's own hand on every heading, paired with a clean grotesk for reading content and a mono face for anything that behaves like typed metadata (dates, status words, captions) — the three-way split keeps the handwritten face from ever being asked to carry a sentence of body prose.

### Hierarchy

- **Display / Headline** (400, `text-4xl`/`text-5xl` page titles down to `text-xl`/`text-2xl` section and card-title level, line-height ~1.2): `font-display`, every `<h1>`/`<h2>`/`<h3>` and hero-card title. Never used for body copy or form labels.
- **Body** (400, `text-sm`–`text-lg`): `font-sans` (the theme default), used for card front/back prose, empty-state copy, member lists.
- **Label** (400, `text-[11px]`–`text-xs`, tracking-wide, sometimes uppercase): `font-mono`, used for every piece of metadata — due dates, "OVERDUE"/"TODAY" status words, "tap to flip" captions, form field labels, the done-stack count line, mutation status text.

### Named Rules

**The Metadata-Is-Mono Rule.** Any text that reads as a system-generated fact rather than authored content — dates, statuses, counts, captions — renders in `font-mono` at a small tracked-out size. This is what makes the cardstock world read as "index cards," not "a form."

## Layout

Content stays spacious and card-based, never a dense data table — the brief's target range is ~3–8 open chores and ~5–15 shopping items for a 2-person household, and the layout doesn't try to accommodate more. `AppShell`'s `<main>` caps at `max-w-3xl`, centered, with `px-4 pt-8 pb-24` on mobile (bottom padding clears the fixed bottom nav bar) and `md:pt-10 md:pr-8 md:pb-10 md:pl-24` on desktop (left padding clears the fixed spine).

Navigation is a fixed spine, not in-flow chrome: a 4rem-wide (`w-16`) vertical bar pinned to the left edge on `md:` and up, replaced below that breakpoint by a fixed bottom bar. Both list the same modules in the same order.

The Today dashboard's card fan is the signature spatial pattern: on `md:` and up, secondary cards genuinely overlap (negative `-4.5rem` margin, descending scale 1 → 0.96 → 0.93 → 0.9, alternating small rotation, ascending z-index toward the front) rather than sitting in a same-plane row with a tilt effect; hovering a card lifts it to the front (`translateY(-6px) scale(1.02)`, z-index 10). Below `md:`, `.card-fan` drops to a plain vertical stack — the fan is a desktop-only affordance, mobile is an honest deck.

Grids elsewhere (occurrence cards, shopping items) use a plain 1-column mobile / 2-column (`sm:grid-cols-2`) desktop grid with `gap-4`; sections stack vertically with `gap-10` between them.

## Elevation & Depth

The system uses real shadows, warm-tinted to the kraft/ink palette rather than neutral gray, layered rather than flat. Depth is structural (it marks a card's position in the physical stack), not merely decorative hover polish.

### Shadow Vocabulary

- **Card** (`box-shadow: 0 1px 2px rgba(74,54,32,0.12), 0 8px 20px -6px rgba(74,54,32,0.28)`): the resting elevation for every card, form panel, and filed done-stack item.
- **Card Lifted** (`box-shadow: 0 4px 6px rgba(74,54,32,0.14), 0 20px 34px -10px rgba(74,54,32,0.38)`): the hero card at rest, and any card's hover/focus state — a deliberate step up, reinforcing "this card is now on top of the stack."
- **Spine** (`box-shadow: 2px 0 10px rgba(74,54,32,0.18)`): the fixed desktop spine and mobile bottom bar, separating persistent chrome from the scrolling content beneath it.

### Named Rules

**The Lift-On-Front Rule.** Elevation increases only when a card becomes (or is about to become) the frontmost thing — hover/focus on any card tile, and the hero card's permanent lifted shadow. Elevation is never used as ambient screen-wide decoration.

## Shapes

Two radius steps only: `--radius-card` (0.85rem) for every card, panel, and form section, and `--radius-tab` (0.5rem) for buttons, form fields, and small chip-like controls. Nothing in the shipped system uses a third radius or a fully square/fully pill corner. Card silhouettes are rounded-rectangle with a 1px `border-line` hairline; the ruled-baseline background-image (`repeating-linear-gradient`, a rule every 28px) renders on every card face regardless of which background color utility it layers over, and is the one recurring textured surface treatment in the system — nothing else in doma carries a pattern or texture.

## Components

### Buttons

- **Shape:** `rounded-tab` (0.5rem) on every button, no exceptions.
- **Primary:** `bg-rust` / `text-card`, `px-3–4 py-1–2`, `text-sm font-medium`, `disabled:opacity-50`. Used for the single most-committal action per surface (Sign in, Add chore, Add item, Generate invite code, Done).
- **Secondary / Ghost:** `border border-kraft` (or `border-kraft/50`), `text-ink`, transparent or `bg-card` fill. Used for the lower-commitment sibling action (Skip, Register).
- **Hover / Focus:** buttons don't carry a distinct hover treatment of their own beyond the shared `:focus-visible` rust outline (`2px solid var(--color-rust)`, `2px` offset) and browser default `:active`; the flip and card-lift interactions carry the system's motion budget, not button chrome.

### Cards / Containers

- **Corner Style:** `rounded-card` (0.85rem).
- **Background:** `bg-card` for the front/default face, `bg-card-back` for a flipped face and filed done-stack items.
- **Shadow Strategy:** `shadow-card` at rest, `shadow-card-lifted` on hover/focus or for the hero card (see Elevation & Depth).
- **Border:** `border border-line` (1px), or `border-kraft/40`–`/60` for the smaller filed/reserved-tab elements.
- **Internal Padding:** `p-5`–`p-8` for cards, `p-6` for form-panel sections.

### Inputs / Fields

- **Style:** the shared `.field` utility class — `bg-card`, `border border-line`, `rounded-tab`, `0.4rem 0.65rem` padding, `font-sans` at `0.9rem`. Never a bare browser-default input.
- **Focus:** border shifts to `border-rust` (no glow, no shadow change) plus the global `:focus-visible` outline.
- **Error / Disabled:** error text (not the field itself) renders in `text-error`, distinct from the rust "due/active" register. Disabled controls drop to `opacity-50`.

### Navigation

- **Desktop spine:** fixed left, `bg-kraft-dark`, `w-16`, each module tab is a 5rem-tall (`h-20`) vertical-text label (`writingMode: vertical-rl`) in `font-display text-card/90`; the active tab flips to horizontal text on a `bg-card`/`text-ink` panel. Reserved (not-yet-built) module slots render as blank `h-14` bands with a `border-y border-kraft/40` and only a screen-reader label — same visual weight as a real tab, deliberately not grayed or disabled-looking.
- **Mobile bottom bar:** fixed bottom, `bg-card`, `border-t-2 border-kraft`, evenly-split flex tabs in `font-display text-sm text-ink-dim`, active tab in `text-rust`. Reserved slots use the same blank treatment with `border-x border-kraft/40` dividers between them, so the bar's rhythm of dividers stays identical whether a slot is live or reserved.

### The Flip Card (signature component)

Every actionable item — a chore occurrence, a shopping item — is a `FlipCard`: front and back are two separately-focusable elements inside a `perspective`-transformed scene, not a single button with swapped content. Tapping the front runs a real 3D `rotateY(180deg)` transform over 0.55s (`cubic-bezier(0.2, 0.7, 0.2, 1)`), snapping instantly instead under `prefers-reduced-motion`. The front carries status (a `font-mono` label plus, for `accent="rust"`, a small corner stamp-dot) and a `tap to flip — {label}` mono hint; the back carries assignee/detail and the actions (Done/Skip, remove, checkbox), plus any `MutationStatus`. Front and back are genuinely different card-back-colored materials (`bg-card` vs `bg-card-back`), not a re-skinned front.

### The Done Stack (signature component)

Completed/skipped items file face-down into a `DoneStack` instead of disappearing: a toggle button showing two overlapping card-back rectangles (rotated ±6–12°, `bg-card-back`/`bg-card`) plus a mono count line ("N filed — riffle through"). Expanding it reveals each item as a small `font-mono text-blue` slip, alternately rotated ±0.5° so the pile reads as genuinely riffled paper, not a clean list.

### Mutation Status (signature component)

A shared, wordless-by-default status line for offline/failed writes: silent on success, `text-rust-ink` "not saved — retrying…" while an automatic retry is in flight, `text-error` with the server's message on hard failure. Never a toast, never a spinner — the honesty is carried entirely in mono text adjacent to the action that failed.

## Do's and Don'ts

### Do:

- **Do** keep the display face (Architects Daughter) to headings only; route every metadata, date, status, and caption string through `font-mono`.
- **Do** carry status through ink color and a small corner dot, matching the shipped rust-overdue / blue-settled pair — don't add a third status color without collapsing it into this system.
- **Do** use warm, kraft/ink-tinted shadow color (`rgba(74,54,32,…)`) for any new elevation, never neutral gray.
- **Do** render a not-yet-built module as a blank, same-weight reserved tab (spine band or bar slot with only a screen-reader label) — never gray it out, disable-style it, or hide it.
- **Do** keep the ruled-baseline background-image as the system's only texture; it belongs on card faces (front and back), not as a general decorative device.
- **Do** use the two-step radius scale only (`rounded-tab` 0.5rem for controls, `rounded-card` 0.85rem for cards/panels) — no third radius.

### Don't:

- **Don't** put the primary flow inside a sidebar-and-card-grid dashboard layout. The tab spine plus card-fan/deck is the system's only navigation-plus-content topology; a settings-style two-pane admin layout is out of world.
- **Don't** fade a card flip or a live-update settle. Both have named, deliberate motion (a real 3D rotate; a View Transitions crossfade), never a plain opacity fade, and both must respect `prefers-reduced-motion` by snapping instead of animating.
- **Don't** hard-delete a completed item from view. It files into a `DoneStack`; the interaction vocabulary has no "vanish" state for finished work.
- **Don't** use the ambient time-of-day wash for anything but atmosphere — it must never be the only signal for a state or a piece of information (per the direction brief's own raise).
