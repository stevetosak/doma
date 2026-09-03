/**
 * In-process pub/sub for live sync (§5.6). Single-replica only — the k8s
 * overlay runs `replicas: 1`; Redis pub/sub is the documented upgrade if
 * doma ever needs more than one.
 */

export interface DomaEvent {
  module: string
  entity: string
  action: 'created' | 'updated' | 'deleted'
}

type Listener = (event: DomaEvent) => void

const subscribersByHousehold = new Map<string, Set<Listener>>()

/** Returns an unsubscribe function. */
export function subscribe(householdId: string, listener: Listener): () => void {
  let listeners = subscribersByHousehold.get(householdId)
  if (!listeners) {
    listeners = new Set()
    subscribersByHousehold.set(householdId, listeners)
  }
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      subscribersByHousehold.delete(householdId)
    }
  }
}

export function publish(householdId: string, event: DomaEvent): void {
  const listeners = subscribersByHousehold.get(householdId)
  if (!listeners) return
  for (const listener of listeners) listener(event)
}
