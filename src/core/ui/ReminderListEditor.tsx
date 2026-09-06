import type { ReactNode } from 'react'
import { PlusIcon } from '#/core/ui/icons'

/**
 * The add/remove/cap-enforcement shell every per-item reminder editor uses
 * (§2.9 — resolves #71: both forms now share the same row card, only the
 * when-control and cap differ, which is data, not styling).
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
      <span className="text-xs font-semibold text-ink-dim">Reminders</span>

      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <div
              key={row.key}
              className="slip flex flex-col gap-1.5 rounded-[14px] bg-inset px-[14px] py-[12px]"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {/* The when-control and "remove" used to share one row and
                  fight over width — on a chore's row (stepper + text +
                  time field) that pushed "remove" past the edge instead
                  of wrapping cleanly. Fixed rows: the control gets the
                  full width to itself (wrapping if it must), "remove"
                  always sits on its own line underneath, so it can never
                  collide with the control regardless of how wide it is. */}
              <div className="flex flex-wrap items-center gap-1.5">
                {renderRow(row)}
              </div>
              <button
                type="button"
                onClick={() => onRemove(row.key)}
                className="self-end text-[12px] text-ink-dim underline decoration-dotted underline-offset-4"
              >
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
            className="rounded-full border border-line bg-card px-3 py-1.5 text-[12.5px] text-ink disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          disabled={rows.length >= max}
          onClick={onAdd}
          className="flex items-center gap-1 rounded-full border border-dashed border-line bg-card px-3 py-1.5 text-[12.5px] text-ink-dim disabled:opacity-50"
        >
          <PlusIcon className="h-3 w-3" />
          Blank
        </button>
      </div>

      <p className="text-[12px] text-ink-dim">
        {rows.length >= max
          ? `Maximum ${max} reminders.`
          : `${rows.length} of ${max}`}
      </p>
    </div>
  )
}
