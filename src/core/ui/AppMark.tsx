/**
 * The app's mark — three stacked rules in an accent rounded square,
 * matching `DoneStack`'s toggle glyph (§2.7). Reused in `TabSpine`
 * (desktop) and `AppShell`'s mobile-only header.
 */
export function AppMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="6" className="fill-accent" />
      <path
        d="M7 9h10M7 12h10M7 15h10"
        className="stroke-card"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}
