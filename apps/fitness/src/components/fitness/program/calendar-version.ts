import * as React from "react"

/**
 * A count that goes up whenever a calendar day changes, so the Calendar in the
 * middle panel and the Day card in the right panel both read the day again.
 * The two load their own data rather than the route's, because the month on
 * screen is not in the address.
 */
let version = 0
const listeners = new Set<() => void>()

export function calendarChanged() {
  version += 1
  for (const listener of listeners) listener()
}

export function useCalendarVersion() {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version,
    () => 0
  )
}
