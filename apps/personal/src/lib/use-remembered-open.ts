import * as React from "react"

const OPEN = "open"
const CLOSED = "closed"

/**
 * Open or folded, remembered by this browser under `key`, the way Custom Shell
 * remembers its folded menu sections. Open until folded. Storage can be blocked
 * (a private window), and then the choice lasts until the page reloads.
 */
export function useRememberedOpen(key: string) {
  const [open, setOpenState] = React.useState(() => {
    try {
      return window.localStorage.getItem(key) !== CLOSED
    } catch {
      return true
    }
  })

  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenState(next)
      try {
        window.localStorage.setItem(key, next ? OPEN : CLOSED)
      } catch {
        // Blocked storage: the section still folds, it just isn't remembered.
      }
    },
    [key]
  )

  return [open, setOpen] as const
}
