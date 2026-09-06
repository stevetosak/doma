import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { CheckIcon, CloseIcon } from '#/core/ui/icons'

const SWIPE_MAX = 140
const SWIPE_THRESHOLD = 92
const REVEAL_DISTANCE = 10

/**
 * Replaces `FlipCard` (§2.1) — the flip tested badly after using the built
 * app: it hid every action behind a state change, and the back face was a
 * second layout to maintain. One face, auto height, actions live in an
 * icon rail the caller renders as part of `children`. Closes #65 (the
 * flip glitch on category-reorder refetch) by removing the mechanism it
 * was a glitch in, rather than deferring it again.
 *
 * Swipe (§2.2) is bidirectional and, on touch, the only completion path:
 * right runs `onComplete`, left runs `onNegative`. Drag state lives on a
 * ref, not render state — a `setState` on the first `pointermove` would
 * recreate the handlers and reset the drag origin, killing the gesture
 * after one frame. Pointer capture goes on the card surface, not the
 * outer wrapper, and `pointerdown` never calls `preventDefault` so a tap
 * on a rail button underneath the capture still fires its own `click`.
 *
 * Non-touch pointers get a second path: hovering (or keyboard-focusing)
 * the card reveals a check/× button pair at its edges — the swipe alone
 * isn't a discoverable desktop affordance even though click-and-drag
 * technically works via the same Pointer Events.
 */
export function ActionCard({
  children,
  onComplete,
  onNegative,
  completeLabel,
  negativeLabel,
  completeAriaLabel,
  negativeAriaLabel,
  disabled = false,
  className = '',
}: {
  children: ReactNode
  onComplete?: () => void
  onNegative?: () => void
  /** Ground-level label revealed as the card drags toward that side, e.g. "✓ Done". */
  completeLabel?: string
  negativeLabel?: string
  completeAriaLabel?: string
  negativeAriaLabel?: string
  disabled?: boolean
  className?: string
}) {
  const [offset, setOffset] = useState(0)
  const drag = useRef<{ x: number; moved: number } | null>(null)
  const swipeRightEnabled = Boolean(onComplete && !disabled)
  const swipeLeftEnabled = Boolean(onNegative && !disabled)

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!swipeRightEnabled && !swipeLeftEnabled) return
    drag.current = { x: event.clientX, moved: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const raw = event.clientX - drag.current.x
    const clampedMax = raw > 0 && !swipeRightEnabled ? 0 : raw
    const clampedMin = raw < 0 && !swipeLeftEnabled ? 0 : clampedMax
    const next = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, clampedMin))
    drag.current.moved = next
    setOffset(next)
  }

  function handlePointerUp() {
    if (!drag.current) return
    const moved = drag.current.moved
    drag.current = null
    setOffset(0)
    if (moved > SWIPE_THRESHOLD) onComplete?.()
    else if (moved < -SWIPE_THRESHOLD) onNegative?.()
  }

  return (
    <div className={`group relative ${className}`}>
      {swipeRightEnabled && completeLabel && (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center pl-5 text-sm font-semibold text-accent"
          style={{
            opacity: Math.max(0, Math.min(1, offset / REVEAL_DISTANCE)),
          }}
        >
          {completeLabel}
        </div>
      )}
      {swipeLeftEnabled && negativeLabel && (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-end pr-5 text-sm font-semibold text-error"
          style={{
            opacity: Math.max(0, Math.min(1, -offset / REVEAL_DISTANCE)),
          }}
        >
          {negativeLabel}
        </div>
      )}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          transform: offset ? `translateX(${offset}px)` : undefined,
          transition: drag.current ? 'none' : 'transform 0.32s var(--ease-out)',
          touchAction: 'pan-y',
        }}
        className="relative overflow-hidden rounded-card bg-card shadow-card"
      >
        {children}
      </div>
      {swipeRightEnabled && (
        <button
          type="button"
          aria-label={completeAriaLabel ?? 'Complete'}
          title={completeAriaLabel ?? 'Complete'}
          onClick={onComplete}
          className="absolute top-1/2 right-0 flex h-11 w-11 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-card opacity-0 shadow-lifted transition-opacity focus:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
        >
          <CheckIcon className="h-5 w-5" />
        </button>
      )}
      {swipeLeftEnabled && (
        <button
          type="button"
          aria-label={negativeAriaLabel ?? 'Cancel'}
          title={negativeAriaLabel ?? 'Cancel'}
          onClick={onNegative}
          className="absolute top-1/2 left-0 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-error text-card opacity-0 shadow-lifted transition-opacity focus:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
