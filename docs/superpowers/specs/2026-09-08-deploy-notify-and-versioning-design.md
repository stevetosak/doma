# Deploy-live notifications, semantic versioning, and a version catalog

## What I Understood

### The problem

Three requests, all about deploys, across the infra repo and every app repo.

1. **Deploy-live notification.** Send a message when app _X_ version _Y_ is up
   and serving traffic in the cluster — not when "CI pushed a manifest". The
   true signal is ArgoCD reporting the Application `Synced` **and** `Healthy` on
   the new revision. `Healthy` means the Deployment is `Available`, which means
   the readiness probes pass.
2. **Semantic versioning for every deployable app.** Today an app deploys only
   as the image tag `alpha-<gitsha>`. Add `vMAJOR.MINOR.PATCH`, driven off the
   Conventional-Commits style already in use.
3. **Version catalog.** A durable, browsable record of which version of each app
   ran where and when.

### Why this solution

- **One signal, two consumers.** The three concerns share one fact: _"a new
  healthy revision of app X is live."_ ArgoCD already computes that fact. The
  design emits it once — an ArgoCD `on-deployed` event — and feeds a notifier
  and a catalog from it.
- **ArgoCD Notifications, not a custom controller.** The
  `argocd-notifications-controller` already runs. It ships an `on-deployed`
  trigger and a webhook service. The global `CLAUDE.md` rule is to prefer a
  library over hand-rolling.
- **Additive versioning.** Semantic version tags change no deploy mechanism.
  The image tag and the overlay `newTag` stay `alpha-<sha>`. The tag, the
  GitHub Release, and the `CHANGELOG.md` are metadata. The catalog resolves
  `alpha-<sha>` to a semver.
- **release-please.** Google tool, GitHub-native, reads Conventional Commits,
  supports a monorepo with per-component versions (needed for `authos`).
- **`git describe` for the shown version.** The user chose "semver only" for
  the app's version display, and "deploy stays on `alpha-<sha>`". Between
  releases the running commit has no tag, so a pure tag would lag.
  `git describe --tags` gives `v0.3.0` on a release commit and
  `v0.3.0-5-gabc1234` five commits later. Semver first, sha demoted to a
  suffix, never stale.
- **Infra Action owns the outputs.** One GitHub Actions workflow in the infra
  repo resolves the semver, writes the catalog, creates the GitHub Deployment,
  and sends the Telegram message. One place. Secrets live in GitHub, not the
  cluster. The message shows the resolved `v0.3.0`.
- **Global notification subscription, not per-Application annotations.** A
  pending task will replace the 8 hand-made ArgoCD Applications with one
  ApplicationSet. A global `subscriptions` entry in `argocd-notifications-cm`
  reads Application status the same either way, so that migration redoes
  nothing here.

## Context

### The deploy pipeline (identical across all apps)

`push to main/master` → CI `check`/`e2e` gate → `build-push` builds the image,
tags it `:latest` and `:alpha-<github.sha>`, pushes to Docker Hub
`stevetosak/<app>` → `deploy` checks out the infra repo with
`secrets.INFRA_REPO_TOKEN`, runs `kustomize edit set image` in
`vars.INFRA_REPO_<APP>_OVERLAY_DIR`, commits `"Update <app> image"` as
`github-actions[bot]`, pushes to infra `master` → **ArgoCD auto-syncs**.

Overlay: `projects/<project>/<component>/manifests/overlays/dev/kustomization.yaml`
carries `images: [{name: stevetosak/<app>, newTag: alpha-<sha>}]` and `replicas`.

### Cluster / ArgoCD state (verified 2026-09-08)

- ArgoCD `v3.2.4`, namespace `argocd`, `argocd.tosak.net`.
- `argocd-notifications-controller` runs (237d). `argocd-notifications-cm` has
  **empty `.data`** — no triggers, templates, or services. `argocd-notifications-secret`
  has **no data keys**.
- 8 Applications, all hand-made, all tracking the one infra repo:
  `authos-api`, `authos-ui`, `authos-demo`, `duster` (project `authos`);
  `doma` (project `default`); `wasteio-api`, `wasteio-frontend`,
  `wasteio-bin-agents` (project `authos`).
- `wasteio-bin-agents` is `OutOfSync` (a known directory-vs-app-name mismatch).
- `imaps` has manifests in the infra repo but **is not an ArgoCD app**.
- ArgoCD populates `status.summary.images` with the running image list, and
  `status.sync.revision` with the infra commit sha.
- `argocd app history` fails from the server pod — a `ServiceAccount` RBAC gap
  (`cannot list services in namespace argocd`). Not on this path; noted.

### App repos in scope

| App                | Repo                 | CI workflow                       | ArgoCD project | Overlay var                       |
| ------------------ | -------------------- | --------------------------------- | -------------- | --------------------------------- |
| doma               | `stevetosak/doma`    | `.github/workflows/deploy.yaml`   | `default`      | `INFRA_REPO_DOMA_OVERLAY_DIR`     |
| authos-api         | `stevetosak/authos`  | `.github/workflows/backend.yaml`  | `authos`       | `INFRA_REPO_API_OVERLAY_DIR`      |
| authos-ui          | `stevetosak/authos`  | `.github/workflows/frontend.yaml` | `authos`       | `INFRA_REPO_FRONTEND_OVERLAY_DIR` |
| duster             | `stevetosak/authos`  | `.github/workflows/duster.yaml`   | `authos`       | `INFRA_REPO_DUSTER_OVERLAY_DIR`   |
| authos-demo        | `stevetosak/authos`  | `.github/workflows/demo.yaml`     | `authos`       | `INFRA_REPO_DEMO_OVERLAY_DIR`     |
| wasteio-api        | `stevetosak/wasteio` | (wasteio CI)                      | `authos`       | (wasteio var)                     |
| wasteio-frontend   | `stevetosak/wasteio` | (wasteio CI)                      | `authos`       | (wasteio var)                     |
| wasteio-bin-agents | `stevetosak/wasteio` | (wasteio CI)                      | `authos`       | (wasteio var)                     |

All app CIs use `IMAGE_VERSION_PATTERN: 'alpha-${{ github.sha }}'`.

### doma version display (the pilot)

- `src/core/version.functions.ts` — `getAppVersion()` returns
  `optionalEnv('GIT_SHA', 'dev').slice(0, 7)`.
- `src/routes/__root.tsx` `beforeLoad` resolves `version` into the route context.
- `src/core/ui/AppShell.tsx:34` renders `doma · {version}`.
- `src/routes/api/health/index.ts` returns `version` (same 7-char sha) in the
  JSON body; also `/api/health/live` (liveness, database-free).
- `Dockerfile` — `ARG GIT_SHA=dev` / `ENV GIT_SHA=$GIT_SHA`.
- `deploy.yaml` `build-push` passes `build-args: GIT_SHA=${{ github.sha }}`;
  `actions/checkout@v4` runs at default depth (shallow, no tags).
- Existing hand-cut tags: `v0.1.0`, `v0.2.0` (milestone changelog anchors; no
  image is built from them).
- Infra repo: doma namespace `credentials` secret holds `TELEGRAM_BOT_TOKEN`
  for `domche_bot` — doma's **user-facing** bot (chore reminders). This design
  does **not** reuse it; a dedicated infra bot is separate.

### Repo conventions

- **`main`/`master` is prod for every repo. Every change via a PR. Never push
  direct.** The infra repo historically allowed direct push; recent work went
  via PRs — follow that.
- Branch infra work off `origin/master`. The local `~/k8s` checkout is diverged
  (branch `feat/doma-telegram-secrets`, an unpushed commit, an untracked file).
- Commit messages: one concise subject line. No `Co-Authored-By` or
  `Claude-Session` footer. PR bodies: no Claude session URL.
- Infra `CLAUDE.md`: base holds only `deployment.yaml`; the overlay pins
  `images[].newTag` to "the exact commit SHA **or semver tag** from CI" — semver
  is already anticipated. Out-of-band configmaps/secrets are tracked as files
  and applied with `kubectl apply`.
- Kubernetes: read-only inspection is free. Any mutation (`apply` on a live
  resource, `patch`, `edit`, `scale`, Secret create, RBAC) needs explicit
  permission with the exact command, resource, and namespace stated. Claude
  Code's classifier has historically blocked `kubectl apply` and `gh secret set`
  outright — hand those to the user.
- DNS: one subdomain level on `tosak.net` only.

## Decisions (locked with the user, 2026-09-08)

| #   | Decision                    | Choice                                                                       |
| --- | --------------------------- | ---------------------------------------------------------------------------- |
| 1   | Notification channel        | Dedicated **infra Telegram bot** (not `domche_bot`)                          |
| 2   | Semver ↔ deploy             | **Additive labels**; deploy stays on `alpha-<sha>`                           |
| 3   | Rollout scope               | Notifications cluster-wide now; semver **doma-first**, then template         |
| 4   | ApplicationSet migration    | **Decoupled**; global notification subscription; stays a separate later task |
| 5   | Notification mechanism      | **ArgoCD Notifications** (built-in controller)                               |
| 6   | Semver tool                 | **release-please**                                                           |
| 7   | Catalog form                | **Both** — GitHub Deployment per repo + infra roll-up file                   |
| 8   | App version display         | **Replace** — semver only, via `git describe`                                |
| 8a  | Telegram sender             | The **infra Action** (resolves and shows `v0.3.0`)                           |
| 8b  | authos monorepo versioning  | **Four independent** component versions                                      |
| 8c  | GitHub Deployment auth      | **Fine-grained PAT** now (GitHub App later if wanted)                        |
| 8d  | doma automated version line | Continue from `v0.2.0`; next release is `v0.3.0`                             |

## Architecture

```
                    ┌─────────────────────────────────────────┐
  git push main  →  │ app CI: check → build+push alpha-<sha>   │
                    │        → kustomize edit set image        │
                    │        → commit to infra repo            │
                    └──────────────────┬──────────────────────┘
                                       │ infra commit
                                       ▼
                            ArgoCD auto-sync
                                       │
                    Synced + Healthy on new revision
                                       │
                    ArgoCD Notifications: trigger on-deployed
                          (oncePer: app.status.sync.revision)
                                       │ webhook → repository_dispatch
                                       ▼
             infra repo .github/workflows/deploy-catalog.yml
              1. resolve alpha-<sha> → git describe semver
              2. append deployments/history.jsonl   (merge=union)
              3. regenerate deployments/CATALOG.md
              4. GitHub Deployment on the app repo → success
              5. Telegram message via the infra bot
```

One signal. One receiver. Three visible outputs.

## Component A — ArgoCD Notifications (infra repo)

New directory `core/argocd/notifications/`, tracked in git, applied out-of-band
(same convention as the existing configmaps). It contains:

### `argocd-notifications-cm.yaml`

- **`trigger.on-deployed`** — ported from the upstream notifications catalog:

  ```yaml
  trigger.on-deployed: |
    - description: Application is synced and healthy. Triggered once per revision.
      oncePer: app.status.sync.revision
      when: >-
        app.status.operationState != nil and
        app.status.operationState.phase in ['Succeeded'] and
        app.status.health.status == 'Healthy' and
        app.status.sync.status == 'Synced'
      send: [app-deployed]
  ```

  The `operationState != nil` guard prevents a template error before the first
  sync operation.

- **`service.webhook.gh-infra`**:

  ```yaml
  service.webhook.gh-infra: |
    url: https://api.github.com/repos/stevetosak/hetzner-cloud-infra/dispatches
    headers:
    - name: Authorization
      value: token $github-token
    - name: Accept
      value: application/vnd.github+json
    - name: User-Agent
      value: argocd-notifications
  ```

- **`template.app-deployed`**:

  ```yaml
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
              "image": "{{index .app.status.summary.images 0}}"
            }
          }
  ```

- **Global subscription** — no per-Application annotation:

  ```yaml
  subscriptions: |
    - recipients: [gh-infra]
      triggers: [on-deployed]
  ```

### `argocd-notifications-secret.yaml`

A template with a blank value (infra `credentials.yaml` convention). One key:

- `github-token` — a **fine-grained PAT**, repo `stevetosak/hetzner-cloud-infra`,
  permission `Contents: read and write` (needed for `repository_dispatch`). The
  user creates it and applies it with `kubectl`.

### Apply procedure (documented, run by the user)

```
kubectl apply -f core/argocd/notifications/argocd-notifications-cm.yaml
kubectl -n argocd create secret generic argocd-notifications-secret \
  --from-literal=github-token=<PAT> --dry-run=client -o yaml | kubectl apply -f -
```

## Component B — release-please (app repos)

### doma (pilot, this project's own PR)

- `release-please-config.json`:
  ```json
  {
    "release-type": "node",
    "packages": { ".": { "package-name": "doma" } },
    "include-component-in-tag": false,
    "changelog-sections": [
      { "type": "feat", "section": "Features" },
      { "type": "fix", "section": "Fixes" },
      { "type": "refactor", "section": "Refactors" },
      { "type": "docs", "section": "Docs", "hidden": true }
    ]
  }
  ```
- `.release-please-manifest.json`: `{ ".": "0.2.0" }`.
- `.github/workflows/release-please.yml` — `on: push: branches: [main]`, job runs
  `googleapis/release-please-action@v4`. It maintains a rolling release PR.
  Merging the release PR tags `v0.3.0`, cuts the GitHub Release, writes
  `CHANGELOG.md`.
- `package.json` `version` is bumped by the release PR. It is display-only; no
  build reads it.
- Note: `v0.1.0` / `v0.2.0` already exist as tags — release-please reads the
  manifest, not the tag list, so starting the manifest at `0.2.0` makes the next
  release `0.3.0` cleanly.

### authos monorepo (follow-up PR)

- **Manifest mode**, four components:
  ```json
  {
    "packages": {
      "authos-api": { "release-type": "simple", "package-name": "authos-api" },
      "authos-ui": { "release-type": "node", "package-name": "authos-ui" },
      "duster": { "release-type": "simple", "package-name": "duster" },
      "authos-demo": { "release-type": "node", "package-name": "authos-demo" }
    },
    "separate-pull-requests": true,
    "include-component-in-tag": true
  }
  ```
- Tags: `authos-api-v1.2.3`, `authos-ui-v1.2.3`, `duster-v1.2.3`,
  `authos-demo-v1.2.3`. Independent version lines.
- release-please path-scopes each component to its subdirectory, so a
  `feat(authos-api): …` commit only bumps `authos-api`. The team already writes
  scoped Conventional Commits.
- `.release-please-manifest.json` seeds each at the current de-facto version
  (start `0.1.0` unless the user prefers otherwise).

### wasteio (follow-up PR)

Same single-repo pattern as doma if the three components share a version, or
manifest mode if not. Decide when that PR is planned.

### imaps

Out of scope until it is an ArgoCD app.

## Component C — Version catalog (infra repo)

### `deployments/apps.json`

The map from ArgoCD Application name to source repo and tag conventions:

```json
{
  "doma": { "repo": "stevetosak/doma", "subdir": ".", "tagPrefix": "v" },
  "authos-api": {
    "repo": "stevetosak/authos",
    "subdir": "authos-api",
    "tagPrefix": "authos-api-v"
  },
  "authos-ui": {
    "repo": "stevetosak/authos",
    "subdir": "authos-frontend",
    "tagPrefix": "authos-ui-v"
  },
  "duster": {
    "repo": "stevetosak/authos",
    "subdir": "duster",
    "tagPrefix": "duster-v"
  },
  "authos-demo": {
    "repo": "stevetosak/authos",
    "subdir": "authos-demo",
    "tagPrefix": "authos-demo-v"
  },
  "wasteio-api": {
    "repo": "stevetosak/wasteio",
    "subdir": "...",
    "tagPrefix": "wasteio-api-v"
  },
  "wasteio-frontend": {
    "repo": "stevetosak/wasteio",
    "subdir": "...",
    "tagPrefix": "wasteio-frontend-v"
  },
  "wasteio-bin-agents": {
    "repo": "stevetosak/wasteio",
    "subdir": "...",
    "tagPrefix": "wasteio-bin-agents-v"
  }
}
```

`subdir` values for authos/wasteio are filled in when those apps join. An
unknown app name → the Action logs a warning, records the row with
`version: "unknown"`, and still notifies.

### `deployments/history.jsonl`

Append-only. `.gitattributes`: `deployments/history.jsonl merge=union`.

```json
{
  "app": "doma",
  "version": "v0.3.0",
  "sha": "abc1234def...",
  "image": "alpha-abc1234def...",
  "env": "dev",
  "deployed_at": "2026-09-08T14:22:03Z",
  "argocd_revision": "faf7615..."
}
```

- `sha` is the app git sha, parsed from the `image` tag (`alpha-<sha>`).
- `version` is `git describe --tags --always --match "<tagPrefix>*"` run against
  the app repo at `sha`. For doma that is `v0.3.0` or `v0.3.0-5-gabc1234`; for a
  component it is `authos-api-v1.2.3-5-gabc1234` (the Action strips the prefix
  for display).
- `env` is `"dev"` today; the field exists so `staging`/`prod` are new values,
  not a schema change.

### `deployments/CATALOG.md`

Regenerated from `history.jsonl` by `deployments/render-catalog.mjs` (Node, no
dependencies). Layout:

- **Current** — one row per app: app, version, sha (short, linked to the app
  repo commit), `deployed_at`, env.
- **Recent history** — the last 20 rows, newest first, inside a
  `<details>` block.

### `.github/workflows/deploy-catalog.yml`

```yaml
on:
  repository_dispatch:
    types: [deploy-live]
  workflow_dispatch:
    inputs:
      payload:
        {
          description: 'JSON client_payload for a manual replay',
          required: true,
        }
```

Steps:

1. **Parse** `app`, `image`, `revision` from `github.event.client_payload` (or
   the `workflow_dispatch` input). Derive `sha` from `image`
   (`stevetosak/<app>:alpha-<sha>` → `<sha>`).
2. **Look up** `apps.json[app]`. Unknown → warn, `version = "unknown"`, skip to
   step 6.
3. **Resolve semver** — `git clone --filter=blob:none` the app repo, `git fetch
--tags`, `git describe --tags --always --match "<tagPrefix>*" <sha>`.
4. **Append** the JSONL row to `history.jsonl` — but only if no row already has
   this `app`+`sha` (idempotent replay).
5. **Regenerate** `CATALOG.md`. Commit `chore: catalog <app> <version> [skip ci]`
   with `git pull --rebase` before push (two apps can deploy near-simultaneously;
   `merge=union` on the JSONL plus rebase-retry on the commit handles it).
6. **GitHub Deployment** — `POST /repos/<app-repo>/deployments`
   (`environment: dev`, `ref: <sha>`, `auto_merge: false`,
   `required_contexts: []`), then `POST .../deployments/<id>/statuses`
   (`state: success`, `environment_url: https://<app>.tosak.net`,
   `log_url: <CATALOG.md anchor>`). Uses `secrets.APP_DEPLOY_PAT`. Idempotent:
   if a `success` deployment already exists for `(dev, sha)`, skip.
7. **Telegram** — `POST https://api.telegram.org/bot<token>/sendMessage`
   (`secrets.INFRA_TELEGRAM_BOT_TOKEN`, `secrets.INFRA_TELEGRAM_CHAT_ID`),
   Markdown body:

   ```
   ✅ *<app>* `<version>` is live
   `<sha:7>` · <deployed_at HH:MM> · [catalog](<CATALOG.md link>)
   ```

### Infra repo secrets (user-supplied)

| Secret                     | What                                          | Scope                                                                                         |
| -------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `APP_DEPLOY_PAT`           | Fine-grained PAT                              | `Deployments: read and write` on `stevetosak/doma`, `stevetosak/authos`, `stevetosak/wasteio` |
| `INFRA_TELEGRAM_BOT_TOKEN` | The dedicated infra bot token from @BotFather | —                                                                                             |
| `INFRA_TELEGRAM_CHAT_ID`   | The chat/channel id the bot posts to          | —                                                                                             |

`argocd-notifications-secret.github-token` (the cluster PAT for
`repository_dispatch`) is separate and set with `kubectl`, not a GitHub secret.

## Component D — `git describe` version string (app repos)

Per app, starting with doma in its own PR:

| File                             | Change                                                                                                                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile`                     | `ARG APP_VERSION=dev` / `ENV APP_VERSION=$APP_VERSION`. Remove `GIT_SHA` (doma has no other consumer — verified).                                                                                                          |
| `.github/workflows/deploy.yaml`  | `actions/checkout@v4` → `with: { fetch-depth: 0, fetch-tags: true }`. New step: `APP_VERSION=$(git describe --tags --always --dirty=+ --match 'v*')`. Pass `build-args: APP_VERSION=${{ steps.ver.outputs.APP_VERSION }}`. |
| `src/core/version.functions.ts`  | Return `optionalEnv('APP_VERSION', 'dev')` whole. Drop `.slice(0, 7)`. Update the doc comment.                                                                                                                             |
| `src/routes/api/health/index.ts` | Reads `GIT_SHA` **directly** (not through `getAppVersion()`). Change `optionalEnv('GIT_SHA', 'dev').slice(0, 7)` → `optionalEnv('APP_VERSION', 'dev')`.                                                                    |
| `src/core/ui/AppShell.tsx`       | No code change — renders `version` from the route context, which comes from `getAppVersion()`. Shows `doma · v0.3.0` or `doma · v0.3.0-5-gabc1234`.                                                                        |

For the authos/wasteio components later, `--match` uses the component tag prefix
(`authos-api-v*`), and the shown string strips the prefix.

## Data contracts

### `repository_dispatch` payload (ArgoCD → infra Action)

```json
{
  "event_type": "deploy-live",
  "client_payload": {
    "app": "doma",
    "project": "default",
    "revision": "faf76159214ae7b59d3c978f3404409b77f2b644",
    "image": "stevetosak/doma:alpha-abc1234def5678..."
  }
}
```

### JSONL row — see Component C.

### `apps.json` — see Component C.

## Testing

- **ArgoCD config.**
  - `kubectl apply --dry-run=server -f core/argocd/notifications/argocd-notifications-cm.yaml`.
  - Render the webhook body from the controller pod:
    `kubectl -n argocd exec deploy/argocd-notifications-controller -- \
 /app/argocd-notifications template notify app-deployed doma --recipient gh-infra`.
  - Live test: trigger a sync of one small app; assert exactly one
    `repository_dispatch`; sync the same revision again and assert **no** second
    event (`oncePer`).
- **release-please.** Push a `feat:` commit to a scratch branch off `main`;
  confirm the release PR proposes `0.3.0`. `release-please` action has a
  built-in dry mode via a label; also assert the generated `CHANGELOG.md`
  section.
- **catalog Action.** Use the `workflow_dispatch` `payload` input with a fake
  event. Assert: the `CATALOG.md` diff, one appended JSONL line, a re-run with
  the same payload appends nothing, a GitHub Deployment on a throwaway repo/env.
- **`git describe` version.** A doma test asserts the CI step yields a non-`dev`
  string. A snapshot of the `AppShell` footer with `APP_VERSION` set.
- **End-to-end.** After the infra PR and the doma PR merge, the next doma commit
  to `main` produces: an `alpha-<sha>` deploy, an ArgoCD `Healthy`, one
  `deploy-live` dispatch, one `CATALOG.md` row, one GitHub Deployment on
  `stevetosak/doma`, one Telegram message showing the `git describe` version.

## Error handling and edge cases

| Case                                                        | Behaviour                                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Health flaps `Healthy`→`Degraded`→`Healthy` on one revision | `oncePer: app.status.sync.revision` suppresses the repeat.                                                                                                         |
| `operationState` nil before first sync                      | The `!= nil` guard in `when` skips the trigger.                                                                                                                    |
| `repository_dispatch` POST fails                            | ArgoCD Notifications retries with backoff; a persistent failure is controller-logged only. `argocd app` state is the backstop.                                     |
| Catalog Action fails partway                                | JSONL append deduped on `app`+`sha`; GitHub Deployment idempotent per `(env, sha)`; Telegram is last. Re-fire the dispatch, or run the `workflow_dispatch` replay. |
| Two apps deploy within seconds                              | `merge=union` on `history.jsonl`; the commit step does `git pull --rebase` and retries push.                                                                       |
| App has no tag yet (never released)                         | `git describe --always` yields a bare `<sha:7>`; the row records `version` as `"v0.0.0+<sha:7>"` — still a row, still a message.                                   |
| Unknown app name in `apps.json`                             | Warn; `version: "unknown"`; still append + notify; no GitHub Deployment.                                                                                           |
| `imaps` (not an ArgoCD app)                                 | No Application → no event. Nothing to handle.                                                                                                                      |
| `wasteio-bin-agents` `OutOfSync`                            | `sync.status != Synced` → the trigger never fires until it is fixed. No special-casing.                                                                            |
| Multi-container app (`status.summary.images` length > 1)    | v1 takes `index 0`. wasteio simulator/mosquitto are not in the app list. Revisit if needed.                                                                        |

## Rollout order (one PR per step unless noted)

1. **Infra PR 1 — notifications + catalog.**
   `core/argocd/notifications/` (cm + secret template + apply doc);
   `.github/workflows/deploy-catalog.yml`; `deployments/apps.json` (doma filled,
   others stubbed); `deployments/history.jsonl` (empty); `deployments/render-catalog.mjs`;
   `deployments/CATALOG.md` (generated header); `.gitattributes` `merge=union`
   line. Branched off `origin/master`.
   **User actions before merge:** create the infra bot (@BotFather), the chat,
   the three GitHub secrets, and the cluster PAT; apply the cm + secret with
   `kubectl`.
2. **doma PR — semver + version string.**
   `release-please-config.json`, `.release-please-manifest.json`,
   `.github/workflows/release-please.yml`; `Dockerfile`, `deploy.yaml`,
   `src/core/version.functions.ts` changes; tests.
3. **Verify** end-to-end on the next doma merge (see Testing → End-to-end).
4. **Follow-up PR — authos** release-please manifest mode, four components;
   `apps.json` `subdir` values; `git describe` `--match` per component in each
   authos CI workflow.
5. **Follow-up PR — wasteio** same pattern.
6. **Separate later task — ApplicationSet migration.** When it lands, its
   generator template must set the same catalog labels the Applications carry
   (nothing to change in this design; a note for that task).

## Out of scope

- The ApplicationSet migration (its own task).
- `imaps` onboarding to ArgoCD.
- Fixing `wasteio-bin-agents` `OutOfSync`.
- `staging` / `prod` environments — the schema holds an `env` field for them;
  no environment is added now.
- The `argocd app history` RBAC gap.
- Any change to the deploy mechanism, the image tag, or the overlay `newTag`.

## Prerequisites the user must provide

| Item                                                                                                          | For           |
| ------------------------------------------------------------------------------------------------------------- | ------------- |
| A dedicated Telegram bot (@BotFather) + a chat id                                                             | Infra PR 1    |
| Infra repo secrets `INFRA_TELEGRAM_BOT_TOKEN`, `INFRA_TELEGRAM_CHAT_ID`                                       | Infra PR 1    |
| Infra repo secret `APP_DEPLOY_PAT` (fine-grained, `Deployments: write` on doma/authos/wasteio)                | Infra PR 1    |
| Cluster secret `argocd-notifications-secret.github-token` (fine-grained, `Contents: write` on the infra repo) | Infra PR 1    |
| `kubectl apply` of the cm + secret (classifier blocks Claude)                                                 | Infra PR 1    |
| Confirmation of authos/wasteio component subdirs and seed versions                                            | Follow-up PRs |
