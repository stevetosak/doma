# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# The deployed commit, surfaced in /api/health and the app's own footer
# (src/core/version.functions.ts) — passed via --build-arg in deploy.yaml,
# unset (falls back to "dev") for a local `docker build`.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

# scripts/start.mjs and scripts/migrate.mjs run outside the Nitro bundle
# (plain, unbundled ESM — see their own comments), so they need a real
# node_modules for dotenv/pg/drizzle-orm. .output/ itself is already
# self-contained (Nitro traces and copies in native deps like
# @node-rs/argon2 during the build).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/drizzle ./drizzle

# Numeric UID — a named user breaks Kubernetes' runAsNonRoot check, which
# can't verify a non-root user by name alone.
USER 10001

EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
