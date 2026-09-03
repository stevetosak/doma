import { Link } from '@tanstack/react-router'

const MODULES = [
  { id: 'today', label: 'Today', href: '/' as const },
  { id: 'chores', label: 'Chores', href: '/chores' as const },
  { id: 'shopping', label: 'Shopping', href: '/shopping' as const },
]

/**
 * Honest blank tabs for the not-yet-built modules (§3, §6) — doma's real
 * architecture, made physically legible: a module is a new divider, never a
 * redesign. Same weight as the active tabs, no placeholder label.
 */
const RESERVED = ['Meals', 'Bills', 'Maintenance']

const linkActiveProps = {
  activeOptions: { exact: true },
} as const

export function TabSpine() {
  return (
    <>
      <nav
        aria-label="Household modules"
        className="fixed inset-y-0 left-0 z-20 hidden w-16 flex-col items-stretch gap-1 bg-kraft-dark pt-28 shadow-spine md:flex"
      >
        {MODULES.map((tab) => (
          <SpineTab key={tab.id} label={tab.label} href={tab.href} />
        ))}
        <div className="mt-2 flex flex-col gap-1">
          {RESERVED.map((label) => (
            <ReservedSpineTab key={label} label={label} />
          ))}
        </div>
      </nav>

      <nav
        aria-label="Household modules"
        className="fixed inset-x-0 bottom-0 z-20 flex items-stretch justify-around border-t-2 border-kraft bg-card shadow-spine md:hidden"
      >
        {MODULES.map((tab) => (
          <BarTab key={tab.id} label={tab.label} href={tab.href} />
        ))}
        {RESERVED.map((label) => (
          <ReservedBarTab key={label} label={label} />
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

function ReservedSpineTab({ label }: { label: string }) {
  return (
    <div
      aria-disabled="true"
      className="flex h-14 items-center justify-center border-y border-kraft/40"
    >
      <span className="sr-only">{label} — reserved for a future module</span>
    </div>
  )
}

function BarTab({ label, href }: { label: string; href: string }) {
  return (
    <Link
      to={href}
      {...linkActiveProps}
      className="flex flex-1 flex-col items-center gap-0.5 px-2 py-2 font-display text-sm text-ink-dim [&.active]:text-rust"
    >
      {label}
    </Link>
  )
}

function ReservedBarTab({ label }: { label: string }) {
  return (
    <div
      aria-disabled="true"
      className="flex flex-1 flex-col items-center gap-0.5 border-x border-kraft/40 px-2 py-2"
    >
      <span className="sr-only">{label} — reserved for a future module</span>
    </div>
  )
}
