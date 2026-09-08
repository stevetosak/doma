import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import appCss from '../styles.css?url'
import { getAuthContext } from '#/core/auth/auth-context.functions'
import { appleSplashLinks } from '#/core/pwa/apple-splash-links'
import { ServiceWorkerRegistrar } from '#/core/pwa/ServiceWorkerRegistrar'
import { ToastProvider } from '#/core/ui/Toast'
import { getAppVersion } from '#/core/version.functions'

// Canonical origin — only used to make the Open Graph image URL absolute
// (link-preview scrapers reject relative paths). The app itself is
// origin-relative everywhere else.
const SITE_URL = 'https://doma.tosak.net'
const DESCRIPTION = 'The household hub — chores, shopping, and more.'

export const Route = createRootRoute({
  // §5.4: resolved server-side before the first byte, so authenticated
  // HTML renders on first load rather than flashing logged-out.
  beforeLoad: async () => {
    const [auth, { version }] = await Promise.all([
      getAuthContext(),
      getAppVersion(),
    ])
    return { auth, version }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'doma' },
      { name: 'description', content: DESCRIPTION },
      { name: 'theme-color', content: '#8c2f24' },
      // Installed-app behaviour on iOS + Android.
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      { name: 'apple-mobile-web-app-title', content: 'doma' },
      // Link previews (invite links pasted into a chat).
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'doma' },
      { property: 'og:title', content: 'doma — the household hub' },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:url', content: SITE_URL },
      { property: 'og:image', content: `${SITE_URL}/og.png` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'doma — the household hub' },
      { name: 'twitter:description', content: DESCRIPTION },
      { name: 'twitter:image', content: `${SITE_URL}/og.png` },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      {
        rel: 'icon',
        href: '/favicon.svg',
        type: 'image/svg+xml',
        sizes: 'any',
      },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' },
      ...appleSplashLinks,
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegistrar />
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
