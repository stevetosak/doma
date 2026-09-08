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
