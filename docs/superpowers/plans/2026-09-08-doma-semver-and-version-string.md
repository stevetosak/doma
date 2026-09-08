# doma — semantic versioning and git-describe version string — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give doma a `release-please` release line (`vX.Y.Z` tags + GitHub Releases + `CHANGELOG.md`) and make the app display a `git describe` version string (`v0.3.0` on a release commit, `v0.3.0-5-gabc1234` between) in place of the bare 7-char git sha.

**Architecture:** `release-please` (config + manifest + its own workflow) reads the existing Conventional Commits and maintains a rolling release PR; merging it tags and releases. Separately, `deploy.yaml` gains a full-history checkout and a `git describe` step that bakes `APP_VERSION` into the image; a small pure `src/core/version.ts` module is the single read point, consumed by the footer (`AppShell`) and `/api/health`. The deploy mechanism, image tag (`alpha-<sha>`), and infra overlay `newTag` are unchanged — semver is additive.

**Tech Stack:** `googleapis/release-please-action@v4`; GitHub Actions; `git describe`; TanStack Start / Vitest (`node:test` environment); Docker multi-stage build.

**Spec:** `docs/superpowers/specs/2026-09-08-deploy-notify-and-versioning-design.md` (same repo, alongside this plan). Read the "Component B", "Component D", and "Decisions" sections.

**Working repo:** the `doma` repo, `/home/stevetosak/Projects/doma`. All paths are relative to it.

## Global Constraints

- **`main` is prod. Every change via a PR. Never push direct to `main`.** Branch: `git switch -c feat/semver-and-version-string origin/main` (fetch first).
- **Commit messages:** one concise subject line, Conventional-Commits prefix (`feat:` / `fix:` / `build:` / `ci:` / `refactor:`). No `Co-Authored-By` footer, no `Claude-Session` footer. PR body: no Claude session URL.
- **Full verification before "done" is `tsc` + `lint` + `check` + `test` — four commands.** `npm run check` is `prettier --check .` and is a _separate_ gate from the others; it has broken `main` twice when skipped. Run all four:
  `npx tsc --noEmit && npm run lint && npm run check && npm run test`
- **Path alias:** `#/` resolves to `src/` (e.g. `#/core/env`).
- **doma tags today:** `v0.1.0`, `v0.2.0` — hand-cut milestone anchors. `release-please` reads `.release-please-manifest.json`, not the tag list, so seeding the manifest at `0.2.0` makes the next release `v0.3.0`. `git describe --match 'v[0-9]*'` already resolves against these (`git describe` on `main` today → `v0.2.0-<n>-g<sha>`).
- **No new npm dependency.** `release-please` runs entirely in CI via the action.
- **Known cosmetic effect (do not try to fix in this plan):** `release-please.yml` and `deploy.yaml` both run on the release-PR merge commit. If the deploy build's `git describe` runs before `release-please` pushes the new tag, that one build shows `v0.3.0-1-g<sha>` rather than the bare `v0.3.0`. The string is still correct; the next commit shows `v0.3.0-2-g...`. Coupling the two workflows is explicitly rejected (adds a failure mode to the deploy path for a cosmetic gain).

---

## File Structure

| Path                                   | Change | Responsibility                                                                                                                           |
| -------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/version.ts`                  | Create | Pure `appVersion(env?)` — the single read point for the display version.                                                                 |
| `src/core/version.test.ts`             | Create | `appVersion` specs.                                                                                                                      |
| `src/core/version.functions.ts`        | Modify | `getAppVersion` server fn → returns `appVersion()`. Drop the `GIT_SHA` / `.slice(0,7)` logic and the `optionalEnv` import if now unused. |
| `src/routes/api/health/index.ts`       | Modify | `version` field → `appVersion()` (currently reads `GIT_SHA` directly).                                                                   |
| `Dockerfile`                           | Modify | `ARG GIT_SHA` / `ENV GIT_SHA` → `ARG APP_VERSION=dev` / `ENV APP_VERSION=$APP_VERSION`; update the comment.                              |
| `.github/workflows/deploy.yaml`        | Modify | `build-push` checkout `fetch-depth: 0`; new `git describe` step; build-arg `GIT_SHA` → `APP_VERSION`.                                    |
| `release-please-config.json`           | Create | Single-package `node` release config + changelog sections.                                                                               |
| `.release-please-manifest.json`        | Create | `{ ".": "0.2.0" }`.                                                                                                                      |
| `.github/workflows/release-please.yml` | Create | `push: [main]` → `release-please-action@v4`.                                                                                             |
| `package.json`                         | Modify | Add `"version": "0.2.0"` (the `node` release strategy manages this field; it is absent today).                                           |

`AppShell.tsx` and `__root.tsx` are **not** modified — they already render `context.version` verbatim; only the value changes.

---

## Task 1: The `version.ts` read point

**Files:**

- Create: `src/core/version.ts`
- Create: `src/core/version.test.ts`
- Modify: `src/core/version.functions.ts`
- Modify: `src/routes/api/health/index.ts:15-16` (the `GET` handler's `version` line)

**Interfaces:**

- Produces: `appVersion(env?: NodeJS.ProcessEnv): string` — returns `env.APP_VERSION` when set and non-blank, else `'dev'`. Default arg `process.env`. No truncation (the value is already a `git describe` string).
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

`src/core/version.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { appVersion } from './version'

describe('appVersion', () => {
  it('returns APP_VERSION when set', () => {
    expect(appVersion({ APP_VERSION: 'v0.3.0-5-gabc1234' })).toBe(
      'v0.3.0-5-gabc1234',
    )
  })

  it('returns a bare release tag unchanged', () => {
    expect(appVersion({ APP_VERSION: 'v0.3.0' })).toBe('v0.3.0')
  })

  it('falls back to "dev" when unset', () => {
    expect(appVersion({})).toBe('dev')
  })

  it('falls back to "dev" when blank/whitespace', () => {
    expect(appVersion({ APP_VERSION: '  ' })).toBe('dev')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/version.test.ts`
Expected: FAIL — `Cannot find module './version'`.

- [ ] **Step 3: Implement `src/core/version.ts`**

```ts
/**
 * The version string the app shows in its footer and `/api/health`.
 *
 * `APP_VERSION` is a `git describe --tags` string baked into the image at
 * Docker build time (see the Dockerfile `ARG` and `deploy.yaml`). It reads
 * `v0.3.0` on a release commit and `v0.3.0-5-gabc1234` a few commits later —
 * semver first, the commit as a suffix. Unset (a local `docker build` or
 * `npm run dev`) falls back to `dev`.
 */
export function appVersion(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.APP_VERSION
  return v && v.trim() !== '' ? v : 'dev'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/version.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Rewire `src/core/version.functions.ts`**

Replace the file body with:

```ts
import { createServerFn } from '@tanstack/react-start'
import { appVersion } from '#/core/version'

/**
 * `APP_VERSION` is baked into the image at Docker build time — see
 * `src/core/version.ts` and `deploy.yaml`. Not something a local `.env`
 * sets, hence the `'dev'` fallback in `appVersion`.
 */
export const getAppVersion = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ version: string }> => {
    return { version: appVersion() }
  },
)
```

- [ ] **Step 6: Rewire `src/routes/api/health/index.ts`**

In the `GET` handler, change:

```ts
const version = optionalEnv('GIT_SHA', 'dev').slice(0, 7)
```

to:

```ts
const version = appVersion()
```

Update the imports at the top of the file: remove `import { optionalEnv } from '#/core/env'` **only if `optionalEnv` is now unused elsewhere in the file** (grep it); add `import { appVersion } from '#/core/version'`.

- [ ] **Step 7: Full verification**

Run: `npx tsc --noEmit && npm run lint && npm run check && npm run test`
Expected: all four pass. (If `npm run check` flags the new/edited files, run `npm run format` then re-run all four.)

- [ ] **Step 8: Manually confirm the wiring**

Run:

```bash
APP_VERSION=v9.9.9-test npx vitest run src/core/version.test.ts >/dev/null && \
node -e "process.env.APP_VERSION='v9.9.9-test'; import('./src/core/version.ts').then(m=>console.log(m.appVersion()))" 2>/dev/null || true
```

Expected: no error. (The real end-to-end check is Task 5 Step 3 against a built image.)

- [ ] **Step 9: Commit**

```bash
git add src/core/version.ts src/core/version.test.ts src/core/version.functions.ts src/routes/api/health/index.ts
git commit -m "refactor: single appVersion() read point for footer and health"
```

---

## Task 2: Dockerfile build arg

**Files:**

- Modify: `Dockerfile` (the `ARG GIT_SHA` / `ENV GIT_SHA` block, ~lines 14-18)

**Interfaces:**

- Consumes: `--build-arg APP_VERSION=<git describe string>` from `deploy.yaml` (Task 3). Absent for a local `docker build` → `dev`.
- Produces: `ENV APP_VERSION` in the runtime image, read by `src/core/version.ts`.

- [ ] **Step 1: Edit the Dockerfile**

Replace:

```dockerfile
# The deployed commit, surfaced in /api/health and the app's own footer
# (src/core/version.functions.ts) — passed via --build-arg in deploy.yaml,
# unset (falls back to "dev") for a local `docker build`.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
```

with:

```dockerfile
# The deployed version string (a `git describe --tags` value), surfaced in
# /api/health and the app's own footer via src/core/version.ts — passed as
# --build-arg APP_VERSION in deploy.yaml, unset (falls back to "dev") for a
# local `docker build`.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
```

- [ ] **Step 2: Verify the build still works and the default is `dev`**

Run:

```bash
docker build -t doma:verstest . && \
docker run --rm --entrypoint sh doma:verstest -c 'echo "APP_VERSION=$APP_VERSION"'
```

Expected: build succeeds; prints `APP_VERSION=dev`.

- [ ] **Step 3: Verify a passed build-arg lands**

Run:

```bash
docker build --build-arg APP_VERSION=v0.3.0-5-gabc1234 -t doma:verstest2 . && \
docker run --rm --entrypoint sh doma:verstest2 -c 'echo "$APP_VERSION"'
```

Expected: prints `v0.3.0-5-gabc1234`.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "build: bake APP_VERSION build-arg into the image (was GIT_SHA)"
```

---

## Task 3: `deploy.yaml` — git describe into the build

**Files:**

- Modify: `.github/workflows/deploy.yaml` — the `build-push` job only (`check` and `deploy` unchanged).

**Interfaces:**

- Consumes: the `v0.1.0` / `v0.2.0` tags (and future `release-please` tags) present after a full-history checkout.
- Produces: `--build-arg APP_VERSION=<git describe>` into `docker/build-push-action`.

- [ ] **Step 1: Full-history checkout in `build-push`**

In the `build-push` job, change its first step from:

```yaml
steps:
  - uses: actions/checkout@v4
```

to:

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
```

(`fetch-depth: 0` fetches all history **and** all tags — `git describe` needs both. The `check` job's checkout is left shallow.)

- [ ] **Step 2: Add the version-resolve step**

Immediately after the checkout step, before `Login to Docker Hub`, insert:

```yaml
- name: Resolve version string
  id: ver
  run: |
    APP_VERSION=$(git describe --tags --always --match 'v[0-9]*')
    echo "APP_VERSION=$APP_VERSION" >> "$GITHUB_OUTPUT"
    echo "Resolved APP_VERSION=$APP_VERSION"
```

- [ ] **Step 3: Swap the build-arg**

In the `Build & push Docker image` step, change:

```yaml
build-args: |
  GIT_SHA=${{ github.sha }}
```

to:

```yaml
build-args: |
  APP_VERSION=${{ steps.ver.outputs.APP_VERSION }}
```

- [ ] **Step 4: Validate the workflow YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yaml'))" && echo OK`
Expected: `OK`. (No `python3`? `npx --yes yaml-lint .github/workflows/deploy.yaml`.)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yaml
git commit -m "ci: resolve APP_VERSION via git describe and pass to the build"
```

---

## Task 4: release-please

**Files:**

- Create: `release-please-config.json`
- Create: `.release-please-manifest.json`
- Create: `.github/workflows/release-please.yml`
- Modify: `package.json` — add `"version": "0.2.0"`

**Interfaces:**

- Consumes: the Conventional Commits already on `main`.
- Produces: a rolling release PR; on its merge, a `vX.Y.Z` git tag, a GitHub Release, and `CHANGELOG.md` updates. The tag is what `git describe` (Task 3) and the infra catalog resolver read.

- [ ] **Step 1: Add `version` to `package.json`**

Add a top-level `"version": "0.2.0"` field (the `node` release strategy reads and bumps it; it is absent today). Put it just after `"name"` if present, else at the top of the object. Then:

Run: `npm install --package-lock-only`
Expected: `package-lock.json` gains `"version": "0.2.0"` under `packages[""]`. Commit both.

- [ ] **Step 2: Create `release-please-config.json`**

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "release-type": "node",
  "include-component-in-tag": false,
  "bump-minor-pre-major": true,
  "bump-patch-for-minor-pre-major": false,
  "packages": {
    ".": {}
  },
  "changelog-sections": [
    { "type": "feat", "section": "Features" },
    { "type": "fix", "section": "Fixes" },
    { "type": "perf", "section": "Performance" },
    { "type": "refactor", "section": "Refactors" },
    { "type": "docs", "section": "Docs", "hidden": true },
    { "type": "chore", "section": "Chores", "hidden": true },
    { "type": "ci", "section": "CI", "hidden": true },
    { "type": "build", "section": "Build", "hidden": true },
    { "type": "test", "section": "Tests", "hidden": true }
  ]
}
```

- [ ] **Step 3: Create `.release-please-manifest.json`**

```json
{
  ".": "0.2.0"
}
```

- [ ] **Step 4: Create `.github/workflows/release-please.yml`**

```yaml
name: release-please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-22.04
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

- [ ] **Step 5: Validate JSON + YAML**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('release-please-config.json'))" && \
node -e "JSON.parse(require('fs').readFileSync('.release-please-manifest.json'))" && \
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release-please.yml'))" && echo OK
```

Expected: `OK`.

- [ ] **Step 6: Full verification (config files must pass `npm run check`)**

Run: `npm run check`
Expected: pass. If Prettier reformats the new JSON/YAML, run `npm run format` and re-stage.

- [ ] **Step 7: Commit**

```bash
git add release-please-config.json .release-please-manifest.json .github/workflows/release-please.yml package.json package-lock.json
git commit -m "ci: release-please for semantic version tags and releases"
```

---

## Task 5: Verification and PR

**Files:** none.

- [ ] **Step 1: Full local verification pass**

Run: `npx tsc --noEmit && npm run lint && npm run check && npm run test`
Expected: all green. Record the test count.

- [ ] **Step 2: Built-image version check (the real end-to-end)**

```bash
VER=$(git describe --tags --always --match 'v[0-9]*')
echo "git describe -> $VER"
docker build --build-arg APP_VERSION="$VER" -t doma:vercheck .
docker run --rm --entrypoint sh doma:vercheck -c 'echo "$APP_VERSION"'
```

Expected: both print the same non-`dev` string, e.g. `v0.2.0-88-g<sha>`.

- [ ] **Step 3: Confirm the app surfaces it**

Start the built image against the local compose Postgres (same pattern as prior milestones — see `projects/doma/web/README.md` in the infra repo for the connection string), then:

```bash
curl -s localhost:3000/api/health | node -e 'process.stdin.once("data",d=>console.log(JSON.parse(d).version))'
```

Expected: the `git describe` string (not a 7-char sha, not `dev`). Also load `/` in a browser or `curl -s localhost:3000/ | grep -o 'doma · [^<]*'` and confirm the footer shows the same string.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/semver-and-version-string
gh pr create --base main --title "Semantic versioning and git-describe version string" --body "$(cat <<'EOF'
Implements the doma half of `docs/superpowers/specs/2026-09-08-deploy-notify-and-versioning-design.md`.

- `release-please` (config + manifest + workflow) — rolling release PR, `vX.Y.Z` tags + GitHub Releases + `CHANGELOG.md`, continuing from `v0.2.0` (next release `v0.3.0`).
- App version display switches from the bare 7-char git sha to a `git describe --tags` string (`v0.3.0` on a release commit, `v0.3.0-5-gabc1234` between) via a new pure `src/core/version.ts` read point used by both the footer and `/api/health`.
- `Dockerfile` `GIT_SHA` -> `APP_VERSION`; `deploy.yaml` `build-push` gets a full-history checkout + a `git describe` step.
- No change to the deploy mechanism, the image tag (`alpha-<sha>`), or the infra overlay.

Known cosmetic effect: the release-PR merge commit's own deploy build may show `vX.Y.Z-1-g<sha>` if `git describe` runs before `release-please` pushes the tag — self-corrects on the next commit.

Verified locally: `tsc`/`lint`/`check`/`test` green; built image reports the `git describe` string from `/api/health` and the footer.
EOF
)"
```

- [ ] **Step 5: Post-merge checks**

After the user merges:

- `deploy.yaml` run on the merge commit is green; the `Resolve version string` step logs a `v0.2.0-<n>-g<sha>` value.
- `https://doma.tosak.net/api/health` `version` is that string (allow a minute for the `Recreate` rollout).
- The footer on `https://doma.tosak.net` shows the same.
- A `release-please` PR titled `chore(main): release 0.3.0` appears (once any `feat:`/`fix:` commit is on `main` after this merge).
- Update memory `project_deploy_notify_versioning.md` and `~/.claude/rules/memory-sessions.md`.

---

## Self-Review

**Spec coverage (Component B + Component D + Decisions):**

- Component B — doma `release-please`, `release-type: node`, manifest starts `0.2.0`, next `v0.3.0`, `.github/workflows/release-please.yml` → Task 4. ✅
- Component B note "`package.json` version is bumped by the release PR; display-only" → Task 4 Step 1 adds the field. ✅
- Component D — `Dockerfile` `ARG APP_VERSION` (Task 2); `deploy.yaml` `fetch-depth: 0` + `git describe` + build-arg (Task 3); `version.functions.ts` returns the whole string (Task 1 Step 5); `health/index.ts` `GIT_SHA` → `APP_VERSION` **[this file reads the env directly, flagged in the spec self-review]** (Task 1 Step 6); `AppShell.tsx` unchanged (File Structure note). ✅
- Decision 8d "continue from `v0.2.0`" → manifest `{".":"0.2.0"}` (Task 4 Step 3). ✅
- Testing — "a doma test asserts the CI step yields a non-`dev` string" → Task 5 Step 2 (build-image check); "a snapshot of the AppShell footer" → downgraded to Task 5 Step 3's live footer grep, because `AppShell` reads router context via `useRouteContext({ from: '__root__' })` and a meaningful snapshot needs the whole router harness — not worth a brittle test for an unchanged component; the value path is covered by `version.test.ts`. ✅ (documented deviation)

**Placeholder scan:** no `TODO`/`TBD`/"handle errors". Task 1 Step 6 has a conditional instruction ("only if `optionalEnv` is now unused") with the exact check named (`grep`) — that is a real instruction, not a placeholder.

**Type consistency:** `appVersion(env?: NodeJS.ProcessEnv): string` — identical in `version.test.ts`, `version.ts`, and both call sites (`version.functions.ts`, `health/index.ts`). `getAppVersion` still returns `{ version: string }` (unchanged shape — `__root.tsx` and `AppShell` keep working). Build-arg name `APP_VERSION` is identical across `Dockerfile`, `deploy.yaml` Task 3 Step 3, and the `docker build --build-arg` verification commands. `git describe --tags --always --match 'v[0-9]*'` is the exact same invocation in Task 3 Step 2 and Task 5 Step 2, and matches the infra plan's `describeVersion` (`--match "<tagPrefix>[0-9]*"` with `tagPrefix: "v"`).
