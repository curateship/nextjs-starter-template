import * as React from "react"

import {
  saveProjectTimeline,
  type ProjectTimeline,
} from "@/lib/api/video-projects"
import { saveTemplateTimeline } from "@/lib/api/video-templates"
import {
  createEditorStore,
  createInitialEditorState,
  EditorContext,
  type EditorDocumentKind,
  type EditorMode,
  useEditorStoreSelector,
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
  timeline_error?: string | null
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
  const [store] = React.useState(() =>
    createEditorStore(
      createInitialEditorState(document.timeline),
      document.name,
      document.thumbnail_url ?? null
    )
  )
  const tracks = useEditorStoreSelector(
    store,
    (snapshot) => snapshot.state.tracks
  )
  const aspect = useEditorStoreSelector(
    store,
    (snapshot) => snapshot.state.aspect
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
  // Latest unsaved snapshot; cleared once persisted. Lets the unmount flush
  // catch edits made inside the debounce window when navigating away.
  const pendingRef = React.useRef<ProjectTimeline | null>(null)
  const hydratedRef = React.useRef(false)

  const durationMs = useEditorStoreSelector(
    store,
    (snapshot) => snapshot.durationMs
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
      tracks,
      aspect,
    }
    pendingRef.current = snapshot

    const timer = setTimeout(() => {
      pendingRef.current = null
      store.setSaveStatus("saving")
      saveTimeline(snapshot)
        .then(() => store.setSaveStatus("saved"))
        .catch(() => {
          store.setSaveStatus("error")
          // Keep the snapshot flushable on unmount unless an edit superseded it.
          pendingRef.current ??= snapshot
        })
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [saveTimeline, tracks, aspect, store])

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
    store.setSaveStatus("saving")
    try {
      await saveTimeline(snapshot)
      store.setSaveStatus("saved")
    } catch (error) {
      store.setSaveStatus("error")
      pendingRef.current ??= snapshot
      throw error
    }
  }, [saveTimeline, store])

  const value = React.useMemo(
    () => ({
      store,
      dispatch: store.dispatch,
      clock,
      kind,
      mode,
      documentId: document.id,
      setDocumentName: store.setDocumentName,
      setDocumentThumbnailUrl: store.setDocumentThumbnailUrl,
      flushSave,
    }),
    [store, clock, kind, mode, document.id, flushSave]
  )

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  )
}
