import { MinusIcon, PlusIcon } from '#/core/ui/icons'

/**
 * Replaces every `<input type="number">` in the app (§2.5) — an inset well
 * holding a value nobody can type into, flanked by two round buttons. This
 * closes #66: there is no free-text numeric input left to snap to 0 when
 * cleared mid-edit.
 */
export function Stepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  ariaLabel,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  ariaLabel: string
}) {
  function clamp(n: number) {
    return Math.min(max, Math.max(min, n))
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-control bg-inset p-1">
      <StepperButton
        label={`Decrease ${ariaLabel}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        <MinusIcon className="h-3.5 w-3.5" />
      </StepperButton>
      <span
        aria-live="polite"
        className="w-10 text-center text-[15px] text-ink"
      >
        {value}
      </span>
      <StepperButton
        label={`Increase ${ariaLabel}`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
      >
        <PlusIcon className="h-3.5 w-3.5" />
      </StepperButton>
    </div>
  )
}

/**
 * Quantity is the one exception (§2.5) — decimal-capable, so typing stays
 * allowed. The buttons still step by whole units; free text is never
 * coerced through `Number()` on every keystroke, so an in-progress edit
 * (a bare "1." or a cleared field) is never clobbered.
 */
export function DecimalStepper({
  value,
  onChange,
  ariaLabel,
  min = 0,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  min?: number
}) {
  function bump(delta: number) {
    const current = Number(value)
    const base = Number.isFinite(current) ? current : 0
    onChange(String(Math.max(min, base + delta)))
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-control bg-inset p-1">
      <StepperButton label={`Decrease ${ariaLabel}`} onClick={() => bump(-1)}>
        <MinusIcon className="h-3.5 w-3.5" />
      </StepperButton>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-14 bg-transparent text-center text-[15px] text-ink focus-visible:outline-none"
      />
      <StepperButton label={`Increase ${ariaLabel}`} onClick={() => bump(1)}>
        <PlusIcon className="h-3.5 w-3.5" />
      </StepperButton>
    </div>
  )
}

function StepperButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-card text-accent transition-transform active:scale-90 disabled:opacity-40"
    >
      {children}
    </button>
  )
}
