import type { ReactNode } from 'react'
import { useRouteContext } from '@tanstack/react-router'
import { TabSpine } from '#/core/ui/TabSpine'
import { useAmbientWash } from '#/core/ui/useAmbientWash'

/**
 * The box open on the counter (§3 first viewport): the tab spine plus the
 * ambient time-of-day wash wrap every authenticated household surface.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const washStyle = useAmbientWash()
  const { version } = useRouteContext({ from: '__root__' })

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 transition-[background-image] duration-[3000ms] ease-linear"
        style={washStyle}
      />
      <TabSpine />
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-24 md:pt-10 md:pr-8 md:pb-10 md:pl-24">
        {children}
        <p className="mt-16 font-mono text-[11px] tracking-wide text-ink-faint">
          doma · {version}
        </p>
      </main>
    </div>
  )
}
