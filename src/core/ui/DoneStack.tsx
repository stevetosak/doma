import { useState } from 'react'
import type { ReactNode } from 'react'

/**
 * "Stamp, don't delete" (§3 raise, donated by the declined jet-age-
 * ticket-wallet challenger) — completed/skipped items file face-down here
 * instead of vanishing, and stay riffle-able.
 */
export function DoneStack({
  label,
  items,
}: {
  label: string
  items: {
    id: string
    content: ReactNode
    actions?: { label: string; icon?: ReactNode; onClick: () => void }[]
  }[]
}) {
  const [open, setOpen] = useState(false)

  if (items.length === 0) return null

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 font-mono text-xs tracking-wide text-ink-faint"
      >
        <span
          aria-hidden="true"
          className="relative flex h-7 w-9 items-center justify-center"
        >
          <span className="absolute h-5 w-6 -translate-x-1 -translate-y-0.5 -rotate-12 rounded-sm border border-kraft/60 bg-card-back" />
          <span className="absolute h-5 w-6 translate-x-1 translate-y-0.5 rotate-6 rounded-sm border border-kraft/60 bg-card shadow-card" />
        </span>
        {items.length} {label} — {open ? 'hide' : 'riffle through'}
      </button>
      {open && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {items.map((item, i) => (
            <li
              key={item.id}
              className="ruled flex w-fit items-center gap-3 rounded-sm border border-kraft/40 bg-card-back px-3 py-1.5 font-mono text-xs text-blue shadow-card"
              style={{ transform: `rotate(${i % 2 === 0 ? -0.5 : 0.5}deg)` }}
            >
              <span>{item.content}</span>
              {item.actions?.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="flex items-center gap-1 text-ink-faint underline decoration-dotted underline-offset-4"
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
