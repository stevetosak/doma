/**
 * A small-enum picker (§2.5) — an inset track with a sliding card-colored
 * thumb, used for Repeats (4 options) and Assignment (2 options).
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  options: readonly { value: T; label: string }[]
  ariaLabel: string
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  const width = 100 / options.length

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="relative flex rounded-control bg-inset p-1"
    >
      <span
        aria-hidden="true"
        className="absolute top-1 bottom-1 rounded-[calc(var(--radius-control)-4px)] bg-card shadow-[0_2px_6px_rgb(29_35_32_/_0.16)] transition-[left] duration-300 ease-[var(--ease-spring)]"
        style={{
          left: `calc(${index * width}% + 4px)`,
          width: `calc(${width}% - 8px)`,
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={`relative z-10 flex-1 rounded-control px-2 py-2 text-sm transition-colors ${
            option.value === value
              ? 'font-semibold text-ink'
              : 'font-normal text-ink-dim'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
