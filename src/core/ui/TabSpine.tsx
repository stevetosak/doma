import { Link } from '@tanstack/react-router'
import { AppMark } from '#/core/ui/AppMark'
import { BasketIcon, CalendarDotIcon, ListChecksIcon } from '#/core/ui/icons'
import type { ComponentType } from 'react'

const MODULES: {
  id: string
  label: string
  href: '/' | '/chores' | '/shopping'
  Icon: ComponentType<{ className?: string }>
}[] = [
  { id: 'today', label: 'Today', href: '/', Icon: CalendarDotIcon },
  { id: 'chores', label: 'Chores', href: '/chores', Icon: ListChecksIcon },
  { id: 'shopping', label: 'Shopping', href: '/shopping', Icon: BasketIcon },
]

const linkActiveProps = {
  activeOptions: { exact: true },
} as const

/**
 * Three tabs, no reserved slots (§2.10) — a not-yet-built module just adds
 * a tab when it ships. The "honest blank divider" convention retired with
 * the rest of the box vocabulary.
 */
export function TabSpine() {
  return (
    <>
      <nav
        aria-label="Household modules"
        className="fixed inset-y-0 left-0 z-20 hidden w-16 flex-col items-stretch gap-1 bg-[#2b2f2a] pt-6 shadow-lifted md:flex"
      >
        <div className="flex justify-center pt-2 pb-6" aria-hidden="true">
          <AppMark className="h-9 w-9 text-card" />
        </div>
        {MODULES.map((tab) => (
          <SpineTab key={tab.id} label={tab.label} href={tab.href} />
        ))}
      </nav>

      <nav
        aria-label="Household modules"
        className="fixed inset-x-0 bottom-0 z-20 flex items-stretch justify-around border-t border-[rgb(29_35_32_/_0.08)] bg-[rgb(246_243_236_/_0.72)] pb-[calc(24px+env(safe-area-inset-bottom))] shadow-[0_-10px_26px_-16px_rgb(29_35_32_/_0.3)] backdrop-blur-[26px] backdrop-saturate-[1.4] md:hidden"
      >
        {MODULES.map((tab) => (
          <BarTab
            key={tab.id}
            label={tab.label}
            href={tab.href}
            Icon={tab.Icon}
          />
        ))}
      </nav>
    </>
  )
}

function SpineTab({ label, href }: { label: string; href: string }) {
  return (
    <Link
      to={href}
      {...linkActiveProps}
      className="relative flex h-20 items-center justify-center px-1 font-display text-sm text-card/90 transition-colors [&.active]:bg-card [&.active]:text-ink"
    >
      {({ isActive }: { isActive: boolean }) => (
        <span
          style={{ writingMode: isActive ? 'horizontal-tb' : 'vertical-rl' }}
        >
          {label}
        </span>
      )}
    </Link>
  )
}

function BarTab({
  label,
  href,
  Icon,
}: {
  label: string
  href: string
  Icon: ComponentType<{ className?: string }>
}) {
  return (
    <Link
      to={href}
      {...linkActiveProps}
      className="flex flex-1 flex-col items-center justify-center gap-1 px-2 py-3"
    >
      {({ isActive }: { isActive: boolean }) => (
        <>
          <Icon
            className={`h-[23px] w-[23px] transition-transform duration-[240ms] ${
              isActive ? 'scale-[1.12] text-accent' : 'text-ink-dim'
            }`}
          />
          <span
            className={`text-[11.5px] font-semibold ${
              isActive ? 'text-accent' : 'text-ink-dim'
            }`}
          >
            {label}
          </span>
        </>
      )}
    </Link>
  )
}
