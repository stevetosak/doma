import { AppMark } from '#/core/ui/AppMark'

/**
 * Mark + "doma" wordmark, baseline-aligned. The horizontal lockup used in
 * the mobile header and on the auth screens. The wordmark is real text in
 * the display face (Outfit), never an image — so it stays crisp and
 * translates automatically if the type ever changes.
 */
export function AppLogo({
  className = '',
  markClassName = 'h-7 w-7',
  wordClassName = 'text-xl',
}: {
  className?: string
  markClassName?: string
  wordClassName?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2 text-ink ${className}`}>
      <AppMark className={markClassName} />
      <span className={`font-display font-semibold ${wordClassName}`}>
        doma
      </span>
    </span>
  )
}
