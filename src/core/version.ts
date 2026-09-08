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
