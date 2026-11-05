import * as React from "react"
import { toast } from "sonner"

import { useEditorRuntime } from "@/components/video-editor/editor-store"
import {
  MARKERS_FULL_MESSAGE,
  MAX_TIMELINE_MARKERS,
} from "@/lib/video/timeline-markers"
import { clockText } from "@/lib/video/export-stretch"
import { editorId } from "@/lib/video/timeline-utils"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Drops a pin at the playhead: the M key and the toolbar's pin button.
 * A full video says so rather than dropping nothing without a word. The
 * first pin on a video also says what pins are for, since a bare pin on the
 * ruler doesn't.
 */
export function useDropMarker() {
  const { store, dispatch, clock } = useEditorRuntime()
  return React.useCallback(() => {
    const atMs = Math.round(clock.getTime())
    const { markers } = store.getSnapshot().state
    if (
      markers.length >= MAX_TIMELINE_MARKERS &&
      !markers.some((marker) => marker.atMs === atMs)
    ) {
      showErrorToast(MARKERS_FULL_MESSAGE)
      return
    }
    dispatch({ type: "ADD_MARKER", marker: { id: editorId(), atMs, name: "" } })
    if (!markers.length) {
      toast(`Marker added at ${clockText(atMs)}`, {
        description:
          "It's the pin on the ruler. Double-click it to name it, drag it to move it, or right-click to delete it. Clip edges snap to it, and named markers become YouTube chapters on the export.",
      })
    }
  }, [clock, dispatch, store])
}
