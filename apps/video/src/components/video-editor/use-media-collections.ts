import * as React from "react"

import {
  listMediaCollections,
  type MediaCollectionSummary,
} from "@/lib/api/video/media"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The person's media collections, fetched again whenever the tab is looked
 * at, so a collection made in another tab shows up without a reload. A failed
 * fetch keeps what is already showing, since the chips are a filter, not the
 * grid, and the next look at the tab tries again. It says so once, and again
 * only after a fetch has worked in between, so looking back at the tab never
 * stacks up notices. `enabled: false` fetches nothing,
 * for a guest sent from Project, who has no collections.
 */
export function useMediaCollections({ enabled = true }: { enabled?: boolean } = {}) {
  const [collections, setCollections] = React.useState<
    MediaCollectionSummary[]
  >([])
  const [version, setVersion] = React.useState(0)
  const reload = React.useCallback(() => setVersion((count) => count + 1), [])
  const failing = React.useRef(false)

  React.useEffect(() => {
    if (!enabled) return
    let active = true
    listMediaCollections()
      .then((loaded) => {
        if (!active) return
        failing.current = false
        setCollections(loaded)
      })
      .catch(() => {
        if (!active || failing.current) return
        failing.current = true
        showErrorToast("Your collections could not be loaded.", {
          label: "Try again",
          onClick: reload,
        })
      })
    return () => {
      active = false
    }
  }, [enabled, reload, version])

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
