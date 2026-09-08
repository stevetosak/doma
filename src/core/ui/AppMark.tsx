import { useId } from 'react'

/**
 * The app's mark — a rounded roof line over two overlapping discs (one
 * `currentColor`, one accent, the overlap a dimmed wash of `currentColor`).
 * "One roof, two people." Colour comes from the surrounding text colour, so
 * callers set `text-ink` on light ground and `text-card` on the dark spine.
 *
 * The full three-tone artwork (with a solid near-black overlap) lives in the
 * favicon / install icons — see brand/ and public/. Here the overlap is a
 * translucent wash so the mark never reads as broken at 24px.
 */
export function AppMark({ className = 'h-7 w-7' }: { className?: string }) {
  const clip = useId()
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path
        d="M9 34 L32 13 L55 34"
        fill="none"
        stroke="currentColor"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={25} cy={47} r={9.5} fill="currentColor" />
      <circle cx={39} cy={47} r={9.5} className="fill-accent" />
      <clipPath id={clip}>
        <circle cx={25} cy={47} r={9.5} />
      </clipPath>
      <circle
        cx={39}
        cy={47}
        r={9.5}
        fill="currentColor"
        fillOpacity={0.4}
        clipPath={`url(#${clip})`}
      />
    </svg>
  )
}
