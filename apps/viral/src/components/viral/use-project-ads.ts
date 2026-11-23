import * as React from "react"

import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { loadProjectAdsFn, searchProjectAdsFn, type ProjectAds } from "@/lib/api/viral/viral-ads"
import { showErrorToast } from "@/lib/toast/error-toast"

export type AdsState = { state: "loading" } | ({ state: "ready" } & ProjectAds) | { state: "failed"; error: string }

/**
 * Winning ads on the project page (`workspace/docs/winning-ads.md`, task part
 * 23). The Ads row on the left turns the middle into the project's last
 * search of Meta's ad library, and the right into the open ad, the way the
 * Vault row does. The list is read when the row is opened; Search ads asks
 * Meta again.
 */
export function useProjectAds(projectId: string, open: boolean) {
  const [ads, setAds] = React.useState<AdsState>({ state: "loading" })
  const [searching, setSearching] = React.useState(false)
  const [reloads, setReloads] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    let live = true
    loadProjectAdsFn(projectId)
      .then((answer) => {
        if (live) setAds({ state: "ready", ...answer })
      })
      .catch((error) => {
        if (live) setAds({ state: "failed", error: getViralErrorMessage(error) })
      })
    return () => {
      live = false
    }
  }, [open, projectId, reloads])

  const search = React.useCallback(async () => {
    setSearching(true)
    try {
      const answer = await searchProjectAdsFn(projectId)
      setAds({ state: "ready", ...answer })
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
      setReloads((count) => count + 1)
    } finally {
      setSearching(false)
    }
  }, [projectId])

  return { ads, searching, search, retry: () => setReloads((count) => count + 1) }
}
