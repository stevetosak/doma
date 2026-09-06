import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * A panel pulled forward out of the list (§2.3) — add/edit forms live here
 * instead of cluttering the resting list. Docks to the bottom edge on
 * every viewport (never a right-side drawer), closes back into the list.
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
        className="sheet-backdrop absolute inset-0 bg-[rgb(29_35_32_/_0.34)] backdrop-blur-[3px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="sheet-panel absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-sheet bg-card shadow-sheet"
      >
        <div
          aria-hidden="true"
          className="mx-auto mt-[9px] h-1 w-[38px] rounded-full bg-[#d5cdbc]"
        />
        <div className="flex items-center justify-between px-5 pt-4 pb-2.5">
          <h2
            id={headingId}
            className="font-display text-[23px] font-semibold tracking-[-0.015em] text-ink"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-inset text-lg text-ink-dim"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 pt-[10px] pb-[30px]">
          {children}
        </div>
      </div>
    </div>
  )
}
