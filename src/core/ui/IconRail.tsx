import type { ComponentProps, ReactNode } from 'react'

export interface IconRailAction {
  key: string
  icon: ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
  /** A small count badge over the icon's corner — the reminder bell (§2.1). */
  badge?: number
  /**
   * When set, these props are spread onto the slot's <button>, ahead of
   * the fixed props — used to make one slot a @dnd-kit sortable activator
   * (ref + drag listeners) rather than a click action. A `className` here
   * is appended to the base cell styles, not replaced.
   */
  handleProps?: ComponentProps<'button'>
}

/**
 * The action-icon row that replaced `FlipCard`'s back-face text links
 * (§2.1). Every button is a full 44px-tall touch target, icon-only, with a
 * hairline divider between neighbors — no background until pressed or
 * hovered, so the row reads as part of the card face rather than a
 * separate toolbar. One slot may be a drag handle via `handleProps`.
 */
export function IconRail({ actions }: { actions: IconRailAction[] }) {
  return (
    <div className="mt-1 flex items-stretch border-t border-line">
      {actions.map((action, i) => {
        const base = `flex h-11 flex-1 items-center justify-center text-ink-dim transition-colors hover:bg-inset hover:text-ink active:bg-inset disabled:opacity-40 ${
          i > 0 ? 'border-l border-line' : ''
        }`
        const { className: handleClass, ...handleRest } =
          action.handleProps ?? {}
        return (
          <button
            key={action.key}
            {...handleRest}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            aria-label={action.label}
            title={action.label}
            className={handleClass ? `${base} ${handleClass}` : base}
          >
            <span className="relative inline-flex">
              {action.icon}
              {action.badge != null && action.badge > 0 && (
                <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-[3px] text-[10px] leading-none font-semibold text-card">
                  {action.badge > 9 ? '9+' : action.badge}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
