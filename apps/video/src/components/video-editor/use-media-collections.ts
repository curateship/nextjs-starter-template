import * as React from "react"

import {
  listMediaCollections,
  type MediaCollectionSummary,
} from "@/lib/api/video/media"

/**
 * The person's media collections, fetched again whenever the tab is looked
 * at, so a collection made in another tab shows up without a reload. A failed
 * fetch keeps what is already showing: the chips are a filter, not the grid,
 * and the next look at the tab tries again.
 */
export function useMediaCollections() {
  const [collections, setCollections] = React.useState<
    MediaCollectionSummary[]
  >([])
  const [version, setVersion] = React.useState(0)
  const reload = React.useCallback(() => setVersion((count) => count + 1), [])

  React.useEffect(() => {
    let active = true
    listMediaCollections()
      .then((loaded) => {
        if (active) setCollections(loaded)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [version])

  React.useEffect(() => {
    function onLookedAt() {
      if (document.visibilityState === "visible") reload()
    }
    window.addEventListener("focus", onLookedAt)
    document.addEventListener("visibilitychange", onLookedAt)
    return () => {
      window.removeEventListener("focus", onLookedAt)
      document.removeEventListener("visibilitychange", onLookedAt)
    }
  }, [reload])

  return { collections, reload }
}
