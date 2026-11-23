import * as React from "react"

import {
  saveProjectTimeline,
  type ProjectTimeline,
} from "@/lib/api/video-projects"
import { saveTemplateTimeline } from "@/lib/api/video-templates"
import { PROJECT_CONFLICT_MESSAGE } from "@/lib/timeline-schema"
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
  // Projects only: the concurrency token loaded with the timeline. Templates
  // have no version and are not conflict-guarded.
  version?: number
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
  // The project version this editor's saves are based on. Advances with every
  // accepted save; a rejected one means someone else wrote first.
  const versionRef = React.useRef(document.version ?? 1)
  // Tail of the save queue. Saves run one at a time so a second one always
  // sends the version the previous one just produced — two in flight together
  // would make the editor conflict with itself.
  const saveQueueRef = React.useRef<Promise<unknown>>(Promise.resolve())
  // Route a timeline snapshot to the right persistence fn for this document.
  // Project saves carry the loaded version and are rejected when stale — that
  // rejection raises the conflict banner and stops autosave until reload.
  const saveTimeline = React.useCallback(
    (snapshot: ProjectTimeline) => {
      const run = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (kind === "template") {
            await saveTemplateTimeline(document.id, snapshot)
            return
          }
          try {
            const saved = await saveProjectTimeline(
              document.id,
              snapshot,
              versionRef.current
            )
            versionRef.current = saved.version
          } catch (error) {
            if (
              error instanceof Error &&
              error.message === PROJECT_CONFLICT_MESSAGE
            ) {
              store.setHasConflict()
            }
            throw error
          }
        })
      saveQueueRef.current = run
      return run
    },
    [kind, document.id, store]
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
  // Once the project has changed elsewhere every further save would be
  // rejected too, so autosave stops and edits just stay in memory.
  const hasConflict = useEditorStoreSelector(
    store,
    (snapshot) => snapshot.hasConflict
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

    // Keep the edit in memory, but don't retry a save the server will reject.
    if (hasConflict) return

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
  }, [saveTimeline, tracks, aspect, store, hasConflict])

  // Fire-and-forget flush for edits still inside the debounce window when
  // the editor unmounts (e.g. navigating back to the dashboard).
  React.useEffect(() => {
    return () => {
      const snapshot = pendingRef.current
      // Read the flag from the store, not a dep, so this cleanup only ever
      // runs on a real unmount.
      if (snapshot && !store.getSnapshot().hasConflict) {
        void saveTimeline(snapshot).catch(() => undefined)
      }
    }
  }, [saveTimeline, store])

  // Persists a snapshot through the same versioned save path as autosave.
  const saveSnapshot = React.useCallback(
    async (snapshot: ProjectTimeline) => {
      store.setSaveStatus("saving")
      try {
        await saveTimeline(snapshot)
        store.setSaveStatus("saved")
      } catch (error) {
        store.setSaveStatus("error")
        throw error
      }
    },
    [saveTimeline, store]
  )

  // Immediately persists a snapshot still waiting out the autosave debounce
  // (used by export so it renders the timeline as currently seen).
  const flushSave = React.useCallback(async () => {
    // The stored timeline is no longer the one on screen, so callers that
    // depend on a flush (export) must fail rather than act on stale data.
    if (store.getSnapshot().hasConflict) {
      throw new Error(PROJECT_CONFLICT_MESSAGE)
    }
    const snapshot = pendingRef.current
    if (!snapshot) return
    pendingRef.current = null
    try {
      await saveSnapshot(snapshot)
    } catch (error) {
      pendingRef.current ??= snapshot
      throw error
    }
  }, [saveSnapshot, store])

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
      saveSnapshot,
    }),
    [store, clock, kind, mode, document.id, flushSave, saveSnapshot]
  )

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  )
}
