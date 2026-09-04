import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { CloseIcon } from '#/core/ui/icons'

/**
 * A card pulled forward out of the box (§ chores/shopping declutter
 * extension) — add/edit forms live here instead of cluttering the resting
 * list. Docks to the bottom edge on every viewport (never a right-side
 * drawer), ruled like every other card face, closes back into the list.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const headingId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement
    const firstField = panelRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button',
    )
    firstField?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === 'Tab') {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (!focusable || focusable.length === 0) return
        const first = focusable[0]!
        const last = focusable[focusable.length - 1]!
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="sheet-panel ruled absolute inset-x-0 bottom-0 mx-auto flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-card border border-b-0 border-line bg-card-back shadow-card-lifted"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 id={headingId} className="font-display text-2xl text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center gap-1 font-mono text-xs tracking-wide text-ink-faint underline decoration-dotted underline-offset-4"
          >
            <CloseIcon className="h-3.5 w-3.5" />
            close
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-8">{children}</div>
      </div>
    </div>
  )
}
