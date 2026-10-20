import * as React from "react"

import {
  listMediaCollections,
  type MediaCollectionSummary,
} from "@/lib/api/video/media"

/**
 * The person's media collections, fetched again whenever the tab is looked
 * at, so a collection made in another tab shows up without a reload. A failed
 * fetch keeps what is already showing: the chips are a filter, not the grid,
 * and the next look at the tab tries again. `enabled: false` fetches nothing,
 * for a guest sent from Project, who has no collections.
 */
export function useMediaCollections({ enabled = true }: { enabled?: boolean } = {}) {
  const [collections, setCollections] = React.useState<
    MediaCollectionSummary[]
  >([])
  const [version, setVersion] = React.useState(0)
  const reload = React.useCallback(() => setVersion((count) => count + 1), [])

  React.useEffect(() => {
    if (!enabled) return
    let active = true
    listMediaCollections()
      .then((loaded) => {
        if (active) setCollections(loaded)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [enabled, version])

  React.useEffect(() => {
    if (!enabled) return
    function onLookedAt() {
      if (document.visibilityState === "visible") reload()
    }
    window.addEventListener("focus", onLookedAt)
    document.addEventListener("visibilitychange", onLookedAt)
    return () => {
      window.removeEventListener("focus", onLookedAt)
      document.removeEventListener("visibilitychange", onLookedAt)
    }
  }, [enabled, reload])

  return { collections, reload }
}
