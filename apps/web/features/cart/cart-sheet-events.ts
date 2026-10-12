const listeners = new Set<(trigger: HTMLElement | null) => void>()

export function notifyCartItemAdded(trigger: HTMLElement | null) {
  for (const listener of listeners) listener(trigger)
}

export function subscribeCartItemAdded(
  listener: (trigger: HTMLElement | null) => void,
) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
