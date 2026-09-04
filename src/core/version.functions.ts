import { createServerFn } from '@tanstack/react-start'
import { optionalEnv } from '#/core/env'

/**
 * `GIT_SHA` is baked into the image at Docker build time (see the
 * Dockerfile's `ARG`/`ENV` and deploy.yaml's `build-args`) — not something
 * a local `.env.local` sets, hence `optionalEnv`'s `'dev'` fallback.
 */
export const getAppVersion = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ version: string }> => {
    return { version: optionalEnv('GIT_SHA', 'dev').slice(0, 7) }
  },
)
