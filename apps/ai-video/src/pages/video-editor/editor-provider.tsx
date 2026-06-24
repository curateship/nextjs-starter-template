import * as React from "react"

import { saveProjectTimeline, type ProjectTimeline } from "@/lib/api/video-projects"
import { saveTemplateTimeline } from "@/lib/api/video-templates"
import {
  createInitialEditorState,
  EditorContext,
  editorReducer,
  timelineDurationMs,
  type EditorDocumentKind,
  type EditorMode,
  type SaveStatus,
} from "@/pages/video-editor/editor-store"
import { PlaybackClock } from "@/pages/video-editor/playback-clock"

// How long after the last edit the timeline snapshot is persisted.
const AUTOSAVE_DEBOUNCE_MS = 1500

// The thing being edited — a project or a template. Both carry the same
// timeline shape, so the editor mounts on either.
export type EditorDocument = {
  id: string
  name: string
  template_id?: string | null
  source_viral_video_id?: string | null
  thumbnail_url?: string | null
  timeline: ProjectTimeline
}

// Hosts all editor state: the tracks reducer, the playback clock, and the
// autosave loop (writes back to the project or template per `kind`).
export function EditorProvider({
  document,
  kind,
  mode,
  children,
}: {
  document: EditorDocument
  kind: EditorDocumentKind
  mode: EditorMode
  children: React.ReactNode
}) {
  const [state, dispatch] = React.useReducer(
    editorReducer,
    document.timeline,
    createInitialEditorState
  )
  // Route a timeline snapshot to the right persistence fn for this document.
  const saveTimeline = React.useCallback(
    (snapshot: ProjectTimeline) =>
      kind === "template"
        ? saveTemplateTimeline(document.id, snapshot).then(() => undefined)
        : saveProjectTimeline(document.id, snapshot).then(() => undefined),
    [kind, document.id]
  )
  // One playback clock per editor mount; lives outside React so per-frame
  // ticks don't re-render the tree.
  const [clock] = React.useState(() => new PlaybackClock())
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("saved")
  // The document name lives in state so a rename (settings modal) updates the
  // header live. Initialized once from the prop, like the timeline reducer —
  // the editor remounts per document, so it never needs to re-sync the prop.
  const [documentName, setDocumentName] = React.useState(document.name)
  const [documentThumbnailUrl, setDocumentThumbnailUrl] = React.useState(
    document.thumbnail_url ?? null
  )
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
      saveTimeline(snapshot)
        .then(() => setSaveStatus("saved"))
        .catch(() => {
          setSaveStatus("error")
          // Keep the snapshot flushable on unmount unless an edit superseded it.
          pendingRef.current ??= snapshot
        })
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [saveTimeline, state.tracks, state.aspect])

  // Fire-and-forget flush for edits still inside the debounce window when
  // the editor unmounts (e.g. navigating back to the dashboard).
  React.useEffect(() => {
    return () => {
      const snapshot = pendingRef.current
      if (snapshot) {
        void saveTimeline(snapshot).catch(() => undefined)
      }
    }
  }, [saveTimeline])

  // Immediately persists a snapshot still waiting out the autosave debounce
  // (used by export so it renders the timeline as currently seen).
  const flushSave = React.useCallback(async () => {
    const snapshot = pendingRef.current
    if (!snapshot) return
    pendingRef.current = null
    setSaveStatus("saving")
    try {
      await saveTimeline(snapshot)
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("error")
      pendingRef.current ??= snapshot
      throw error
    }
  }, [saveTimeline])

  const value = React.useMemo(
    () => ({
      state,
      dispatch,
      clock,
      durationMs,
      saveStatus,
      kind,
      mode,
      documentId: document.id,
      documentName,
      setDocumentName,
      documentThumbnailUrl,
      setDocumentThumbnailUrl,
      flushSave,
    }),
    [
      state,
      clock,
      durationMs,
      saveStatus,
      kind,
      mode,
      document.id,
      documentName,
      documentThumbnailUrl,
      flushSave,
    ]
  )

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  )
}
