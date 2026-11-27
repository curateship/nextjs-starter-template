import * as React from "react"

import {
  loadSavedTranscripts,
  type SavedTranscriptSummary,
} from "@/lib/api/video/ai-tools"

const NONE: SavedTranscriptSummary[] = []

/**
 * Which of these files already have their words saved, asked whenever the
 * window opens or the files change. Until the answer arrives, and when asking
 * fails, the answer is "none", so a price is never shown as free by mistake.
 *
 * `remember` is for a window that has just had a file written down: it adds
 * that file without asking the server again.
 */
export function useSavedTranscripts(mediaIds: string[], active: boolean) {
  const key = active ? [...new Set(mediaIds)].sort().join(",") : ""
  const [answer, setAnswer] = React.useState<{
    key: string
    saved: SavedTranscriptSummary[]
  }>({ key: "", saved: NONE })

  React.useEffect(() => {
    if (!key) return
    let current = true
    loadSavedTranscripts(key.split(","))
      .then((saved) => {
        if (current) setAnswer({ key, saved })
      })
      .catch(() => {
        if (current) setAnswer({ key, saved: NONE })
      })
    return () => {
      current = false
    }
  }, [key])

  const saved = answer.key === key ? answer.saved : NONE
  const remember = React.useCallback(
    (row: SavedTranscriptSummary) => {
      setAnswer((previous) => ({
        key,
        saved: [
          ...(previous.key === key ? previous.saved : []).filter(
            (one) =>
              one.mediaId !== row.mediaId || one.transcriber !== row.transcriber
          ),
          row,
        ],
      }))
    },
    [key]
  )
  return { saved, remember }
}
