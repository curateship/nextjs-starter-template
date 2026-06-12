import * as React from "react"

import {
  saveProjectTimeline,
  type ProjectDetail,
  type ProjectTimeline,
} from "@/lib/api/video-projects"
import {
  createInitialEditorState,
  EditorContext,
  editorReducer,
  timelineDurationMs,
  type SaveStatus,
} from "@/pages/video-editor/editor-store"
import { PlaybackClock } from "@/pages/video-editor/playback-clock"

// How long after the last edit the timeline snapshot is persisted.
const AUTOSAVE_DEBOUNCE_MS = 1500

// Hosts all editor state: the tracks reducer, the playback clock, and the
// project autosave loop.
export function EditorProvider({
  project,
  children,
}: {
  project: ProjectDetail
  children: React.ReactNode
}) {
  const [state, dispatch] = React.useReducer(
    editorReducer,
    project.timeline,
    createInitialEditorState
  )
  // One playback clock per editor mount; lives outside React so per-frame
  // ticks don't re-render the tree.
  const [clock] = React.useState(() => new PlaybackClock())
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("saved")
  // Latest unsaved snapshot; cleared once persisted. Lets the unmount flush
  // catch edits made inside the debounce window when navigating away.
  const pendingRef = React.useRef<ProjectTimeline | null>(null)
  const hydratedRef = React.useRef(false)

  const durationMs = React.useMemo(
    () => timelineDurationMs(state.tracks),
    [state.tracks]
  )

  // Keep the clock clamped to the current timeline length.
  React.useEffect(() => {
    clock.setDuration(durationMs)
  }, [clock, durationMs])

  // Stop the rAF loop if the editor unmounts mid-playback.
  React.useEffect(() => () => clock.pause(), [clock])

  // Debounced autosave: each edit re-arms the timer; the snapshot is the full
  // serializable substate, so any later save heals an earlier failed one.
  React.useEffect(() => {
    // The initial reducer state is what we just loaded — nothing to save yet.
    if (!hydratedRef.current) {
      hydratedRef.current = true
      return
    }

    const snapshot: ProjectTimeline = {
      tracks: state.tracks,
      aspect: state.aspect,
    }
    pendingRef.current = snapshot

    const timer = setTimeout(() => {
      pendingRef.current = null
      setSaveStatus("saving")
      saveProjectTimeline(project.id, snapshot)
        .then(() => setSaveStatus("saved"))
        .catch(() => {
          setSaveStatus("error")
          // Keep the snapshot flushable on unmount unless an edit superseded it.
          pendingRef.current ??= snapshot
        })
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [project.id, state.tracks, state.aspect])

  // Fire-and-forget flush for edits still inside the debounce window when
  // the editor unmounts (e.g. navigating back to the projects dashboard).
  React.useEffect(() => {
    return () => {
      const snapshot = pendingRef.current
      if (snapshot) {
        void saveProjectTimeline(project.id, snapshot).catch(() => undefined)
      }
    }
  }, [project.id])

  const value = React.useMemo(
    () => ({ state, dispatch, clock, durationMs, saveStatus }),
    [state, clock, durationMs, saveStatus]
  )

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  )
}
