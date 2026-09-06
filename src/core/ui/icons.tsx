/**
 * A small, hand-picked action-icon set (§ bucket 4 extension) — plain
 * geometric strokes at a thin weight, not a dropped-in generic icon-library
 * look. `currentColor` throughout so each icon inherits whatever ink/accent
 * tone its surrounding text already carries.
 */
type IconProps = { className?: string }

const BASE_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function PlusIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function MinusIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function CheckIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

export function SkipIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M6 5v14l9-7z" />
      <path d="M18 5v14" />
    </svg>
  )
}

export function EditIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

export function TrashIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M4 7h16" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </svg>
  )
}

export function UndoIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M3 10a8 8 0 1 1 2.3 5.7" />
      <path d="M3 4v6h6" />
    </svg>
  )
}

export function CloseIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function BellIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  )
}

/**
 * The drag handle for reorderable rows (§2.11) — the one glyph-only place
 * `--color-ink-ghost` is legal. Filled dots, not a stroke, since a grip
 * mark reads better solid at this size.
 */
export function GripIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  )
}

/** Today tab — a calendar with today's date marked. */
export function CalendarDotIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <circle cx="12" cy="15.5" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Chores tab — a checklist. */
export function ListChecksIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M4 6.5l1.5 1.5L8 5.5" />
      <path d="M11 6.5h9" />
      <path d="M4 12.5l1.5 1.5L8 11.5" />
      <path d="M11 12.5h9" />
      <path d="M4 18.5l1.5 1.5L8 17.5" />
      <path d="M11 18.5h9" />
    </svg>
  )
}

/** Shopping tab — a basket. */
export function BasketIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M4.5 9.5h15l-1.4 9.3a2 2 0 0 1-2 1.7H7.9a2 2 0 0 1-2-1.7L4.5 9.5z" />
      <path d="M8.5 9.5l1.2-4.5M15.5 9.5l-1.2-4.5" />
      <path d="M9.5 13v4M14.5 13v4" />
    </svg>
  )
}
