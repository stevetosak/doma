import type { ReactNode } from 'react'
import { CheckIcon } from '#/core/ui/icons'

/**
 * The styled checkbox (§2.5) — Settings' module list and any remaining
 * plain toggle list. Native input stays for a11y/keyboard, visually
 * hidden under a custom box.
 */
export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: ReactNode
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <span className="relative inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border border-line bg-card">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        {checked && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[7px] bg-second">
            <CheckIcon className="h-3.5 w-3.5 text-card" />
          </span>
        )}
      </span>
      {label}
    </label>
  )
}
