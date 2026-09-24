import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import {
  getProjectErrorMessage,
  keepRefusedProjectTimeline,
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
  type EditorStore,
} from "@/components/video-editor/editor-store"

// How long after the last edit the timeline is saved.
const AUTOSAVE_DEBOUNCE_MS = 1500

/** One way of writing a timeline out, so two of them can be compared. */
function serializeTimeline(timeline: ProjectTimeline) {
  return JSON.stringify({ tracks: timeline.tracks, aspect: timeline.aspect })
}

const CONFLICT_NOTICE =
  "Another window saved this project first, so this one stopped saving."

function showReadOnlyNotice() {
  showErrorToast("This window is read-only, so that change was not made.", {
    label: "Reload to edit",
    onClick: () => window.location.reload(),
  })
}

function timelineOf(store: EditorStore): ProjectTimeline {
  const { tracks, aspect } = store.getSnapshot().state
  return { tracks, aspect }
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
 * saving stops for good. The window locks, what it has on screen is kept as a
 * new project beside the original, and a reload picks up the other window's
 * version. A retry could never win, and a reload alone would throw the work
 * away.
 */
export function EditorProvider({
  document,
  children,
}: {
  document: EditorDocument
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  // What a refused edit repeats back. Set once the window locks, and replaced
  // as keeping the copy moves on, so it always says where the work is now.
  const lockNoticeRef = React.useRef<(() => void) | null>(null)
  const [store] = React.useState(() =>
    createEditorStore(
      createInitialEditorState(document.timeline),
      document.name,
      () => (lockNoticeRef.current ?? showReadOnlyNotice)()
    )
  )

  /**
   * Keeps what this window has as a new project, and says where it went. A
   * failure keeps the work on screen and offers to try again, because the
   * window is locked and nothing else will save it.
   */
  const keepRefusedWork = React.useCallback(async () => {
    const say = (notice: () => void) => {
      lockNoticeRef.current = notice
      notice()
    }
    say(() => showErrorToast(`${CONFLICT_NOTICE} Keeping your work here as a new project.`))
    try {
      const copy = await keepRefusedProjectTimeline(
        document.id,
        timelineOf(store)
      )
      say(() =>
        showErrorToast(
          `${CONFLICT_NOTICE} Your work here is kept as "${copy.name}".`,
          {
            label: "Open it",
            onClick: () =>
              void navigate({
                to: "/admin/video-editor/$projectId",
                params: { projectId: copy.id },
              }),
          }
        )
      )
    } catch (error) {
      say(() =>
        showErrorToast(
          `${CONFLICT_NOTICE} Keeping your work here as a new project failed: ${getProjectErrorMessage(error)}`,
          { label: "Try again", onClick: () => void keepRefusedWork() }
        )
      )
    }
  }, [document.id, navigate, store])
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
              // Only the first refusal keeps a copy. Later ones were already
              // in the queue behind it and carry nothing newer.
              if (store.getSnapshot().lock !== "conflict") {
                store.setLock("conflict")
                void keepRefusedWork()
              }
            } else {
              showErrorToast(getProjectErrorMessage(error))
            }
            throw error
          }
        })
      saveQueueRef.current = run
      return run
    },
    [document.id, keepRefusedWork, store]
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
  const locked = useEditorStoreSelector(
    store,
    (snapshot) => snapshot.lock !== null
  )

  // Keep the clock inside the current length of the project.
  React.useEffect(() => {
    clock.setDuration(durationMs)
  }, [clock, durationMs])

  // Stop the frame loop if the editor closes mid-playback.
  React.useEffect(() => () => clock.pause(), [clock])

  /**
   * Send whatever is still waiting.
   *
   * This is the one way an edit reaches the server: the auto-save timer calls
   * it, and so does anything that needs the saved project to be up to date.
   * The AI tools are the second sort — they pull the sound off the file the
   * server knows about, so without this they work on the timeline as it was a
   * second and a half ago.
   */
  const saveNow = React.useCallback(async () => {
    const snapshot = pendingRef.current
    if (!snapshot || store.getSnapshot().lock) return
    pendingRef.current = null
    store.setSaveStatus("saving")
    try {
      await saveTimeline(snapshot)
      dismissErrorToast()
      lastSavedRef.current = serializeTimeline(snapshot)
      store.setSaveStatus("saved")
    } catch {
      store.setSaveStatus("error")
      // Stay flushable on the way out unless a later edit replaced it.
      pendingRef.current ??= snapshot
    }
  }, [saveTimeline, store])

  // Auto-save: every edit re-arms the timer. What is sent is the whole
  // timeline, so a later save heals an earlier one that failed.
  React.useEffect(() => {
    const snapshot: ProjectTimeline = { tracks, aspect }
    const serialized = serializeTimeline(snapshot)
    // Nothing has actually changed — opening a project is not an edit.
    if (serialized === lastSavedRef.current) return
    pendingRef.current = snapshot

    // A locked window sends nothing. Its work is already in the kept copy.
    if (locked) return

    const timer = setTimeout(() => void saveNow(), AUTOSAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [saveNow, tracks, aspect, locked])

  // Work still inside the debounce window when the editor closes — going back
  // to the list, say — is sent on the way out.
  React.useEffect(() => {
    return () => {
      const snapshot = pendingRef.current
      // Read the flag from the store rather than a dependency, so this only
      // ever runs on a real unmount.
      if (snapshot && !store.getSnapshot().lock) {
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
      saveNow,
      setProjectName: store.setProjectName,
    }),
    [store, clock, document.id, saveNow]
  )

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  )
}
