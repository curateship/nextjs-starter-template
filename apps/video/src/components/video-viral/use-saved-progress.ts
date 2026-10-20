import * as React from "react"

import { loadSavedVideoStatuses } from "@/lib/api/video/viral-videos"
import { isSavedVideoWorking, type SavedVideoStatus } from "@/lib/video/creators"
import type { ViralVideo } from "@/lib/video/viral"

/** How often the screen asks where its saving videos have got to. */
const POLL_MS = 3_000

type Saved = { id: string; status: string }

/** A saved copy that was deleted here, until the screen reads itself again. */
type Known = Saved | null

/**
 * Keeps every card's "being saved" state true while somebody looks at other
 * videos.
 *
 * The player only follows the video it is showing, so without this a card
 * would say "Downloading" until the page was reloaded. The screen asks, in
 * one request every 3 seconds, about each video still downloading or being
 * watched, and stops asking once none is. A video saved with Download alone
 * finishes at `downloaded`, which is not working, so the asking stops there
 * too. When one finishes, `onSettled` lets the screen read itself again, so
 * the finished breakdown's score shows and a downloaded video moves to the
 * Downloaded tab.
 */
export function useSavedProgress(
  videos: ViralVideo[],
  onSettled: () => void
) {
  const [saved, setSaved] = React.useState<Record<string, Known>>({})

  const settled = React.useRef(onSettled)
  React.useEffect(() => {
    settled.current = onSettled
  })

  const apply = React.useCallback(
    (video: ViralVideo): ViralVideo => {
      if (!(video.key in saved)) return video
      const known = saved[video.key]
      return known
        ? { ...video, savedVideoId: known.id, savedStatus: known.status }
        : { ...video, savedVideoId: null, savedStatus: null }
    },
    [saved]
  )

  /**
   * The player or a bulk save says a video's saved state moved. A video the
   * player saw finish refreshes the screen too, so its new score shows even
   * though this hook's own timer never saw it working.
   */
  const report = React.useCallback(
    (key: string, next: Saved, before: string | null = null) => {
      setSaved((was) =>
        was[key]?.id === next.id && was[key]?.status === next.status
          ? was
          : { ...was, [key]: next }
      )
      const wasWorking =
        before !== null && isSavedVideoWorking(before as SavedVideoStatus)
      if (wasWorking && !isSavedVideoWorking(next.status as SavedVideoStatus)) {
        settled.current()
      }
    },
    []
  )

  /** Deleted saved copies: their cards drop the saved state at once. */
  const forget = React.useCallback((keys: string[]) => {
    setSaved((was) => {
      const next = { ...was }
      for (const key of keys) next[key] = null
      return next
    })
  }, [])

  // One string naming every video still working, so the timer below starts
  // and stops only when that list really changes.
  const working = videos
    .map(apply)
    .filter(
      (video) =>
        video.savedVideoId &&
        video.savedStatus &&
        isSavedVideoWorking(video.savedStatus as SavedVideoStatus)
    )
    .map((video) => `${video.key}|${video.savedVideoId}`)
  const workingKey = [...new Set(working)].sort().join(",")

  React.useEffect(() => {
    if (!workingKey) return
    const pairs = workingKey.split(",").map((pair) => pair.split("|"))
    const keyById = new Map(pairs.map(([key, id]) => [id, key]))
    const timer = setInterval(() => {
      loadSavedVideoStatuses([...keyById.keys()])
        .then((rows) => {
          setSaved((was) => {
            const next = { ...was }
            for (const row of rows) {
              const key = keyById.get(row.id)
              if (key) next[key] = { id: row.id, status: row.status }
            }
            return next
          })
          if (rows.some((row) => !isSavedVideoWorking(row.status))) {
            settled.current()
          }
        })
        // A missed read is tried again on the next tick.
        .catch(() => undefined)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [workingKey])

  return { apply, report, forget }
}
