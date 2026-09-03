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
 * flip the card like a real index card, assignee/detail on the back. Front
 * and back are separate elements (never a shared wrapping <button>) so the
 * back can hold real interactive controls without nesting buttons. Status
 * reads through the ink (§3: "rust/terracotta ink for what's active or
 * due"), not a border — a small stamp dot in the corner, never a thick
 * accent border fighting the card's own rounded corners.
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

  // Tapping anywhere on the back that isn't itself a control flips back
  // to the front — the "flip back" link stays as an explicit fallback,
  // but it shouldn't be the only way back.
  function handleBackClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest('button, input, a, label')) return
    setFlipped(false)
  }

  return (
    <div className={`flip-scene ${className}`}>
      <div className="flip-card relative" data-flipped={flipped}>
        <button
          type="button"
          onClick={() => setFlipped(true)}
          aria-expanded={flipped}
          aria-controls={backId}
          aria-hidden={flipped}
          tabIndex={flipped ? -1 : 0}
          className="ruled flip-face relative w-full rounded-card border border-line bg-card p-5 text-left shadow-card transition-shadow hover:shadow-card-lifted"
        >
          {dot && (
            <span
              aria-hidden="true"
              className={`absolute top-4 right-4 h-2.5 w-2.5 rounded-full ${dot}`}
            />
          )}
          {front}
          <span className="mt-3 block font-mono text-[11px] tracking-wide text-ink-faint">
            tap to flip — {flipLabel}
          </span>
        </button>
        <div
          id={backId}
          aria-hidden={!flipped}
          onClick={handleBackClick}
          className="ruled flip-face flip-face-back absolute inset-0 flex flex-col rounded-card border border-line bg-card-back p-5 shadow-card"
        >
          <div className="flex-1">{back}</div>
          <button
            type="button"
            onClick={() => setFlipped(false)}
            tabIndex={flipped ? 0 : -1}
            className="mt-3 self-start font-mono text-[11px] tracking-wide text-ink-faint underline decoration-dotted underline-offset-4"
          >
            ← flip back
          </button>
        </div>
      </div>
    </div>
  )
}
