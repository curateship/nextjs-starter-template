import * as React from "react"

import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"

/**
 * The record a tab last had open in the right panel, kept in this browser, so
 * coming back to the tab reopens it (UI standard, "Every three-column
 * dashboard opens a record on arrival and goes back to where it was"). Null
 * until one has been picked; the caller opens the first row then.
 */
export function useRememberedId(storageKey: string): [string | null, (id: string) => void] {
  const [id, setId] = React.useState<string | null>(null)
  useEffectBeforePaint(() => {
    try {
      setId(window.localStorage.getItem(storageKey))
    } catch {
      // Storage that cannot be read opens the first row.
    }
  }, [storageKey])
  const remember = React.useCallback(
    (next: string) => {
      setId(next)
      try {
        window.localStorage.setItem(storageKey, next)
      } catch {
        // Blocked storage: the pick still holds for this visit.
      }
    },
    [storageKey]
  )
  return [id, remember]
}
