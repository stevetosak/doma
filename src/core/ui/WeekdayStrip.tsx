const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
]

/**
 * Replaces the 7 checkboxes for weekly-recurrence day selection (§2.5) —
 * a row of equal-width toggle cells, cool `--color-second` when on.
 */
export function WeekdayStrip({
  selected,
  onToggle,
}: {
  selected: number[]
  onToggle: (day: number) => void
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Weekdays">
      {WEEKDAYS.map((wd) => {
        const on = selected.includes(wd.value)
        return (
          <button
            key={wd.value}
            type="button"
            aria-pressed={on}
            aria-label={wd.label}
            onClick={() => onToggle(wd.value)}
            className={`h-[42px] flex-1 rounded-control text-sm transition-colors ${
              on
                ? 'bg-second font-semibold text-card'
                : 'bg-inset font-normal text-ink-dim'
            }`}
          >
            {wd.label}
          </button>
        )
      })}
    </div>
  )
}
