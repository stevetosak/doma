import type { ReactNode } from 'react'
import { useRouteContext } from '@tanstack/react-router'
import { AppLogo } from '#/core/ui/AppLogo'
import { TabSpine } from '#/core/ui/TabSpine'
import { useAmbientWash } from '#/core/ui/useAmbientWash'

/**
 * The box open on the counter (§3 first viewport): the tab spine plus the
 * ambient time-of-day wash wrap every authenticated household surface.
 * `ToastProvider` lives in `__root.tsx`, not here — `ShoppingPage`'s own
 * body needs `useToast()` for the deferred-delete undo, and a page's own
 * hook calls resolve against its *caller's* position in the tree, not
 * against something the page itself renders (this `AppShell` included) —
 * so the provider has to sit above every route, not inside this shell.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const washStyle = useAmbientWash()
  const { version } = useRouteContext({ from: '__root__' })

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden="true"
        className="ambient-wash pointer-events-none fixed inset-0 -z-10 transition-[background-image] duration-[3000ms] ease-linear"
        style={washStyle}
      />
      <TabSpine />
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-[calc(104px+env(safe-area-inset-bottom))] md:pt-10 md:pr-8 md:pb-10 md:pl-24">
        <AppLogo className="mb-8 md:hidden" />
        {children}
        <p className="mt-16 text-[11px] text-ink-dim">doma · {version}</p>
      </main>
    </div>
  )
}
