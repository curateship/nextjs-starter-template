import * as React from "react"

import {
  reportEditorWindowClosed,
  reportEditorWindowOpen,
} from "@/lib/api/video/editor-windows"
import {
  EDITOR_WINDOW_CHECK_IN_MS,
  type EditorWindowCheckIn,
  type EditorWindowMode,
} from "@/lib/video/editor-windows"

// Where a tab leaves its id while it reloads, so the reloaded page carries on
// as the same window instead of finding its own row and calling it somebody
// else's.
const WINDOW_ID_KEY = "video-editor-window-id"

let windowId: string | null = null

/**
 * This tab's id, made once per page.
 *
 * The id is taken out of session storage on the way in and put back only as
 * the page goes away. A tab copied with the browser's Duplicate command copies
 * session storage while the page is still open, when the id is not in it, so
 * the copy makes its own id and the two tabs see each other.
 */
function currentWindowId() {
  if (windowId) return windowId
  let kept: string | null = null
  try {
    kept = sessionStorage.getItem(WINDOW_ID_KEY)
    sessionStorage.removeItem(WINDOW_ID_KEY)
  } catch {
    // Storage switched off: every load is a new window, which only costs a
    // reload's warning while the old row waits out its 90 seconds.
  }
  const id = kept ?? crypto.randomUUID()
  windowId = id
  window.addEventListener("pagehide", () => {
    try {
      sessionStorage.setItem(WINDOW_ID_KEY, id)
    } catch {
      // As above.
    }
  })
  return id
}

/**
 * Keeps this window's row for the project up to date for as long as the
 * editor is open, and hands back what the first check-in heard: when each
 * other window editing the project was opened. Null until that answer is in.
 *
 * A check-in that fails is let go. The warning is a courtesy; the refused save
 * and the copy it keeps are what actually protect the work.
 */
export function useEditorWindow(projectId: string, mode: EditorWindowMode) {
  const [firstCheckIn, setFirstCheckIn] =
    React.useState<EditorWindowCheckIn | null>(null)
  const answeredRef = React.useRef(false)
  // Every message about this window goes out after the one before it has
  // been answered. Otherwise a slow "editing" could land after a later
  // "read-only" or "closed" and bring back a row that should be gone.
  const queueRef = React.useRef<Promise<unknown>>(Promise.resolve())
  const send = React.useCallback(
    <T,>(message: () => Promise<T>): Promise<T> => {
      const next = queueRef.current.catch(() => undefined).then(message)
      queueRef.current = next
      return next
    },
    []
  )

  // Checks in straight away, then every 15 seconds. A change of mode starts
  // again, so a window that turns read-only stops counting as an editor at
  // once rather than at the next tick.
  React.useEffect(() => {
    const id = currentWindowId()
    let active = true
    function checkIn() {
      send(() => reportEditorWindowOpen(projectId, id, mode))
        .then((answer) => {
          if (!active || answeredRef.current) return
          answeredRef.current = true
          setFirstCheckIn(answer)
        })
        .catch(() => undefined)
    }
    checkIn()
    const timer = window.setInterval(checkIn, EDITOR_WINDOW_CHECK_IN_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [projectId, mode, send])

  // Closing the tab, reloading it, or leaving for another page all take the
  // row away, so a project reopened a moment later is not reported as open.
  // A closing tab sends at once, since there is no page left to wait on. A
  // check-in still on its way can land after it, which leaves the row behind
  // for at most 90 seconds. Leaving inside the app waits its turn like any
  // other message, so it never loses that race.
  React.useEffect(() => {
    const id = currentWindowId()
    const close = () => reportEditorWindowClosed(projectId, id)
    const closeTab = () => void close().catch(() => undefined)
    window.addEventListener("pagehide", closeTab)
    return () => {
      window.removeEventListener("pagehide", closeTab)
      void send(close).catch(() => undefined)
    }
  }, [projectId, send])

  return firstCheckIn
}
