import * as React from "react"

import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"

/**
 * Which List headings are folded shut (Tyler, 24 Oct 2026: "beside the + icon,
 * there should be a arrow collapse icon to collapse the section too", then
 * "the collapse doesnt remember"). Kept in this browser under `storageKey`;
 * left out, they last only while the screen is open.
 *
 * The page is rendered on the server too, which has no localStorage, so the
 * folds are read in a layout effect rather than the first render, as
 * `useRememberedChoice` does, and still land before the paint.
 */
export function useFoldedHeadings(storageKey?: string) {
  const [shut, setShut] = React.useState<ReadonlySet<string>>(() => new Set())

  useEffectBeforePaint(() => {
    setShut(new Set(storageKey ? readFolds(storageKey) : []))
  }, [storageKey])

  return {
    folded: (key: string) => shut.has(key),
    toggle: (key: string) => {
      const next = new Set(shut)
      if (!next.delete(key)) next.add(key)
      setShut(next)
      if (!storageKey) return
      try {
        if (next.size) window.localStorage.setItem(storageKey, JSON.stringify([...next]))
        else window.localStorage.removeItem(storageKey)
      } catch {
        // Without storage the fold still holds until the screen is left.
      }
    },
  }
}

/** The folded heading keys saved under `storageKey`; anything unreadable counts as none. */
function readFolds(storageKey: string): string[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]")
    return Array.isArray(saved) ? saved.filter((key): key is string => typeof key === "string") : []
  } catch {
    return []
  }
}
