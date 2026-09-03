import { useCallback, useState } from 'react'

/**
 * The one wrapper every mutation goes through (§5.7) — surfaces an
 * honest "not saved — retrying" state instead of pretending a mutation
 * succeeded while offline, and is the single place a durable IndexedDB
 * queue gets added later if that's ever needed. For now, "retrying"
 * means: wait for the browser's `online` event, then retry once.
 */

export type MutationStatus =
  'idle' | 'pending' | 'retrying' | 'error' | 'success'

export interface HouseholdMutation {
  status: MutationStatus
  error: string | null
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>
}

export function useHouseholdMutation(): HouseholdMutation {
  const [status, setStatus] = useState<MutationStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      setStatus('pending')
      setError(null)
      try {
        const result = await fn()
        setStatus('success')
        return result
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setStatus('retrying')
          return await new Promise<T | undefined>((resolve) => {
            const onOnline = () => {
              window.removeEventListener('online', onOnline)
              fn()
                .then((result) => {
                  setStatus('success')
                  resolve(result)
                })
                .catch(() => {
                  setStatus('error')
                  setError('Could not save — try again.')
                  resolve(undefined)
                })
            }
            window.addEventListener('online', onOnline)
          })
        }
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Something went wrong.')
        return undefined
      }
    },
    [],
  )

  return { status, error, run }
}
