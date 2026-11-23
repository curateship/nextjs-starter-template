import * as React from "react"

import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { refreshPromoReadFn } from "@/lib/api/viral/viral-promo"
import { loadTextSocialsFn } from "@/lib/api/viral/viral-socials"
import type { TextSocialsScreen } from "@/lib/viral/socials"

export type TextSocialsState =
  | { state: "loading" }
  | ({ state: "ready" } & TextSocialsScreen)
  | { state: "failed"; error: string }

/** How often a waiting read is asked about. The server asks Promo at most this often anyway. */
const WAITING_POLL_MS = 20_000

/**
 * A project's X, Reddit and LinkedIn side on its page
 * (`workspace/docs/projects-and-socials.md`): read once the project has one
 * of those socials, and again whenever a read Promo was still doing finishes.
 * While any read waits, it is asked about every 20 seconds.
 */
export function useTextSocials(projectId: string, enabled: boolean) {
  const [data, setData] = React.useState<TextSocialsState>({ state: "loading" })
  const [reloads, setReloads] = React.useState(0)
  const reload = React.useCallback(() => setReloads((count) => count + 1), [])

  React.useEffect(() => {
    if (!enabled) return
    let live = true
    loadTextSocialsFn(projectId)
      .then((answer) => {
        if (live) setData({ state: "ready", ...answer })
      })
      .catch((error) => {
        if (live) setData({ state: "failed", error: getViralErrorMessage(error) })
      })
    return () => {
      live = false
    }
  }, [enabled, projectId, reloads])

  const waiting = React.useMemo(
    () =>
      data.state === "ready"
        ? data.watches.flatMap((watch) => (watch.status === "waiting" && watch.readId ? [watch.readId] : []))
        : [],
    [data]
  )
  const waitingKey = waiting.join(",")

  React.useEffect(() => {
    if (!enabled || !waitingKey) return
    const ids = waitingKey.split(",")
    const timer = window.setInterval(() => {
      void Promise.all(ids.map((id) => refreshPromoReadFn(id).catch(() => null))).then((reads) => {
        if (reads.some((read) => read && read.status !== "waiting")) reload()
      })
    }, WAITING_POLL_MS)
    return () => window.clearInterval(timer)
  }, [enabled, reload, waitingKey])

  return { data, reload }
}
