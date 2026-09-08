# Infra — deploy-live notifications and version catalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When ArgoCD reports an app `Synced` and `Healthy` on a new revision, send a Telegram message, append a row to a version catalog in git, and mark a GitHub Deployment `success` on the app repo.

**Architecture:** ArgoCD Notifications (`on-deployed` trigger, `oncePer: sync.revision`) fires one `webhook` notification → a GitHub `repository_dispatch` on the infra repo → one GitHub Actions workflow (`deploy-catalog.yml`) resolves the running image tag to a `git describe` semver, appends `deployments/history.jsonl` (`merge=union`), regenerates `deployments/CATALOG.md`, creates a GitHub Deployment, and sends the Telegram message. No per-Application annotations — a global `subscriptions` entry — so the pending ApplicationSet migration is unaffected. All non-trivial logic lives in three dependency-free Node modules with `node:test` specs; the workflow is thin glue over them.

**Tech Stack:** ArgoCD v3.2.4 notifications controller; GitHub Actions; Node 20 (`node:test`, zero npm dependencies); GitHub REST API (`/dispatches`, `/deployments`); Telegram Bot API (`sendMessage`).

**Spec:** `docs/superpowers/specs/2026-09-08-deploy-notify-and-versioning-design.md` (in the `doma` repo, alongside this plan). Read it first — "Component A", "Component C", and "Data contracts" are the source of truth.

**Working repo:** all paths in this plan are relative to the **infra repo**, `git@github.com:stevetosak/hetzner-cloud-infra.git`, local checkout `/home/stevetosak/k8s`. This plan file lives in the `doma` repo (the spec's home).

## Global Constraints

- **Branch off `origin/master`.** Never off local `~/k8s` master (diverged: an unpushed commit, an untracked file, local branch `feat/doma-telegram-secrets`). Command: `git -C /home/stevetosak/k8s fetch origin && git -C /home/stevetosak/k8s switch -c feat/deploy-notify-and-catalog origin/master`.
- **`master` is prod. Every change via a PR. Never push direct to `master`.**
- **Commit messages:** one concise subject line. No `Co-Authored-By` footer, no `Claude-Session` footer. PR body: no Claude session URL.
- **Kubernetes mutations are the user's to run.** This plan writes tracked YAML and a documented `kubectl` procedure; it never applies anything. `kubectl` reads and `--dry-run=client` are fine.
- **Node scripts have zero npm dependencies.** `node:test`, `node:assert/strict`, `node:fs`, `node:path`, `node:os`, `node:child_process`, `node:url` only. No `package.json` is added to the infra repo. Run tests with `node --test deployments/`.
- **Image reference shape:** the `image` field in a dispatch payload is the full running reference, e.g. `stevetosak/doma:alpha-<40-hex-sha>`. The app sha is the substring after the last `:alpha-`.
- **ArgoCD app names** (verified 2026-09-08): `authos-api`, `authos-ui`, `authos-demo`, `duster`, `doma`, `wasteio-api`, `wasteio-frontend`, `wasteio-bin-agents`.
- **`imaps` is not an ArgoCD app**; `wasteio-bin-agents` is `OutOfSync`. Both simply produce no events. No special-casing.
- **Row shape** (used verbatim by every task):
  `{ app: string, version: string, sha: string, image: string, env: "dev", deployed_at: string (ISO-8601 UTC), argocd_revision: string }`

---

## File Structure

All **created** in the infra repo; **nothing is modified**.

| Path                                                                 | Responsibility                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.gitattributes`                                                     | One line: `deployments/history.jsonl merge=union`. Concurrent appends never conflict.                                                                                                                                        |
| `deployments/apps.json`                                              | Map: ArgoCD app name → `{ repo: string\|null, tagPrefix: string }`. The only place app→repo knowledge lives.                                                                                                                 |
| `deployments/history.jsonl`                                          | Append-only deploy log. One JSON object (Row) per line. Starts empty.                                                                                                                                                        |
| `deployments/CATALOG.md`                                             | Human-readable table, regenerated from `history.jsonl`. Never hand-edited.                                                                                                                                                   |
| `deployments/render-catalog.mjs`                                     | `renderCatalog(rows, apps) → string` + a CLI that rewrites `CATALOG.md` from disk.                                                                                                                                           |
| `deployments/render-catalog.test.mjs`                                | `node:test` specs for `renderCatalog`.                                                                                                                                                                                       |
| `deployments/resolve.mjs`                                            | `parsePayload(payload) → {app,image,sha,revision}`; `describeVersion(repoDir, sha, tagPrefix) → string`; CLI: payload + repoDir → a Row (minus `deployed_at`) on stdout.                                                     |
| `deployments/resolve.test.mjs`                                       | `node:test` specs — `parsePayload` (pure) + `describeVersion` (against a scratch git repo).                                                                                                                                  |
| `deployments/record.mjs`                                             | `recordRow(row, {historyPath, appsPath, catalogPath}) → {appended: boolean}` — idempotent append on `app`+`sha`, then regenerate the catalog. CLI: a Row JSON arg → appends + regenerates, prints `appended` or `duplicate`. |
| `deployments/record.test.mjs`                                        | `node:test` specs — first write appends, identical `app`+`sha` is a no-op, a different sha appends, `CATALOG.md` is rewritten.                                                                                               |
| `deployments/README.md`                                              | What the catalog is, how a row gets added, how to replay a missed event.                                                                                                                                                     |
| `.github/workflows/deploy-catalog.yml`                               | `repository_dispatch: [deploy-live]` + `workflow_dispatch` (replay). Clone app repo → `resolve.mjs` → `record.mjs` → commit → GitHub Deployment → Telegram.                                                                  |
| `core/argocd/notifications/argocd-notifications-cm.yaml`             | Tracked copy of the `argocd-notifications-cm` data.                                                                                                                                                                          |
| `core/argocd/notifications/argocd-notifications-secret.example.yaml` | Blank-value template documenting the `github-token` key.                                                                                                                                                                     |
| `core/argocd/notifications/README.md`                                | The exact `kubectl` procedure to apply the cm and set the secret key.                                                                                                                                                        |

---

## Task 1: Catalog renderer + scaffold

**Files:**

- Create: `.gitattributes`, `deployments/apps.json`, `deployments/history.jsonl` (empty), `deployments/render-catalog.mjs`, `deployments/render-catalog.test.mjs`

**Interfaces:**

- Produces: `renderCatalog(rows: Row[], apps: AppsMap): string`. `AppsMap = { [app]: { repo: string|null, tagPrefix: string } }`. Returns the full `CATALOG.md` body — a "Current" table (latest Row per app, newest deploy first) and a "Recent history" table (all rows, newest first, capped at 20).
- Produces: CLI — `node deployments/render-catalog.mjs` reads `history.jsonl` + `apps.json`, overwrites `CATALOG.md`.

- [ ] **Step 1: Create the scaffold**

```bash
cd /home/stevetosak/k8s
mkdir -p deployments && : > deployments/history.jsonl
```

`.gitattributes` (repo root — run `git ls-files .gitattributes`; if it exists, append the line):

```
deployments/history.jsonl merge=union
```

`deployments/apps.json` (doma filled; the rest `repo: null` so an unknown app is explicit, not a crash):

```json
{
  "doma": { "repo": "stevetosak/doma", "tagPrefix": "v" },
  "authos-api": { "repo": null, "tagPrefix": "authos-api-v" },
  "authos-ui": { "repo": null, "tagPrefix": "authos-ui-v" },
  "authos-demo": { "repo": null, "tagPrefix": "authos-demo-v" },
  "duster": { "repo": null, "tagPrefix": "duster-v" },
  "wasteio-api": { "repo": null, "tagPrefix": "wasteio-api-v" },
  "wasteio-frontend": { "repo": null, "tagPrefix": "wasteio-frontend-v" },
  "wasteio-bin-agents": { "repo": null, "tagPrefix": "wasteio-bin-agents-v" }
}
```

- [ ] **Step 2: Write the failing test**

`deployments/render-catalog.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { renderCatalog } from './render-catalog.mjs'

const apps = {
  doma: { repo: 'stevetosak/doma', tagPrefix: 'v' },
  'authos-api': { repo: 'stevetosak/authos', tagPrefix: 'authos-api-v' },
}

const rows = [
  {
    app: 'doma',
    version: 'v0.3.0',
    sha: 'abc1234def',
    image: 'stevetosak/doma:alpha-abc1234def',
    env: 'dev',
    deployed_at: '2026-09-08T14:22:03Z',
    argocd_revision: 'faf7615',
  },
  {
    app: 'doma',
    version: 'v0.3.0-2-gdead111',
    sha: 'dead111',
    image: 'stevetosak/doma:alpha-dead111',
    env: 'dev',
    deployed_at: '2026-09-08T15:00:00Z',
    argocd_revision: 'aaa0000',
  },
  {
    app: 'authos-api',
    version: 'authos-api-v1.2.0',
    sha: 'beef222',
    image: 'stevetosak/authos-api:alpha-beef222',
    env: 'dev',
    deployed_at: '2026-09-08T09:00:00Z',
    argocd_revision: 'bbb1111',
  },
]

test('Current shows the latest row per app, newest deploy first', () => {
  const current = renderCatalog(rows, apps).split('## Recent history')[0]
  assert.match(current, /\| doma \| v0\.3\.0-2-gdead111 \|/)
  assert.match(current, /\| authos-api \| authos-api-v1\.2\.0 \|/)
  assert.doesNotMatch(current, /\| doma \| v0\.3\.0 \|/) // older doma row excluded
  assert.ok(current.indexOf('| doma |') < current.indexOf('| authos-api |'))
})

test('sha links to the app repo commit when the repo is known', () => {
  assert.match(
    renderCatalog(rows, apps),
    /\[dead111\]\(https:\/\/github\.com\/stevetosak\/doma\/commit\/dead111\)/,
  )
})

test('Recent history is newest-first and capped at 20', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({
    ...rows[0],
    sha: `s${i}`,
    deployed_at: `2026-09-08T${String(i).padStart(2, '0')}:00:00Z`,
  }))
  const history = renderCatalog(many, apps).split('## Recent history')[1]
  assert.equal((history.match(/\| doma \|/g) || []).length, 20)
  assert.ok(history.indexOf('s24') < history.indexOf('s5'))
})

test('an app missing from apps.json still renders, with a plain (unlinked) sha', () => {
  const md = renderCatalog(
    [{ ...rows[0], app: 'mystery', version: 'unknown' }],
    {},
  )
  assert.match(md, /\| mystery \| unknown \|/)
  assert.match(md, /abc1234/)
  assert.doesNotMatch(md, /\[abc1234def\]\(/)
})
```

- [ ] **Step 3: Run the test — verify it fails**

Run: `node --test deployments/render-catalog.test.mjs`
Expected: FAIL — `Cannot find module './render-catalog.mjs'`.

- [ ] **Step 4: Implement `deployments/render-catalog.mjs`**

```js
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const short = (sha) => sha.slice(0, 7)

function shaCell(row, apps) {
  const repo = apps[row.app]?.repo
  return repo
    ? `[${short(row.sha)}](https://github.com/${repo}/commit/${row.sha})`
    : short(row.sha)
}

const line = (row, apps) =>
  `| ${row.app} | ${row.version} | ${shaCell(row, apps)} | ${row.env} | ${row.deployed_at} |`

const HEAD =
  '| App | Version | Commit | Env | Deployed (UTC) |\n| --- | --- | --- | --- | --- |'

/** rows: chronological (file order). Returns the full CATALOG.md body. */
export function renderCatalog(rows, apps) {
  const byTime = [...rows].sort((a, b) =>
    a.deployed_at.localeCompare(b.deployed_at),
  )

  const latest = new Map()
  for (const r of byTime) latest.set(r.app, r)
  const current = [...latest.values()].sort((a, b) =>
    b.deployed_at.localeCompare(a.deployed_at),
  )
  const recent = [...byTime].reverse().slice(0, 20)

  return [
    '# Deployment catalog',
    '',
    '_Generated from `deployments/history.jsonl` by `deployments/render-catalog.mjs`. Do not edit by hand._',
    '',
    '## Current',
    '',
    HEAD,
    ...current.map((r) => line(r, apps)),
    '',
    '## Recent history',
    '',
    HEAD,
    ...recent.map((r) => line(r, apps)),
    '',
  ].join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url))
  const rows = readFileSync(join(here, 'history.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
  const apps = JSON.parse(readFileSync(join(here, 'apps.json'), 'utf8'))
  writeFileSync(join(here, 'CATALOG.md'), renderCatalog(rows, apps))
  console.log(`Wrote CATALOG.md (${rows.length} rows)`)
}
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `node --test deployments/render-catalog.test.mjs`
Expected: PASS — 4 tests.

- [ ] **Step 6: Generate the initial empty CATALOG.md**

Run: `node deployments/render-catalog.mjs`
Expected: `Wrote CATALOG.md (0 rows)`; the file has two headed-but-empty tables.

- [ ] **Step 7: Commit**

```bash
git add .gitattributes deployments/
git commit -m "feat: version catalog renderer and scaffold"
```

---

## Task 2: Payload parse + semver resolution

**Files:**

- Create: `deployments/resolve.mjs`, `deployments/resolve.test.mjs`

**Interfaces:**

- Consumes: `deployments/apps.json` (Task 1).
- Produces: `parsePayload(payload): { app, image, sha, revision }`. Throws if `app` or `image` missing. `sha` = substring after the last `:alpha-` (fallback: after the last `:`).
- Produces: `describeVersion(repoDir, sha, tagPrefix): string` — `git -C <repoDir> describe --tags --always --match "<tagPrefix>[0-9]*" <sha>`; a bare-sha result (no matching tag) → `"<tagPrefix>0.0.0+<sha:7>"`; never throws for a missing tag.
- Produces: CLI — `node deployments/resolve.mjs '<payload-json>' <repoDir>` prints one JSON line: a Row **without** `deployed_at` (the workflow adds it). `version` is `"unknown"` when the app is absent from `apps.json` or its `repo` is `null`.

- [ ] **Step 1: Write the failing test**

`deployments/resolve.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parsePayload, describeVersion } from './resolve.mjs'

test('parsePayload extracts app, image, sha, revision', () => {
  assert.deepEqual(
    parsePayload({
      app: 'doma',
      project: 'default',
      revision: 'faf76159214ae7b59d3c978f3404409b77f2b644',
      image: 'stevetosak/doma:alpha-abc1234def5678',
    }),
    {
      app: 'doma',
      image: 'stevetosak/doma:alpha-abc1234def5678',
      sha: 'abc1234def5678',
      revision: 'faf76159214ae7b59d3c978f3404409b77f2b644',
    },
  )
})

test('parsePayload throws when image is missing', () => {
  assert.throws(() => parsePayload({ app: 'doma' }), /image/)
})

function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'resolve-'))
  const git = (...a) =>
    execFileSync('git', ['-C', dir, ...a], { stdio: 'pipe' })
  git('init', '-q')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  writeFileSync(join(dir, 'a'), '1')
  git('add', '.')
  git('commit', '-qm', 'one')
  git('tag', 'v0.2.0')
  writeFileSync(join(dir, 'a'), '2')
  git('add', '.')
  git('commit', '-qm', 'two')
  return { dir, head: git('rev-parse', 'HEAD').toString().trim() }
}

test('describeVersion returns the tag when the commit is tagged', () => {
  const { dir } = scratchRepo()
  const tagged = execFileSync('git', ['-C', dir, 'rev-list', '-n1', 'v0.2.0'])
    .toString()
    .trim()
  assert.equal(describeVersion(dir, tagged, 'v'), 'v0.2.0')
})

test('describeVersion returns tag-N-gsha past the tag', () => {
  const { dir, head } = scratchRepo()
  assert.match(describeVersion(dir, head, 'v'), /^v0\.2\.0-1-g[0-9a-f]+$/)
})

test('describeVersion falls back to <prefix>0.0.0+sha when no tag matches', () => {
  const { dir, head } = scratchRepo()
  assert.match(
    describeVersion(dir, head, 'authos-api-v'),
    /^authos-api-v0\.0\.0\+[0-9a-f]{7}$/,
  )
})
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `node --test deployments/resolve.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `deployments/resolve.mjs`**

```js
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export function parsePayload(payload) {
  const { app, image, revision } = payload || {}
  if (!app) throw new Error('payload.app is required')
  if (!image) throw new Error('payload.image is required')
  const marker = ':alpha-'
  const i = image.lastIndexOf(marker)
  const sha = i === -1 ? image.split(':').pop() : image.slice(i + marker.length)
  return { app, image, sha, revision: revision || '' }
}

export function describeVersion(repoDir, sha, tagPrefix) {
  let out
  try {
    out = execFileSync(
      'git',
      [
        '-C',
        repoDir,
        'describe',
        '--tags',
        '--always',
        '--match',
        `${tagPrefix}[0-9]*`,
        sha,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
      .toString()
      .trim()
  } catch {
    out = sha.slice(0, 7)
  }
  if (/^[0-9a-f]{7,40}$/.test(out))
    return `${tagPrefix}0.0.0+${sha.slice(0, 7)}`
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [payloadJson, repoDir] = process.argv.slice(2)
  const here = dirname(fileURLToPath(import.meta.url))
  const apps = JSON.parse(readFileSync(join(here, 'apps.json'), 'utf8'))
  const p = parsePayload(JSON.parse(payloadJson))
  const entry = apps[p.app]
  const version =
    entry && entry.repo
      ? describeVersion(repoDir, p.sha, entry.tagPrefix)
      : 'unknown'
  process.stdout.write(
    JSON.stringify({
      app: p.app,
      version,
      sha: p.sha,
      image: p.image,
      env: 'dev',
      argocd_revision: p.revision,
    }),
  )
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `node --test deployments/resolve.test.mjs`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add deployments/resolve.mjs deployments/resolve.test.mjs
git commit -m "feat: resolve deploy payload to a git-describe version"
```

---

## Task 3: Idempotent record + regenerate

**Files:**

- Create: `deployments/record.mjs`, `deployments/record.test.mjs`

**Interfaces:**

- Consumes: `renderCatalog` (Task 1).
- Produces: `recordRow(row, { historyPath, appsPath, catalogPath }): { appended: boolean }`. If a line in `historyPath` already has the same `app` **and** `sha`, returns `{ appended: false }` and writes nothing. Otherwise appends `JSON.stringify(row) + "\n"` to `historyPath`, rewrites `catalogPath` via `renderCatalog`, returns `{ appended: true }`.
- Produces: CLI — `node deployments/record.mjs '<row-json>'` operates on `deployments/{history.jsonl,apps.json,CATALOG.md}`, prints `appended` or `duplicate`, exit 0 either way.

- [ ] **Step 1: Write the failing test**

`deployments/record.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recordRow } from './record.mjs'

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'record-'))
  const historyPath = join(dir, 'history.jsonl')
  const appsPath = join(dir, 'apps.json')
  const catalogPath = join(dir, 'CATALOG.md')
  writeFileSync(historyPath, '')
  writeFileSync(
    appsPath,
    JSON.stringify({ doma: { repo: 'stevetosak/doma', tagPrefix: 'v' } }),
  )
  return {
    historyPath,
    appsPath,
    catalogPath,
    opts: { historyPath, appsPath, catalogPath },
  }
}

const row = (over = {}) => ({
  app: 'doma',
  version: 'v0.3.0',
  sha: 'abc123',
  image: 'stevetosak/doma:alpha-abc123',
  env: 'dev',
  deployed_at: '2026-09-08T14:22:03Z',
  argocd_revision: 'faf7615',
  ...over,
})

test('first write appends and regenerates the catalog', () => {
  const f = fixture()
  assert.deepEqual(recordRow(row(), f.opts), { appended: true })
  assert.equal(readFileSync(f.historyPath, 'utf8').trim().split('\n').length, 1)
  assert.match(readFileSync(f.catalogPath, 'utf8'), /\| doma \| v0\.3\.0 \|/)
})

test('same app+sha is a no-op', () => {
  const f = fixture()
  recordRow(row(), f.opts)
  assert.deepEqual(
    recordRow(row({ deployed_at: '2026-09-08T18:00:00Z' }), f.opts),
    { appended: false },
  )
  assert.equal(readFileSync(f.historyPath, 'utf8').trim().split('\n').length, 1)
})

test('a different sha appends', () => {
  const f = fixture()
  recordRow(row(), f.opts)
  assert.deepEqual(
    recordRow(row({ sha: 'def456', version: 'v0.3.0-1-gdef456' }), f.opts),
    { appended: true },
  )
  assert.equal(readFileSync(f.historyPath, 'utf8').trim().split('\n').length, 2)
})
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `node --test deployments/record.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `deployments/record.mjs`**

```js
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { renderCatalog } from './render-catalog.mjs'

export function recordRow(row, { historyPath, appsPath, catalogPath }) {
  const existing = readFileSync(historyPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
  const rows = existing.map((l) => JSON.parse(l))
  if (rows.some((r) => r.app === row.app && r.sha === row.sha))
    return { appended: false }

  appendFileSync(historyPath, JSON.stringify(row) + '\n')
  const apps = JSON.parse(readFileSync(appsPath, 'utf8'))
  writeFileSync(catalogPath, renderCatalog([...rows, row], apps))
  return { appended: true }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url))
  const res = recordRow(JSON.parse(process.argv[2]), {
    historyPath: join(here, 'history.jsonl'),
    appsPath: join(here, 'apps.json'),
    catalogPath: join(here, 'CATALOG.md'),
  })
  console.log(res.appended ? 'appended' : 'duplicate')
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `node --test deployments/`
Expected: PASS — 13 tests total (4 + 6 + 3).

- [ ] **Step 5: Commit**

```bash
git add deployments/record.mjs deployments/record.test.mjs
git commit -m "feat: idempotent catalog row append"
```

---

## Task 4: The catalog workflow

**Files:**

- Create: `.github/workflows/deploy-catalog.yml`, `deployments/README.md`

**Interfaces:**

- Consumes: `resolve.mjs` CLI (Task 2), `record.mjs` CLI (Task 3).
- Consumes (infra repo Actions secrets, user-supplied — Task 6): `APP_DEPLOY_PAT`, `INFRA_TELEGRAM_BOT_TOKEN`, `INFRA_TELEGRAM_CHAT_ID`.
- Produces: per `deploy-live` dispatch — a `[skip ci]` commit on `master` (one `history.jsonl` line + regenerated `CATALOG.md`); a GitHub Deployment + `success` status on the app repo; a Telegram message.

- [ ] **Step 1: Write `deployments/README.md`**

```markdown
# Deployment catalog

`history.jsonl` is an append-only record of every app version ArgoCD has reported
`Synced` + `Healthy` in the cluster. `CATALOG.md` is the readable roll-up, regenerated
from it. Both are written by `.github/workflows/deploy-catalog.yml`, never by hand.

## How a row is added

1. ArgoCD Notifications (`core/argocd/notifications/`) fires `on-deployed`, once per
   `sync.revision`, as a GitHub `repository_dispatch` (`event_type: deploy-live`).
2. `deploy-catalog.yml` clones the app repo, resolves the running `alpha-<sha>` image
   tag to a `git describe` semver, appends a line here, regenerates `CATALOG.md`, opens
   a GitHub Deployment on the app repo, and sends a Telegram message.

## Replay a missed event

Actions -> "Deploy catalog" -> Run workflow -> `payload`:

    { "app": "doma", "project": "default", "revision": "<infra sha>", "image": "stevetosak/doma:alpha-<app sha>" }

Appends are idempotent on `app`+`sha`, so a replay is safe (it will not double-commit;
it will still re-send Telegram).

## Adding an app

Fill its row in `apps.json` (`repo`, `tagPrefix`). `repo: null` means "resolve nothing,
record `version: unknown`, still notify, no GitHub Deployment".
```

- [ ] **Step 2: Write `.github/workflows/deploy-catalog.yml`**

```yaml
name: Deploy catalog

on:
  repository_dispatch:
    types: [deploy-live]
  workflow_dispatch:
    inputs:
      payload:
        description: 'client_payload JSON for a manual replay'
        required: true

concurrency:
  group: deploy-catalog
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  record:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Assemble the payload
        id: p
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            PAYLOAD=$(cat <<'EOF'
          ${{ github.event.inputs.payload }}
          EOF
          )
          else
            PAYLOAD=$(cat <<'EOF'
          ${{ toJSON(github.event.client_payload) }}
          EOF
          )
          fi
          {
            echo "payload<<PAYLOAD_EOF"
            echo "$PAYLOAD"
            echo "PAYLOAD_EOF"
          } >> "$GITHUB_OUTPUT"
          echo "repo=$(node -e 'const a=require("./deployments/apps.json");const p=JSON.parse(process.argv[1]);process.stdout.write((a[p.app]&&a[p.app].repo)||"")' "$PAYLOAD")" >> "$GITHUB_OUTPUT"

      - name: Clone the app repo (for git describe)
        if: steps.p.outputs.repo != ''
        run: |
          git clone --filter=blob:none --no-checkout "https://github.com/${{ steps.p.outputs.repo }}.git" _app
          git -C _app fetch --tags --force origin

      - name: Build the row
        id: row
        run: |
          REPO_DIR=_app; [ -d "$REPO_DIR" ] || REPO_DIR=.
          BASE=$(node deployments/resolve.mjs '${{ steps.p.outputs.payload }}' "$REPO_DIR")
          ROW=$(node -e 'const r=JSON.parse(process.argv[1]);r.deployed_at=new Date().toISOString().replace(/\.\d+Z$/,"Z");process.stdout.write(JSON.stringify(r))' "$BASE")
          echo "row=$ROW" >> "$GITHUB_OUTPUT"
          echo "$ROW"

      - name: Record + regenerate
        id: rec
        run: |
          RESULT=$(node deployments/record.mjs '${{ steps.row.outputs.row }}')
          echo "result=$RESULT" >> "$GITHUB_OUTPUT"
          echo "$RESULT"

      - name: Commit
        if: steps.rec.outputs.result == 'appended'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          APP=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).app)' '${{ steps.row.outputs.row }}')
          VER=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).version)' '${{ steps.row.outputs.row }}')
          git add deployments/history.jsonl deployments/CATALOG.md
          git commit -m "chore: catalog $APP $VER [skip ci]"
          for i in 1 2 3 4 5; do
            git pull --rebase --autostash origin master && git push origin HEAD:master && exit 0
            sleep $((RANDOM % 5 + 2))
          done
          echo "push failed after retries" && exit 1

      - name: GitHub Deployment on the app repo
        if: steps.p.outputs.repo != ''
        env:
          GH_TOKEN: ${{ secrets.APP_DEPLOY_PAT }}
        run: |
          ROW='${{ steps.row.outputs.row }}'
          SHA=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).sha)' "$ROW")
          APP=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).app)' "$ROW")
          REPO='${{ steps.p.outputs.repo }}'
          COUNT=$(gh api "repos/$REPO/deployments?environment=dev&sha=$SHA" --jq 'length' || echo 0)
          if [ "$COUNT" != "0" ]; then echo "deployment already exists"; exit 0; fi
          DID=$(gh api "repos/$REPO/deployments" -f ref="$SHA" -f environment=dev \
            -F auto_merge=false -f required_contexts='[]' -f description="ArgoCD reported healthy" --jq '.id')
          gh api "repos/$REPO/deployments/$DID/statuses" -f state=success \
            -f environment_url="https://${APP%%-*}.tosak.net" \
            -f log_url="https://github.com/stevetosak/hetzner-cloud-infra/blob/master/deployments/CATALOG.md" \
            -f description="Live in dev"

      - name: Telegram
        env:
          TG_TOKEN: ${{ secrets.INFRA_TELEGRAM_BOT_TOKEN }}
          TG_CHAT: ${{ secrets.INFRA_TELEGRAM_CHAT_ID }}
        run: |
          ROW='${{ steps.row.outputs.row }}'
          APP=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).app)' "$ROW")
          VER=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).version)' "$ROW")
          SHA=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).sha.slice(0,7))' "$ROW")
          TEXT="doma deploy — see catalog"
          TEXT=$(printf 'Deployed: %s %s (%s)\nhttps://github.com/stevetosak/hetzner-cloud-infra/blob/master/deployments/CATALOG.md' "$APP" "$VER" "$SHA")
          curl -sS --fail-with-body -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
            --data-urlencode "chat_id=${TG_CHAT}" \
            --data-urlencode "text=${TEXT}" \
            --data-urlencode "disable_web_page_preview=true"
```

Note: the Telegram message is deliberately **plain text** (no `parse_mode`) — a `git describe` version string contains `-` and `.`, both MarkdownV2 specials, and plain text sidesteps the escaping entirely. Prettify later if wanted.

- [ ] **Step 3: Validate the workflow YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-catalog.yml'))" && echo OK`
Expected: `OK`. (No `python3`? `npx --yes yaml-lint .github/workflows/deploy-catalog.yml`.)

Watch the heredoc indentation in the "Assemble the payload" step — the `${{ ... }}` and `EOF` markers must sit at column 0 inside the `run:` block scalar or the shell heredoc breaks. If YAML lint or the Step-6 replay shows a broken payload, replace that step's body with the simpler `PAYLOAD='${{ toJSON(github.event.client_payload) }}'` single-quoted form and a separate branch for `workflow_dispatch`, accepting that a `'` inside a payload value would break it (payloads here never contain one).

- [ ] **Step 4: Re-run the Node suite (nothing regressed)**

Run: `node --test deployments/`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy-catalog.yml deployments/README.md
git commit -m "feat: deploy-catalog workflow (dispatch -> row, deployment, telegram)"
```

---

## Task 5: ArgoCD Notifications config

**Files:**

- Create: `core/argocd/notifications/argocd-notifications-cm.yaml`, `core/argocd/notifications/argocd-notifications-secret.example.yaml`, `core/argocd/notifications/README.md`

**Interfaces:**

- Produces: a `repository_dispatch` (`event_type: deploy-live`) to `stevetosak/hetzner-cloud-infra` whenever any Application goes `Synced` + `Healthy` on a new `sync.revision`. Payload = Task 2's `parsePayload` input.

- [ ] **Step 1: Write `core/argocd/notifications/argocd-notifications-cm.yaml`**

```yaml
# Tracked copy of the argocd-notifications-cm DATA. Applied out of band (infra
# convention). Re-apply the live object from this file with:
#   kubectl -n argocd apply -f core/argocd/notifications/argocd-notifications-cm.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
  labels:
    app.kubernetes.io/component: notifications-controller
    app.kubernetes.io/name: argocd-notifications-controller
    app.kubernetes.io/part-of: argocd
data:
  trigger.on-deployed: |
    - description: Application is synced and healthy. Triggered once per revision.
      oncePer: app.status.sync.revision
      when: >-
        app.status.operationState != nil and
        app.status.operationState.phase in ['Succeeded'] and
        app.status.health.status == 'Healthy' and
        app.status.sync.status == 'Synced'
      send: [app-deployed]

  service.webhook.gh-infra: |
    url: https://api.github.com/repos/stevetosak/hetzner-cloud-infra/dispatches
    headers:
      - name: Authorization
        value: token $github-token
      - name: Accept
        value: application/vnd.github+json
      - name: User-Agent
        value: argocd-notifications

  template.app-deployed: |
    webhook:
      gh-infra:
        method: POST
        body: |
          {
            "event_type": "deploy-live",
            "client_payload": {
              "app": "{{.app.metadata.name}}",
              "project": "{{.app.spec.project}}",
              "revision": "{{.app.status.sync.revision}}",
              "image": "{{if .app.status.summary.images}}{{index .app.status.summary.images 0}}{{end}}"
            }
          }

  subscriptions: |
    - recipients:
        - gh-infra
      triggers:
        - on-deployed
```

- [ ] **Step 2: Write `core/argocd/notifications/argocd-notifications-secret.example.yaml`**

```yaml
# TEMPLATE ONLY — never `kubectl apply` this file (it would blank the real value).
# Documents the one key the notifications controller needs. Set the real value with
# the `kubectl patch` in this directory's README.md.
apiVersion: v1
kind: Secret
metadata:
  name: argocd-notifications-secret
  namespace: argocd
type: Opaque
stringData:
  # Fine-grained PAT. Repository: stevetosak/hetzner-cloud-infra.
  # Permission: "Contents" -> Read and write (required for repository_dispatch).
  github-token: ''
```

- [ ] **Step 3: Write `core/argocd/notifications/README.md`**

```markdown
# ArgoCD Notifications — deploy-live

Emits a GitHub `repository_dispatch` (`event_type: deploy-live`) to
`stevetosak/hetzner-cloud-infra` when any Application goes `Synced` + `Healthy` on a
new `sync.revision`. `.github/workflows/deploy-catalog.yml` consumes it. Global
`subscriptions`, no per-Application annotations — a future ApplicationSet migration
changes nothing here.

## Apply (run by the cluster owner — Claude's classifier blocks `kubectl apply`)

    # 1. Config (safe to re-apply; this file is the whole desired data).
    kubectl -n argocd apply -f core/argocd/notifications/argocd-notifications-cm.yaml

    # 2. Secret — patch in just the one key. Do NOT apply the .example file.
    kubectl -n argocd patch secret argocd-notifications-secret --type merge \
      -p "{\"stringData\":{\"github-token\":\"<FINE_GRAINED_PAT>\"}}"

    # 3. Reload (the controller also re-reads within ~60s on its own):
    kubectl -n argocd rollout restart deploy/argocd-notifications-controller

## Verify

    # Render the webhook body for a live app without sending it (binary name may be
    # `argocd-notifications` on PATH inside the pod — check `which`):
    kubectl -n argocd exec deploy/argocd-notifications-controller -- \
      argocd-notifications template notify app-deployed doma --recipient gh-infra

    kubectl -n argocd logs deploy/argocd-notifications-controller -f

## The PAT

Fine-grained, single repo `stevetosak/hetzner-cloud-infra`, permission **Contents:
Read and write**. Separate from the infra repo's `APP_DEPLOY_PAT` Actions secret
(**Deployments: write** on the app repos).
```

- [ ] **Step 4: Validate the ConfigMap YAML (client-side, no cluster contact)**

Run: `kubectl apply --dry-run=client -f core/argocd/notifications/argocd-notifications-cm.yaml`
Expected: `configmap/argocd-notifications-cm configured (dry run)` (or `created (dry run)`).

- [ ] **Step 5: Commit**

```bash
git add core/argocd/notifications/
git commit -m "feat: argocd notifications config for deploy-live dispatch"
```

---

## Task 6: End-to-end verification + PR

**Files:** none.

- [ ] **Step 1: Push the branch, open the PR**

```bash
git push -u origin feat/deploy-notify-and-catalog
gh pr create --repo stevetosak/hetzner-cloud-infra --base master \
  --title "Deploy-live notifications and version catalog" \
  --body "$(cat <<'EOF'
Implements the infra half of `docs/superpowers/specs/2026-09-08-deploy-notify-and-versioning-design.md` (doma repo).

- ArgoCD Notifications `on-deployed` -> `repository_dispatch` (global subscription, no per-Application annotations).
- `deploy-catalog.yml`: resolve `alpha-<sha>` -> `git describe` semver, append `deployments/history.jsonl` (`merge=union`), regenerate `deployments/CATALOG.md`, open a GitHub Deployment on the app repo, send Telegram. All logic in three `node:test`-covered modules.
- Zero changes to any existing deploy pipeline.

## Before merge — user actions

1. Create the dedicated infra Telegram bot (@BotFather) + a chat; get the numeric chat id.
2. Infra repo Actions secrets: `INFRA_TELEGRAM_BOT_TOKEN`, `INFRA_TELEGRAM_CHAT_ID`, and `APP_DEPLOY_PAT` (fine-grained PAT, **Deployments: Read and write** on `stevetosak/doma`; add `authos`/`wasteio` later).
3. Cluster PAT: fine-grained, **Contents: Read and write** on `stevetosak/hetzner-cloud-infra`.

## After merge — user actions (cluster)

Follow `core/argocd/notifications/README.md`: `kubectl apply` the cm, `kubectl patch` the secret key.
EOF
)"
```

- [ ] **Step 2: Manual replay test (after merge + secrets set)**

Actions → "Deploy catalog" → Run workflow → `payload`:

```json
{
  "app": "doma",
  "project": "default",
  "revision": "0000000000000000000000000000000000000000",
  "image": "stevetosak/doma:alpha-<a real recent doma commit sha>"
}
```

Expected:

- Green run.
- A commit `chore: catalog doma <version> [skip ci]` on `master` — one `history.jsonl` line, one `CATALOG.md` row.
- `https://github.com/stevetosak/doma/deployments` shows a `dev` deployment on that sha (`Active`).
- One Telegram message in the infra chat.
- Run again, same payload → green, **no** new commit (`record` prints `duplicate`, the Commit step is skipped).

- [ ] **Step 3: Live cluster test (after the cm + secret are applied)**

```bash
kubectl -n argocd exec deploy/argocd-notifications-controller -- \
  argocd-notifications template notify app-deployed doma --recipient gh-infra
```

Expected: prints the JSON webhook body with the real running `doma` image + revision, no template error.

Then a real sync of the smallest app (ask the user — e.g. `argocd app sync authos-demo`, or a no-op infra commit that bumps its overlay). Expected: within ~1 min, one `deploy-live` run, one catalog row, one Telegram message. Sync the **same** revision again → **no** second run (`oncePer`).

- [ ] **Step 4: Record the result**

PR comment (or tell the user): the replay run URL, the live-sync run URL, the `CATALOG.md` diff, Telegram confirmation. Update memory `project_deploy_notify_versioning.md` + `~/.claude/rules/memory-sessions.md`.

---

## Self-Review

**Spec coverage:**

- Component A (cm/secret/template, global subscription, `on-deployed`, `oncePer: sync.revision`) → Task 5. ✅
- Component C (`apps.json`, `history.jsonl` + `merge=union`, `CATALOG.md`, `render-catalog.mjs`, `deploy-catalog.yml`, GitHub Deployment, Telegram from the Action) → Tasks 1–4. ✅
- Component D (`git describe`) — resolution side = Task 2 `describeVersion`; the app-side build wiring is the **doma plan**. ✅ (cross-referenced)
- Data contracts (dispatch payload, JSONL Row) → Task 2 `parsePayload` + the "Row shape" Global Constraint, used verbatim in Tasks 1/2/3. ✅
- Error-handling table: `oncePer` (Task 5 trigger), webhook retry (ArgoCD built-in — Task 5 README), partial-failure `app`+`sha` dedup (Task 3 `recordRow`), `merge=union` + rebase-retry (Task 1 `.gitattributes` + Task 4 push loop), no-tag fallback (Task 2 `describeVersion` + test), unknown app (Task 2 CLI `version:'unknown'` + Task 1 test 4), `imaps`/`wasteio-bin-agents` (Global Constraints, no code). ✅
- Prerequisites (bot, 3 Actions secrets, cluster PAT, `kubectl apply`) → Task 6 Step 1 + Task 5 README. ✅

**Placeholder scan:** `apps.json` `repo: null` for authos/wasteio is deliberate and tested. `<a real recent doma commit sha>` (Task 6 Step 2) is an operator instruction. No `TODO`/`TBD`/"handle edge cases". The Task 4 Step 2 heredoc carries an explicit fallback if the indentation proves fragile — a named alternative, not a placeholder.

**Type consistency:** the Row shape is identical in the Global Constraints, `render-catalog` test + impl, `resolve.mjs` CLI output (minus `deployed_at`), and `record.mjs` (`recordRow(row, opts)`). `parsePayload` output `{app,image,sha,revision}` matches its test and its `resolve.mjs` CLI caller. `describeVersion(repoDir, sha, tagPrefix)` — one signature across test, impl, CLI. `recordRow(row, {historyPath, appsPath, catalogPath}) → {appended: boolean}` — same in test, impl, CLI. The CLI result strings `appended` / `duplicate` match the workflow's `steps.rec.outputs.result == 'appended'` guard. `renderCatalog(rows, apps)` — same ar/return in Task 1 and its Task 3 import.
