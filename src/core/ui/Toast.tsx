import { createContext, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface ToastRequest {
  message: string
  actionLabel?: string
  onAction?: () => void
}

interface ToastState extends ToastRequest {
  id: number
}

const ToastContext = createContext<{
  showToast: (t: ToastRequest) => void
} | null>(null)

// Long enough to read the message and decide, not the additive-
// confirmation 2.2s from §4 — an undo toast is a decision, not a receipt.
// Exported so a deferred-delete timer (shopping's swipe-left/rail delete)
// can match the window exactly — the data is only really gone once the
// toast itself has stopped offering Undo.
export const TOAST_DURATION_MS = 5000

/**
 * Bottom-anchored above the tab bar (§4) — the one exception to doma's
 * standing no-toast convention, reserved for the swipe-left undo (the one
 * destructive, otherwise-unrecoverable path in the app) and additive
 * "added"/"filed" confirmations. Never for errors, which stay in
 * `MutationStatus`.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const idRef = useRef(0)

  function showToast(request: ToastRequest) {
    window.clearTimeout(timerRef.current)
    const id = ++idRef.current
    setToast({ id, ...request })
    timerRef.current = window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current))
    }, TOAST_DURATION_MS)
  }

  function dismiss() {
    window.clearTimeout(timerRef.current)
    setToast(null)
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 md:bottom-6 md:left-24 md:justify-start"
        >
          <div className="slip flex items-center gap-3 rounded-full bg-[rgb(29_35_32_/_0.9)] px-4 py-3 text-sm text-card shadow-lifted backdrop-blur-[8px]">
            <span>{toast.message}</span>
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.()
                  dismiss()
                }}
                className="font-semibold text-accent-tint underline decoration-dotted underline-offset-4"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
