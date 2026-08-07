import * as React from "react"

import {
  getProjectErrorMessage,
  saveProjectTimeline,
} from "@/lib/api/video/projects"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { PlaybackClock } from "@/lib/video/playback-clock"
import {
  PROJECT_CONFLICT_MESSAGE,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import {
  createEditorStore,
  createInitialEditorState,
  EditorContext,
  useEditorStoreSelector,
} from "@/components/video-editor/editor-store"

// How long after the last edit the timeline is saved.
const AUTOSAVE_DEBOUNCE_MS = 1500

/** One way of writing a timeline out, so two of them can be compared. */
function serializeTimeline(timeline: ProjectTimeline) {
  return JSON.stringify({ tracks: timeline.tracks, aspect: timeline.aspect })
}

/** The project the editor opens on. */
export type EditorDocument = {
  id: string
  name: string
  version: number
  timeline: ProjectTimeline
}

/**
 * Holds everything the editor needs for one project: the state store, the
 * playback clock, and the auto-save loop.
 *
 * Saving has two rules worth knowing. Saves run one at a time, because two in
 * flight together would each carry the same version and the editor would clash
 * with itself. And once the server says the project changed somewhere else,
 * saving stops for good — the edits stay on screen, and the banner asks for a
 * reload rather than pretending a retry could win.
 */
export function EditorProvider({
  document,
  children,
}: {
  document: EditorDocument
  children: React.ReactNode
}) {
  const [store] = React.useState(() =>
    createEditorStore(
      createInitialEditorState(document.timeline),
      document.name
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
  // The version this editor's saves are built on. It moves forward with every
  // accepted save; a refusal means somebody else wrote first.
  const versionRef = React.useRef(document.version)
  const saveQueueRef = React.useRef<Promise<unknown>>(Promise.resolve())
  const saveTimeline = React.useCallback(
    (snapshot: ProjectTimeline) => {
      const run = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
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
              // The banner says this one, and says it once.
              store.setHasConflict()
            } else {
              showErrorToast(getProjectErrorMessage(error))
            }
            throw error
          }
        })
      saveQueueRef.current = run
      return run
    },
    [document.id, store]
  )

  // One clock per editor. It lives outside React so a frame tick never
  // re-renders the tree.
  const [clock] = React.useState(() => new PlaybackClock())
  // The latest edit not yet saved, cleared once it is. This is what lets the
  // unmount flush catch work made inside the debounce window.
  const pendingRef = React.useRef<ProjectTimeline | null>(null)
  /**
   * What is already stored, written out the same way the save is.
   *
   * Comparing against this rather than counting renders is what stops the
   * editor saving a project simply because somebody opened it — and it means an
   * edit undone back to where it started sends nothing either.
   */
  const lastSavedRef = React.useRef(serializeTimeline(document.timeline))

  const durationMs = useEditorStoreSelector(
    store,
    (snapshot) => snapshot.durationMs
  )
  const hasConflict = useEditorStoreSelector(
    store,
    (snapshot) => snapshot.hasConflict
  )

  // Keep the clock inside the current length of the project.
  React.useEffect(() => {
    clock.setDuration(durationMs)
  }, [clock, durationMs])

  // Stop the frame loop if the editor closes mid-playback.
  React.useEffect(() => () => clock.pause(), [clock])

  // Auto-save: every edit re-arms the timer. What is sent is the whole
  // timeline, so a later save heals an earlier one that failed.
  React.useEffect(() => {
    const snapshot: ProjectTimeline = { tracks, aspect }
    const serialized = serializeTimeline(snapshot)
    // Nothing has actually changed — opening a project is not an edit.
    if (serialized === lastSavedRef.current) return
    pendingRef.current = snapshot

    // Keep the edit on screen, but do not send one the server will refuse.
    if (hasConflict) return

    const timer = setTimeout(() => {
      pendingRef.current = null
      store.setSaveStatus("saving")
      saveTimeline(snapshot)
        .then(() => {
          dismissErrorToast()
          lastSavedRef.current = serialized
          store.setSaveStatus("saved")
        })
        .catch(() => {
          store.setSaveStatus("error")
          // Stay flushable on the way out unless a later edit replaced it.
          pendingRef.current ??= snapshot
        })
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [saveTimeline, tracks, aspect, store, hasConflict])

  // Work still inside the debounce window when the editor closes — going back
  // to the list, say — is sent on the way out.
  React.useEffect(() => {
    return () => {
      const snapshot = pendingRef.current
      // Read the flag from the store rather than a dependency, so this only
      // ever runs on a real unmount.
      if (snapshot && !store.getSnapshot().hasConflict) {
        void saveTimeline(snapshot).catch(() => undefined)
      }
    }
  }, [saveTimeline, store])

  const value = React.useMemo(
    () => ({
      store,
      dispatch: store.dispatch,
      clock,
      projectId: document.id,
      setProjectName: store.setProjectName,
    }),
    [store, clock, document.id]
  )

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  )
}
