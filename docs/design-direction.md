# doma — Visual Direction Brief

Locked via `/impeccable shape doma` (Milestone 0), mode **Operate**, direction-seed key
`fb35f7a9`. This brief is the design contract M1–M4 build against neutrally and M5 onward
builds *into* directly — the anchor surface described here (the app shell / Today dashboard)
is the first UI written once M4's household/module foundation exists.

## 1. Job and audience

Stefan and his girlfriend, running one shared household, reach doma dozens of times a day in
short bursts — glancing at what's due while making coffee, ticking a chore off mid-errand,
checking the shopping list while actually standing in the shop. Visitor mode is **Operate**:
they're completing a task, not being persuaded or entertained. Nothing here is public-facing —
there is no marketing surface to design.

## 2. Outcome and proof

Primary task: see what's due/assigned today across every active module (chores + shopping at
v1) and act on it in one tap. Success is daily habitual use — the app has to feel like *theirs*,
not like logging into a work tool. Real evidence at v1: none yet (greenfield) — no fabricated
testimonials, benchmarks, or sample "family" data; empty/first-run states are real content, not
filler.

## 3. Selected direction — The Recipe Box

**World:** doma reads as the household's own recipe/index-card file box on the counter. Cream
cardstock cards under tabbed kraft dividers, a rust/terracotta ink for what's active or due, a
quiet graphite-blue for settled/typed metadata, ruled baseline lines, a rounded-corner card
silhouette. Category tabs run down one edge — *Chores*, *Shopping*, and honest blank tabs
reserved for *Meals*, *Bills*, *Maintenance* — making doma's real architecture (a module is a
new folder, never a redesign) physically legible as "a box that grows one divider at a time."

**Structural/interaction thesis:** the box, not a dashboard. Nav is the tab spine. A "screen" is
a stack of cards you flip through.

**First viewport (Today dashboard):** the box open, a hero card pulled furthest forward (the
single most urgent thing across every module), the rest of today's cards fanned behind it,
tab spine along the left edge with the reserved future tabs visible but unlabeled-blank —
foreshadowed, never oversold.

**Signature interaction — the flip:** tapping a card flips it like a real index card (assignee
and detail on the back). Completing an item doesn't delete the card — it files face-down into a
"done" stack you can still riffle through.

**Focal moment:** a live update arriving from the other person mid-glance — the card settles
into its new state with an unhurried, disciplined cascade (never an abrupt snap), so "my
partner just checked this off while I was looking at it" is the moment this direction is built
to show off.

**Raises carried into the build** (each donated by a challenger weighed and set aside during the
direction round — see §7 for the full record):
- *Cascade discipline* (declined: rail-concourse split-flap board) — any live SSE update settles
  with the same unhurried, disciplined per-character cascade a departure board gives, never an
  abrupt snap.
- *Ambient time-of-day wash* (declined: stage cyclorama) — the box's background tint shifts
  gently with real local time, atmosphere only, never load-bearing for meaning or state.
- *Stamp, don't delete* (competitive: jet-age ticket wallet) — completed and skipped occurrences
  are stamped/filed, never hard-deleted from view, matching doma's own append-only activity log
  (§5.3 of the execution plan).

**Implementation consequence:** the "done" stack and the flip-to-reveal-detail pattern want a
real per-item flip/settle transition (not a fade), and the reserved-but-blank future tabs need
to render honestly empty rather than disabled/greyed — both are named here so the eventual build
doesn't quietly simplify them away.

## 4. Scope and boundaries

- **Fidelity/breadth at this milestone:** brief only — no code, no comp, no direction-contract
  HTML comment yet (nothing exists to write it into). The anchor surface for the eventual first
  build is the authenticated app shell + Today dashboard; auth screens and settings inherit this
  world once built, not designed separately now.
- **What remains untouched:** none — greenfield, nothing incumbent to preserve.
- **Explicit anti-goals (user-set boundary, all three apply):** not corporate/SaaS — no
  sidebar-and-card-grid dashboard genre furniture; not clinical — warm and domestic, not a
  productivity tool wearing a home skin; nothing like Authos — deliberately distinct from that
  project's teal/cyan dark identity, doma reads as its own thing.
- **Also explicitly avoided:** twee/scrapbook cuteness (no rounded mascot ink, no pastel bubble
  aesthetic — the predictable opposite of "corporate," equally ruled out) and the cream-paper/
  bookish-serif default this exact kind of warm/domestic/family brief reaches for by habit (see
  the declined Botanical Folio challenger, §7) — the palette above is cardstock-cream-plus-rust/
  kraft, not cream-plus-serif-plus-lamplight.

## 5. States and ranges

- **Content density:** light — realistically ~3–8 open chores and ~5–15 shopping items at a
  time for a 2-person household (user-confirmed). Design stays spacious; this is not a
  dense-data-table surface.
- **Material states:** first-run/empty (a genuinely empty box — an honest empty tab, not a
  placeholder illustration), loading, a completed item filed face-down, an overdue item (warning
  ink on the card edge), the offline **"not saved — retrying"** mutation state (plan §5.7 — cache
  reads, but a failed write must say so, never pretend), and the live-update settle described in
  §3.
- Accessibility: no household-specific requirement (confirmed with the user) — build to ordinary
  web/PWA baseline (contrast, keyboard nav, screen-reader basics).

## 6. Interaction and layout

- **Topology:** tab spine = primary nav between modules; within a module, a stack/fan of cards.
- **Responsiveness:** phone-first — the box becomes a single stacked deck on mobile, tabs
  collapse to a bottom/side selector; comp aspect for any future visual round is portrait,
  device-viewport (this is a mobile-first PWA, not desktop web).
  the reserved future-module tabs render at the same weight as active ones, just empty.
- **Feedback:** the flip is the primary affordance for "see more / act on this"; the done-stack
  is the feedback for completion (filed, not vanished).

## 7. Constraints and open decisions

- **Stack constraint:** built in Tailwind v4 + shadcn/ui + Radix (house convention, plan §4) —
  the recipe-box world is a full re-skin on top of those primitives, not a stock shadcn look;
  a stock component inside this world is a lapse per impeccable's own craft floor.
- **Build path:** code-led (no image-generation tool available in this environment) — no comp
  round happened or is owed; the ambition above (first viewport + signature interaction) is what
  the eventual finish review audits against, in behavior.
- **Open for the actual build session:** exact type faces (a drafting/handwriting-adjacent
  display face for headers, a clean grotesk/mono for metadata — not yet measured/chosen), exact
  hex values beyond the direction's palette family, the precise flip/settle motion timing.
  DESIGN.md itself is written at finish, from the built world, not authored now.

---

### Direction-round record (for audit — not needed to build)

Assigned candidate #7 of 7 grounded household-object directions (roll, not rank): The Recipe
Box. My own top-ranked candidate (offered as **Impeccable's Pick**, not built): The Kitchen
Whiteboard — the fridge chalkboard, declined by the user as the safer/more expected household-
app reading. One catalog challenger scored **competitive** (Jet-Age Ticket Wallet, wins on
product clarity, loses on domestic identification — raise donated into §3). Four catalog
challengers scored **declined** (Rail Concourse Split-Flap, Variable Font Specimen, Stage
Cyclorama Dawn, Iridescent Cloud Edge, Botanical Folio) — one raise recovered from Split-Flap and
one from Cyclorama, both folded into §3; Botanical Folio's decline is recorded because it named
the cream/bookish rut this direction deliberately avoids. The category-standard door (a
conventional productivity dashboard) was offered and not taken.
