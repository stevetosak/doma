import { useId, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'

const SWIPE_MAX = 140
const SWIPE_COMPLETE_THRESHOLD = 92
const SWIPE_TAP_THRESHOLD = 7

/**
 * The signature interaction (§2.1): tap the front to flip the card like a
 * real index card, readable info on the front, actions on the back. Front
 * and back are separate elements (never a shared wrapping <button>) so the
 * back can hold real interactive controls without nesting buttons. Status
 * reads through the ink, not a border — a small accent dot in the corner,
 * only when urgent, never a thick border fighting the card's rounded
 * corners. Tapping the back anywhere outside a real control flips back to
 * front. Whichever face isn't showing is `inert`, so its controls drop out
 * of tab order and can't be triggered while off-screen.
 *
 * Swipe-to-complete (§2.2) lives alongside the flip, not instead of it, on
 * the front face only. Drag state is held on a ref, not in render state —
 * a setState on the first pointermove would recreate the handlers and
 * reset the drag origin, killing the gesture after one frame.
 */
export function FlipCard({
  front,
  back,
  urgent = false,
  minHeight,
  swipeCompleteLabel,
  onSwipeComplete,
  className = '',
}: {
  front: ReactNode
  back: ReactNode
  urgent?: boolean
  /** Fixed face height per §2.1 point 3 — a floor, not a cap; content that
   * needs more room grows the container. */
  minHeight?: number
  swipeCompleteLabel?: string
  onSwipeComplete?: () => void
  className?: string
}) {
  const [flipped, setFlipped] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const backId = useId()
  const drag = useRef<{ x: number; moved: number } | null>(null)
  const swipeEnabled = Boolean(onSwipeComplete && swipeCompleteLabel)

  function handleBackClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest('button, input, a, label')) return
    setFlipped(false)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!swipeEnabled) return
    drag.current = { x: event.clientX, moved: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag.current) return
    const next = Math.min(
      SWIPE_MAX,
      Math.max(0, event.clientX - drag.current.x),
    )
    drag.current.moved = next
    setDragOffset(next)
  }

  function handlePointerUp() {
    if (!drag.current) return
    const moved = drag.current.moved
    drag.current = null
    setDragOffset(0)
    if (moved > SWIPE_COMPLETE_THRESHOLD) {
      onSwipeComplete?.()
    } else if (moved < SWIPE_TAP_THRESHOLD) {
      setFlipped(true)
    }
  }

  const dotEl = urgent && (
    <span
      aria-hidden="true"
      className="absolute top-4 right-4 h-2.5 w-2.5 rounded-full bg-accent"
    />
  )

  return (
    <div className={`flip-scene ${className}`}>
      <div
        className="flip-card relative flex flex-col"
        data-flipped={flipped}
        style={minHeight ? { minHeight } : undefined}
      >
        <div className="relative flex-1">
          {swipeEnabled && (
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-center pl-5 text-sm font-semibold text-accent-deep"
              style={{ opacity: Math.min(1, dragOffset / 10) }}
            >
              {swipeCompleteLabel}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (!swipeEnabled) setFlipped(true)
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            aria-expanded={flipped}
            aria-controls={backId}
            inert={flipped}
            style={{
              transform: dragOffset ? `translateX(${dragOffset}px)` : undefined,
              transition: drag.current
                ? 'none'
                : 'transform 0.32s var(--ease-out)',
              touchAction: 'pan-y',
            }}
            className="flip-face relative h-full w-full rounded-card bg-card p-5 text-left shadow-card transition-shadow hover:shadow-lifted"
          >
            {dotEl}
            {front}
            <span className="mt-3 block text-[12.5px] text-ink-dim">
              {swipeEnabled ? 'tap to flip · swipe to complete' : 'tap to flip'}
            </span>
          </button>
        </div>
        <div
          id={backId}
          inert={!flipped}
          onClick={handleBackClick}
          className="flip-face flip-face-back absolute inset-0 flex flex-col rounded-card bg-inset p-5 shadow-card"
        >
          {back}
        </div>
      </div>
    </div>
  )
}
