import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"

import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import {
  editorViewStorageKey,
  readEditorView,
  updateEditorView,
} from "@/lib/video/editor-view-memory"
import {
  findClip,
  useEditorRuntime,
} from "@/components/video-editor/editor-store"

const authenticatedRoute = getRouteApi("/_authenticated")

/** Where this person's view of the open project is kept. */
function useEditorViewKey() {
  const { projectId } = useEditorRuntime()
  const { user } = authenticatedRoute.useLoaderData()
  return editorViewStorageKey(user.id, projectId)
}

// How long the timeline has to sit still before where it is gets written down.
// A scroll fires dozens of times a second, and only where it stops matters.
const SAVE_DEBOUNCE_MS = 300

/**
 * Open the timeline where this person last left it in this project, and keep
 * writing down where they are as they work.
 *
 * The saved view lands before the first paint, so the timeline never shows at
 * the default zoom and then jumps. A saved view also stands in for the
 * fit-to-width that a project otherwise gets on opening, which is why the
 * caller's `fittedRef` is set here. A remembered clip that has since been
 * deleted is simply not selected, and a playhead past the end of a project
 * that has since got shorter stops at the end.
 *
 * `pps` is the zoom the timeline just drew at. The scroll is put back only
 * once that matches the remembered zoom, because until then the lanes are the
 * wrong width and the browser would cut the scroll short.
 */
export function useRememberedTimelineView({
  scrollRef,
  fittedRef,
  pps,
  clampZoom,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  fittedRef: React.RefObject<boolean>
  pps: number
  clampZoom: (pxPerSecond: number) => number
}) {
  const { store, dispatch, clock } = useEditorRuntime()
  const key = useEditorViewKey()

  // Where the scroll still has to go, set until the lanes are drawn at the
  // remembered zoom. Nothing is saved while it is set, so the half-restored
  // view can never overwrite the real one.
  const pendingScrollRef = React.useRef<{
    pxPerSecond: number
    left: number
    top: number
  } | null>(null)

  useEffectBeforePaint(() => {
    const view = readEditorView(key).timeline
    if (view) {
      fittedRef.current = true
      const pxPerSecond = clampZoom(view.pxPerSecond)
      dispatch({ type: "SET_ZOOM", pxPerSecond })
      const { tracks } = store.getSnapshot().state
      if (view.selectedClipId && findClip(tracks, view.selectedClipId)) {
        dispatch({ type: "SELECT_CLIP", clipId: view.selectedClipId })
      }
      // The provider tells the clock how long the project is only after this
      // runs, and until then the clock would stop any seek at zero.
      clock.setDuration(store.getSnapshot().durationMs)
      clock.seek(view.playheadMs)
      pendingScrollRef.current = {
        pxPerSecond,
        left: view.scrollLeft,
        top: view.scrollTop,
      }
    }
  }, [clampZoom, clock, dispatch, fittedRef, key, store])

  useEffectBeforePaint(() => {
    const pending = pendingScrollRef.current
    const scroll = scrollRef.current
    if (!pending || !scroll || pending.pxPerSecond !== pps) return
    pendingScrollRef.current = null
    scroll.scrollTo({ left: pending.left, top: pending.top })
  })

  // Runs after the restore above, which as a before-paint effect always goes
  // first, so nothing here can save over the view before it is read.
  React.useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return

    // Kept as it happens rather than read at save time: the last save runs
    // after the timeline has left the page, when the box reads as unscrolled.
    let scrollLeft = scroll.scrollLeft
    let scrollTop = scroll.scrollTop
    const save = () => {
      if (pendingScrollRef.current) return
      const { pxPerSecond, selectedClipId } = store.getSnapshot().state
      updateEditorView(key, {
        timeline: {
          pxPerSecond,
          scrollLeft,
          scrollTop,
          selectedClipId,
          playheadMs: Math.round(clock.getTime()),
        },
      })
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(save, SAVE_DEBOUNCE_MS)
    }
    const onScroll = () => {
      scrollLeft = scroll.scrollLeft
      scrollTop = scroll.scrollTop
      schedule()
    }

    // Only zoom and selection matter from the store. Anything else changing
    // (an edit, a save status) would just rewrite the same view.
    let last = store.getSnapshot().state
    const unsubscribe = store.subscribe(() => {
      const { state } = store.getSnapshot()
      if (
        state.pxPerSecond === last.pxPerSecond &&
        state.selectedClipId === last.selectedClipId
      ) {
        return
      }
      last = state
      schedule()
    })
    // The clock ticks every frame while playing, so this settles only once
    // playback or a drag of the playhead stops.
    const unsubscribeClock = clock.subscribe(schedule)
    scroll.addEventListener("scroll", onScroll, { passive: true })
    // Closing the tab inside the debounce window still writes it down.
    window.addEventListener("pagehide", save)

    return () => {
      clearTimeout(timer)
      unsubscribe()
      unsubscribeClock()
      scroll.removeEventListener("scroll", onScroll)
      window.removeEventListener("pagehide", save)
      save()
    }
  }, [clock, key, scrollRef, store])
}

/**
 * Open the panel on the left that this person last had open in this project.
 *
 * `isPanel` says whether a saved name is still one of the editor's panels, so
 * a panel that has since been removed opens the default one instead.
 */
export function useRememberedRailPanel<Panel extends string>(
  panel: Panel,
  setPanel: (panel: Panel) => void,
  isPanel: (name: string) => name is Panel
) {
  const key = useEditorViewKey()
  const [restored, setRestored] = React.useState(false)

  useEffectBeforePaint(() => {
    const saved = readEditorView(key).panel
    if (saved && isPanel(saved)) setPanel(saved)
    setRestored(true)
  }, [isPanel, key, setPanel])

  React.useEffect(() => {
    if (restored) updateEditorView(key, { panel })
  }, [key, panel, restored])
}
