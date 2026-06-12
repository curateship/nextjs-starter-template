import * as React from "react"

import {
  createInitialEditorState,
  EditorContext,
  editorReducer,
  timelineDurationMs,
} from "@/pages/video-editor/editor-store"
import { PlaybackClock } from "@/pages/video-editor/playback-clock"

// Hosts all editor state: the tracks reducer and the playback clock.
export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(
    editorReducer,
    undefined,
    createInitialEditorState
  )
  // One playback clock per editor mount; lives outside React so per-frame
  // ticks don't re-render the tree.
  const [clock] = React.useState(() => new PlaybackClock())

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

  const value = React.useMemo(
    () => ({ state, dispatch, clock, durationMs }),
    [state, clock, durationMs]
  )

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  )
}
