# doma

Everything for my household in one place — chores, shopping, and (later) meals, bills, and
maintenance, in one shared PWA.

Built with [TanStack Start](https://tanstack.com/start) (React 19), [Tailwind CSS
v4](https://tailwindcss.com/), and [Drizzle ORM](https://orm.drizzle.team/) on Postgres. See
`docs/design-direction.md` for the locked visual direction and `PRODUCT.md` for the product
record.

## Getting started

Requires Node 22 (`.nvmrc`) and Docker for local Postgres.

```bash
nvm use
cp .env.example .env.local   # then adjust if you changed docker-compose.yml's credentials
docker compose up -d         # starts local Postgres
npm install
npm run db:migrate           # applies migrations, safe to run repeatedly
npm run dev                  # http://localhost:3000
```

## Scripts

```bash
npm run dev          # dev server
npm run build         # production build
npm run start          # run the production build (runs migrations first, then serves)
npm run test           # unit tests (vitest)
npm run lint            # eslint
npm run format           # prettier --write + eslint --fix
npm run check             # prettier --check
npm run db:generate        # generate a migration from src/core/db/schema.ts
npm run db:migrate          # apply pending migrations (advisory-lock guarded, idempotent)
npm run db:studio            # Drizzle Studio
```

## Routing

File-based routing via TanStack Router — routes live under `src/routes/`. Server routes
(`src/routes/api/**`) use the `server: { handlers: {...} } }` option on `createFileRoute`. After
adding or removing route files, regenerate the route tree:

```bash
npm run generate-routes
```

## Health checks

- `GET /api/health/live` — liveness. Process-only, never touches Postgres.
- `GET /api/health` — readiness. Checks the Postgres connection, returns 503 if it's down.

## Deploying with Nitro

```bash
npm run build
npm run start
```

`start` runs `scripts/start.mjs`, which applies pending migrations behind a Postgres advisory
lock before serving traffic — the same runner `npm run db:migrate` uses. The build output is a
self-contained Node server; see [Nitro's deployment docs](https://v3.nitro.build/deploy) for
host-specific presets.
