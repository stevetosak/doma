import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

/**
 * Ambient time-of-day wash (§3 raise, donated by the declined stage-
 * cyclorama challenger) — atmosphere only, never load-bearing for meaning
 * or state. Client-only: SSR renders the neutral midday wash, then the
 * real local time takes over after hydration.
 */
const WASH_BY_PART = {
  morning:
    'radial-gradient(ellipse at 20% -10%, rgba(255,214,153,0.35), transparent 60%)',
  midday:
    'radial-gradient(ellipse at 20% -10%, rgba(255,255,255,0.15), transparent 60%)',
  evening:
    'radial-gradient(ellipse at 20% -10%, rgba(196,90,50,0.22), transparent 60%)',
  night:
    'radial-gradient(ellipse at 20% -10%, rgba(61,82,102,0.28), transparent 60%)',
} as const

type DayPart = keyof typeof WASH_BY_PART

function partOfDay(hour: number): DayPart {
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'midday'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

export function useAmbientWash(): CSSProperties {
  const [part, setPart] = useState<DayPart>('midday')

  useEffect(() => {
    const update = () => setPart(partOfDay(new Date().getHours()))
    update()
    const id = window.setInterval(update, 5 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [])

  return { backgroundImage: WASH_BY_PART[part] }
}
