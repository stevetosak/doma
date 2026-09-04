/**
 * A small, hand-picked action-icon set (§ bucket 4 extension) — plain
 * geometric strokes at a thin weight, not a dropped-in generic icon-library
 * look. `currentColor` throughout so each icon inherits whatever ink/rust
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
