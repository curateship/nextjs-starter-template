import * as React from "react"

import { useVisibleInterval } from "@/lib/use-visible-interval"

/**
 * Shared state for a scanner dashboard table: adopts fresh loader data during
 * render when the route re-runs (filters changed), and re-fetches on an
 * interval so the table stays live. Returns the current data plus a manual
 * refetch (e.g. to call after a mutation).
 */
export function usePolledData<T, F>(
  initial: T,
  load: (filters: F) => Promise<T>,
  filters: F,
  pollMs: number
): [T, () => Promise<void>] {
  const [data, setData] = React.useState(initial)
  const [prevInitial, setPrevInitial] = React.useState(initial)

  // Loader re-ran (filters changed): adopt the fresh page during render.
  if (prevInitial !== initial) {
    setPrevInitial(initial)
    setData(initial)
  }

  const refetch = React.useCallback(async () => {
    try {
      setData(await load(filters))
    } catch {
      // transient poll failure; next tick retries
    }
  }, [load, filters])

  useVisibleInterval(refetch, pollMs)

  return [data, refetch]
}
