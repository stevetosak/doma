import { useState } from 'react'
import type { ReactNode } from 'react'

/**
 * "File, don't delete" (§2.7) — completed/skipped items file here instead
 * of vanishing, and stay un-filable. The rotated-paper metaphor is
 * dropped; the toggle is a plain inset row with a three-rule glyph.
 */
export function DoneStack({
  labelClosed,
  labelOpen,
  items,
}: {
  labelClosed: string
  labelOpen: string
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
        className="flex items-center gap-2 rounded-control bg-inset px-[15px] py-[13px] text-sm text-ink-dim"
      >
        <span aria-hidden="true" className="flex flex-col gap-[3px]">
          <span className="h-0.5 w-4 rounded-full bg-ink-ghost" />
          <span className="h-0.5 w-4 rounded-full bg-ink-ghost" />
          <span className="h-0.5 w-4 rounded-full bg-ink-ghost" />
        </span>
        {open ? labelOpen : labelClosed}
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map((item, i) => (
            <li
              key={item.id}
              className="slip flex w-fit items-center gap-3 rounded-control bg-inset px-[15px] py-[13px] text-[13.5px] text-second"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span>{item.content}</span>
              {item.actions?.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="flex items-center gap-1 text-ink-dim underline decoration-dotted underline-offset-4"
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
