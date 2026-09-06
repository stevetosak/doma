import type { ReactNode } from 'react'

/**
 * The label + control pairing every form on the site uses (§2.5). Just the
 * label typography and spacing — the control itself keeps its own markup
 * so this stays useful for inputs, selects, steppers and segmented
 * controls alike.
 */
export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink-dim">{label}</span>
      {children}
    </label>
  )
}
