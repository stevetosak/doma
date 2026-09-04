import { useId, useState } from 'react'
import type { ReactNode } from 'react'

export type CardAccent = 'rust' | 'blue' | 'neutral'

const ACCENT_DOT: Record<CardAccent, string> = {
  rust: 'bg-rust',
  blue: 'bg-blue',
  neutral: '',
}

/**
 * The signature interaction (§3 of the direction brief): tap the front to
 * flip the card like a real index card, readable info on the front, actions
 * on the back. Front and back are separate elements (never a shared
 * wrapping <button>) so the back can hold real interactive controls without
 * nesting buttons. Status reads through the ink (§3: "rust/terracotta ink
 * for what's active or due"), not a border — a small stamp dot in the
 * corner, never a thick accent border fighting the card's own rounded
 * corners. Tapping the back anywhere outside a real control flips back to
 * front. Whichever face isn't showing is `inert`, so its controls drop out
 * of tab order and can't be triggered while off-screen.
 */
export function FlipCard({
  front,
  back,
  accent = 'neutral',
  flipLabel,
  className = '',
}: {
  front: ReactNode
  back: ReactNode
  accent?: CardAccent
  flipLabel: string
  className?: string
}) {
  const [flipped, setFlipped] = useState(false)
  const backId = useId()
  const dot = ACCENT_DOT[accent]

  function handleBackClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest('button, input, a, label')) return
    setFlipped(false)
  }

  const dotEl = dot && (
    <span
      aria-hidden="true"
      className={`absolute top-4 right-4 h-2.5 w-2.5 rounded-full ${dot}`}
    />
  )

  return (
    <div className={`flip-scene ${className}`}>
      <div className="flip-card relative" data-flipped={flipped}>
        <button
          type="button"
          onClick={() => setFlipped(true)}
          aria-expanded={flipped}
          aria-controls={backId}
          inert={flipped}
          className="ruled flip-face relative w-full rounded-card border border-line bg-card p-5 text-left shadow-card transition-shadow hover:shadow-card-lifted"
        >
          {dotEl}
          {front}
          <span className="mt-3 block font-mono text-[11px] tracking-wide text-ink-faint">
            tap to flip — {flipLabel}
          </span>
        </button>
        <div
          id={backId}
          inert={!flipped}
          onClick={handleBackClick}
          className="ruled flip-face flip-face-back absolute inset-0 flex flex-col rounded-card border border-line bg-card-back p-5 shadow-card"
        >
          {back}
        </div>
      </div>
    </div>
  )
}
