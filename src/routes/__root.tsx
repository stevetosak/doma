import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import appCss from '../styles.css?url'
import { getAuthContext } from '#/core/auth/auth-context.functions'
import { ServiceWorkerRegistrar } from '#/core/pwa/ServiceWorkerRegistrar'

export const Route = createRootRoute({
  // §5.4: resolved server-side before the first byte, so authenticated
  // HTML renders on first load rather than flashing logged-out.
  beforeLoad: async () => {
    const auth = await getAuthContext()
    return { auth }
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'doma',
      },
      {
        name: 'theme-color',
        content: '#3a3a38',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'manifest',
        href: '/manifest.webmanifest',
      },
      {
        rel: 'apple-touch-icon',
        href: '/icons/apple-touch-icon.png',
      },
      {
        rel: 'icon',
        href: '/icons/icon-192.png',
        type: 'image/png',
      },
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
        {children}
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
