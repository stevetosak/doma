import type { ReactNode } from 'react'
import { PlusIcon, TrashIcon } from '#/core/ui/icons'

/**
 * The add/remove/cap-enforcement shell every per-item reminder editor
 * uses (chores: day-offset + time-of-day rows; shopping: a single
 * date+time row) — shared because the fiddly part (list state, presets,
 * the "Maximum N" note) is identical; the row content itself is not.
 */
export function ReminderListEditor<T extends { key: number }>({
  rows,
  max,
  onAdd,
  onRemove,
  renderRow,
  presets,
}: {
  rows: T[]
  max: number
  onAdd: () => void
  onRemove: (key: number) => void
  renderRow: (row: T) => ReactNode
  presets?: { label: string; onClick: () => void }[]
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-xs tracking-wide text-ink-dim">
        Reminders
      </span>

      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              {renderRow(row)}
              <button
                type="button"
                onClick={() => onRemove(row.key)}
                className="flex items-center gap-1 font-mono text-[11px] tracking-wide text-ink-faint underline decoration-dotted underline-offset-4"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {presets?.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={rows.length >= max}
            onClick={preset.onClick}
            className="rounded-tab border border-kraft px-3 py-1.5 font-mono text-[11px] tracking-wide text-ink disabled:opacity-50"
          >
            + {preset.label}
          </button>
        ))}
        <button
          type="button"
          disabled={rows.length >= max}
          onClick={onAdd}
          className="flex items-center gap-1 rounded-tab border border-dotted border-kraft px-3 py-1.5 font-mono text-[11px] tracking-wide text-ink-faint disabled:opacity-50"
        >
          <PlusIcon className="h-3 w-3" />
          Blank
        </button>
      </div>

      {rows.length >= max && (
        <p className="font-mono text-[11px] text-ink-faint">
          Maximum {max} reminders.
        </p>
      )}
    </div>
  )
}
