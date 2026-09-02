# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TanStack Start (React 19, Vite, Nitro) · Postgres via Drizzle ORM · Tailwind v4 +
shadcn/ui + Radix + lucide-react · Zod for server-function validation · Vitest + Playwright
for testing. Locked during planning (not delegated) — see the execution plan for the full
rationale (Drizzle over Prisma specifically to make the module contract possible).

## Users

Two people: Stefan and his girlfriend, running one shared household together. They need a
private, always-available place to coordinate day-to-day home logistics — starting with chores
and shopping — without spreadsheets, sticky notes, or a consumer app built for a different
household shape. Installed on their phones (at least one is an iPhone) as a PWA, used in short,
frequent bursts (checking a list while at the shop, ticking off a chore, seeing what's due).

## Product Purpose

doma is the central hub for everything about their home. Chores and shopping are the first two
things it does, not the whole of what it is meant to be — meals/recipes, bills/subscriptions,
and maintenance/documents are explicitly planned follow-on modules. Success means the two of
them actually keep using it day to day: chores recur and get assigned without manual re-entry,
shopping lists update live while they're both in the shop, and a Telegram nudge lands before
something is due.

## Positioning

doma is the central hub for everything about the home — not a single-purpose chore app or
shopping-list app. Its meaningfully different mechanism is architectural: a module contract
(manifest + registry) and a shared spine (households, recurrence, reminders, live sync) make
adding the next household concern — meals, bills, maintenance — cheap, so the product can
genuinely grow into "everything about the home" instead of staying scoped to whatever shipped
first. A generic chore app or shopping app could not truthfully make that claim, because it
wasn't built to extend.

## Operating Context

- Runs at `https://doma.tosak.net`, self-hosted on the user's existing Hetzner k8s cluster.
- Installed as a PWA on both their phones; used mid-errand (in the shop), at home, and
  throughout the day for quick chore/shopping checks.
- Private to one household today, but every row is household-scoped from the first migration —
  a second household costs nothing structurally, even though there is currently no plan to
  onboard one.
- Household timezone defaults to Europe/Skopje.
- Notifications arrive via Telegram (no Web Push — at least one iPhone in the household, and
  iOS PWA Web Push needs home-screen install and fails silently otherwise).
- Reads work offline (cached shell + last-known data); mutations require connectivity and say
  so honestly rather than pretending to save.

## Capabilities and Constraints

**v1 modules:** Chores (recurring: once/daily/weekly/monthly; fixed or rotating assignment;
due dates; generates dated occurrences) and Shopping (lists, categories/aisle order, checked
items, recently-bought re-add).

**Planned, explicitly accommodated but not built in v1:** meals + recipes (including
cross-module writes: a meal plan can write to the shopping list), bills + subscriptions,
maintenance + documents (needs file storage).

**Auth:** doma owns its own authentication — email + password, plus Google OAuth. Registration
is invite-only: the first user in an empty database bootstraps and becomes owner; everyone
after needs a valid invite code. No email-sending dependency in v1 — account recovery is via
Google sign-in or an owner-issued reset link from the members screen.

**Access model:** per-household module toggles (`household_modules`) — a household can hide
modules it doesn't use.

**Live sync:** one SSE stream per household, mapped to client-side query invalidation. No
websocket infrastructure.

**Constraint — public repository:** the source at `stevetosak/doma` is public. No secrets,
`.env` values, or real household data may ever be committed; this is an ongoing discipline
requirement, not a one-time setup step.

**Constraint — small team, small scale:** built and operated by one person for a two-person
household. Proportionate engineering throughout, except auth and the recurrence engine, which
are deliberately over-engineered relative to the app's size because "mostly right" is
worthless there.

## Evidence on Hand

None yet — doma is a greenfield build. No existing screens, copy, testimonials, or brand
assets exist to draw on; nothing here should be treated as inherited visual or content truth.

## Product Principles

- The architecture must accommodate future modules (meals, bills, maintenance), not build them
  now — the two v1 modules stay deliberately small so the pattern proves itself cheaply.
- Be honest about connectivity: cached reads are fine, but a write that didn't save must say so
  rather than pretend.
- Tenancy is structural, not disciplinary — every table and every code path assumes
  `household_id` from day one, even with a single household in production.
- Reliability over cleverness in the two places where "mostly right" fails a real household:
  authentication and the recurrence engine (chore scheduling).
- The product exists to be used daily by two specific people, not to attract or scale to
  strangers — invite-only, no growth mechanics, no public-facing marketing surface.

## Accessibility & Inclusion

No household-specific requirement. Build to ordinary web/PWA accessibility baseline (contrast,
keyboard navigation, screen-reader basics) — confirmed with the user, not a default assumed in
the absence of an answer.
