/**
 * The app's mark (§ bucket 4, "add a logo/header") — the same overlapping,
 * slightly-rotated card silhouette `DoneStack`'s toggle already uses to say
 * "a stack of index cards," rendered as a standalone SVG rather than a new,
 * unrelated glyph. Reused in `TabSpine` (desktop) and `AppShell`'s
 * mobile-only header.
 */
export function AppMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect
        x="7"
        y="5"
        width="13"
        height="16"
        rx="2"
        transform="rotate(6 13.5 13)"
        className="fill-card stroke-kraft"
        strokeWidth="1.25"
      />
      <rect
        x="4"
        y="3"
        width="13"
        height="16"
        rx="2"
        transform="rotate(-8 10.5 11)"
        className="fill-card-back stroke-kraft-dark"
        strokeWidth="1.25"
      />
      <path
        d="M7.5 9.5h7M7.5 13h7"
        transform="rotate(-8 10.5 11)"
        className="stroke-line"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  )
}
