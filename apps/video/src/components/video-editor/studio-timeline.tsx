import * as React from "react"
import {
  Eye,
  Film,
  Layers as LayersIcon,
  GripVertical,
  Image as ImageIcon,
  Maximize2,
  Minus,
  Music2,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Type,
  Undo2,
  Volume2,
  VolumeX,
} from "lucide-react"

import {
  resolveIncomingTransition,
  TRANSITION_OPTIONS,
  type ClipTransition,
} from "@/lib/video/clip-transitions"
import {
  filmstripFrameStyle,
  getVideoFilmstrip,
  type FilmstripFrame,
} from "@/lib/video/filmstrips"
import type { PlaybackClock } from "@/lib/video/playback-clock"
import {
  buildSnapIndex,
  candidatesForTrack,
  snapClipMove,
  snapEdge,
  snapThresholdMs,
  type SnapIndex,
} from "@/lib/video/timeline-snapping"
import {
  CUT_CURSOR,
  MAX_PX_PER_SECOND,
  MIN_CLIP_MS,
  MIN_PX_PER_SECOND,
  msToPx,
  pxToMs,
  waveformDataUrl,
} from "@/lib/video/timeline-utils"
import {
  metricsCovered,
  padWindow,
  scrollToRevealClip,
  visibleClips,
  visibleTickSeconds,
  visibleTimeRange,
  type ScrollMetrics,
  type TimelineWindow,
} from "@/lib/video/timeline-virtualization"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import {
  useEditorDurationMs,
  useEditorRuntime,
  useEditorSelector,
  type EditorClip,
  type EditorTrack,
} from "@/components/video-editor/editor-store"

/**
 * The timeline: lanes of clips under a ruler, with a playhead.
 *
 * Two things keep it quick on a long project. Only the clips near the scroll
 * window are drawn at all, and everything that moves with the pointer — the
 * playhead, a dragged clip, the snapping guide — moves by touching the element
 * rather than by re-rendering, so a project with hundreds of clips drags as
 * smoothly as one with three.
 */

// Nothing outside this file needs these: the panel around the timeline is the
// app's own, and sizes it.
const GUTTER = 120
const ROW_H = 52
const RULER_H = 28

// The zoom slider works in a denser part of the store's range so clips read at
// a useful size; it is still clamped to the store's hard limits.
const ZOOM_MIN = Math.max(MIN_PX_PER_SECOND, 18)
const ZOOM_MAX = Math.min(MAX_PX_PER_SECOND, 90)

const ACCENTS = {
  video: "var(--acc)",
  text: "var(--warn)",
  audio: "var(--good)",
  image: "var(--violet)",
  mixed: "var(--mut)",
} as const

// Turn a vertical drag into whole lanes, clamped to the lanes that exist.
function clampRowDelta(dy: number, trackIndex: number, trackCount: number) {
  return Math.min(
    Math.max(Math.round(dy / ROW_H), -trackIndex),
    trackCount - 1 - trackIndex
  )
}

// A lane has no kind of its own — read it off its clips, so the gutter can
// colour-code lanes.
function trackKind(track: EditorTrack): keyof typeof ACCENTS {
  if (!track.clips.length) return "mixed"
  const kinds = new Set(track.clips.map((clip) => clip.kind))
  if (kinds.size === 1) {
    const only = track.clips[0].kind
    return only === "video"
      ? "video"
      : only === "audio"
        ? "audio"
        : only === "image"
          ? "image"
          : "text"
  }
  return "mixed"
}

// The kind icon shown in the gutter instead of a label — the lane's name is a
// tooltip. A lane holding more than one kind falls back to a layers glyph.
function trackIcon(kind: keyof typeof ACCENTS, size = 16) {
  switch (kind) {
    case "video":
      return <Film size={size} />
    case "audio":
      return <Music2 size={size} />
    case "image":
      return <ImageIcon size={size} />
    case "text":
      return <Type size={size} />
    default:
      return <LayersIcon size={size} />
  }
}

function trackName(track: EditorTrack, index: number) {
  switch (trackKind(track)) {
    case "video":
      return "Video"
    case "audio":
      return "Audio"
    case "image":
      return "Images"
    case "text":
      return "Text"
    default:
      return `Track ${index + 1}`
  }
}

function clipLabel(clip: EditorClip) {
  return clip.kind === "text" ? clip.text || clip.name : clip.name
}

const iconBtn: React.CSSProperties = {
  height: 32,
  minWidth: 32,
  padding: "0 7px",
  display: "grid",
  placeItems: "center",
  background: "transparent",
  border: "none",
  borderRadius: 9,
  color: "var(--ink2)",
  cursor: "pointer",
}

// The line a snapping clip locks onto. A clip deep inside a lane has to reach
// one element spanning every lane, and has to do it without a re-render on each
// pointer move — so the line is driven through this handle instead of state.
// `leftPx` already includes the gutter, because the caller knows the zoom.
type SnapGuideApi = { show: (leftPx: number) => void; hide: () => void }
const SnapGuideContext = React.createContext<SnapGuideApi | null>(null)

export function StudioTimeline() {
  const tracks = useEditorSelector((state) => state.tracks)
  const pps = useEditorSelector((state) => state.pxPerSecond)
  const durationMs = useEditorDurationMs()
  const { dispatch, clock } = useEditorRuntime()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const innerRef = React.useRef<HTMLDivElement>(null)

  // Time zero sits one gutter in from the left edge of the scrolled content.
  const timeOriginX = React.useCallback(() => {
    const inner = innerRef.current
    return inner ? inner.getBoundingClientRect().left + GUTTER : 0
  }, [])
  const msAtClientX = React.useCallback(
    (clientX: number) => Math.max(0, pxToMs(clientX - timeOriginX(), pps)),
    [pps, timeOriginX]
  )

  // Fit the whole project across the visible lane width once, when it first
  // has a length — the stored default zoom is deliberately conservative.
  const fittedRef = React.useRef(false)
  const fit = React.useCallback(() => {
    const scroll = scrollRef.current
    if (!scroll || durationMs <= 0) return
    const laneWidth = scroll.clientWidth - GUTTER - 48
    const next = Math.round(
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, laneWidth / (durationMs / 1000)))
    )
    dispatch({ type: "SET_ZOOM", pxPerSecond: next })
  }, [dispatch, durationMs])

  React.useEffect(() => {
    if (fittedRef.current || durationMs <= 0) return
    fittedRef.current = true
    fit()
  }, [durationMs, fit])

  // --- Scrubbing on the ruler and the empty parts of a lane ----------------
  const scrub = React.useRef<{ pointerId: number; lastMs: number } | null>(null)
  function seekDown(event: React.PointerEvent) {
    if (event.button !== 0) return
    // A press that lands on a clip belongs to the clip.
    if ((event.target as HTMLElement).closest("[data-clip]")) return
    dispatch({ type: "SELECT_CLIP", clipId: null })
    const timeMs = msAtClientX(event.clientX)
    scrub.current = { pointerId: event.pointerId, lastMs: timeMs }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    clock.beginScrub(timeMs)
  }
  function seekMove(event: React.PointerEvent) {
    const active = scrub.current
    if (!active || active.pointerId !== event.pointerId) return
    active.lastMs = msAtClientX(event.clientX)
    clock.updateScrub(active.lastMs)
  }
  function seekUp(event: React.PointerEvent) {
    const active = scrub.current
    if (!active || active.pointerId !== event.pointerId) return
    active.lastMs = msAtClientX(event.clientX)
    scrub.current = null
    clock.endScrub(active.lastMs)
    try {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(
        event.pointerId
      )
    } catch {
      /* the capture may already be gone */
    }
  }
  function seekCancel(event: React.PointerEvent) {
    const active = scrub.current
    if (!active || active.pointerId !== event.pointerId) return
    scrub.current = null
    clock.endScrub(active.lastMs)
  }

  const contentWidth = GUTTER + msToPx(Math.max(durationMs, 1000), pps) + 48
  const range = useTimelineWindow(scrollRef, pps)

  const guideRef = React.useRef<HTMLDivElement>(null)
  const guide = React.useMemo<SnapGuideApi>(
    () => ({
      show(leftPx) {
        const element = guideRef.current
        if (!element) return
        element.style.left = `${leftPx}px`
        element.style.display = "block"
      },
      hide() {
        const element = guideRef.current
        if (element) element.style.display = "none"
      },
    }),
    []
  )

  return (
    <section
      data-screen-label="Timeline"
      className="studio-flat-timeline flex h-full min-h-0 flex-col"
      style={{ position: "relative" }}
    >
      <TimelineToolbar fit={fit} />

      <div
        ref={scrollRef}
        style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}
      >
        <div
          ref={innerRef}
          style={{ position: "relative", minWidth: "100%", width: contentWidth }}
        >
          <div
            style={{
              display: "flex",
              height: RULER_H,
              position: "sticky",
              top: 0,
              zIndex: 6,
              background: "var(--panel)",
            }}
          >
            <div
              style={{
                width: GUTTER,
                flex: "none",
                background: "var(--panel)",
                position: "sticky",
                left: 0,
                zIndex: 2,
              }}
            />
            <div
              onPointerDown={seekDown}
              onPointerMove={seekMove}
              onPointerUp={seekUp}
              onPointerCancel={seekCancel}
              onLostPointerCapture={seekCancel}
              style={{ position: "relative", flex: 1, cursor: "pointer" }}
            >
              <RulerTicks pps={pps} durationMs={durationMs} range={range} />
            </div>
          </div>

          <SnapGuideContext.Provider value={guide}>
            {tracks.map((track, index) => (
              <TimelineRow
                key={track.id}
                track={track}
                index={index}
                range={range}
                seekDown={seekDown}
                seekMove={seekMove}
                seekUp={seekUp}
                seekCancel={seekCancel}
              />
            ))}
          </SnapGuideContext.Provider>

          {/* The alignment line, shown only while a dragged clip is locked onto
              an edge. It sits under the playhead so the two never fight over
              the same pixel. */}
          <div
            ref={guideRef}
            data-snap-guide="timeline"
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: GUTTER,
              width: 1,
              background: "var(--acc)",
              boxShadow:
                "0 0 0 1px color-mix(in oklch, var(--acc), transparent 72%)",
              zIndex: 7,
              pointerEvents: "none",
              display: "none",
            }}
          />

          <ClockPlayhead clock={clock} pps={pps} />
        </div>
      </div>

      <ClipReveal scrollRef={scrollRef} />
    </section>
  )
}

/**
 * Measure the scroll box and turn it into the range of time the lanes draw.
 * Scroll and resize are collapsed to one measurement per frame, and a new one
 * is only taken once the viewport reaches the edge of what is already drawn —
 * so scrolling inside the margin costs nothing.
 *
 * What is stored is the scroll offset and width, not the time range: a zoom
 * changes every time but no offset, so the range recomputes in the same render
 * rather than a frame later, when the lanes would already have been painted at
 * the wrong scale.
 */
function useTimelineWindow(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  pps: number
) {
  // The box cannot be measured before the first paint and always starts at the
  // left edge, so assume a generous width and correct it immediately.
  const [metrics, setMetrics] = React.useState<ScrollMetrics>({
    scrollLeft: 0,
    viewportPx: 2000,
  })
  const metricsRef = React.useRef(metrics)
  const frameRef = React.useRef(0)

  React.useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    function measure(force: boolean) {
      const next = {
        scrollLeft: scroll!.scrollLeft,
        viewportPx: scroll!.clientWidth,
      }
      if (!force && metricsCovered(metricsRef.current, next)) return
      metricsRef.current = next
      setMetrics(next)
    }
    measure(true)
    function schedule() {
      if (frameRef.current) return
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0
        measure(false)
      })
    }
    scroll.addEventListener("scroll", schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(scroll)
    return () => {
      scroll.removeEventListener("scroll", schedule)
      observer.disconnect()
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [scrollRef])

  return React.useMemo(
    () =>
      padWindow(
        visibleTimeRange({ ...metrics, gutterPx: GUTTER, pxPerSecond: pps }),
        pps
      ),
    [metrics, pps]
  )
}

/**
 * Scroll a newly added clip into view. Adding a clip selects it, so a selected
 * clip that was not in the previous list has just arrived. It may not be drawn
 * anywhere yet, so the offsets come from its place on the timeline rather than
 * from an element. Draws nothing: keeping the selection out of the timeline
 * body is what stops a plain click re-rendering every lane.
 */
function ClipReveal({
  scrollRef,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>
}) {
  const { store } = useEditorRuntime()
  const tracks = useEditorSelector((state) => state.tracks)
  const selectedClipId = useEditorSelector((state) => state.selectedClipId)
  const knownClipIds = React.useRef<Set<string> | null>(null)

  React.useEffect(() => {
    const ids = new Set<string>()
    let selectedClip: EditorClip | null = null
    let selectedTrackIndex = -1
    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
      for (const clip of tracks[trackIndex].clips) {
        ids.add(clip.id)
        if (clip.id === selectedClipId) {
          selectedClip = clip
          selectedTrackIndex = trackIndex
        }
      }
    }
    const known = knownClipIds.current
    knownClipIds.current = ids
    // The first pass has nothing to compare against, so nothing counts as new.
    if (!known || !selectedClipId || known.has(selectedClipId)) return
    const scroll = scrollRef.current
    if (!scroll || !selectedClip) return
    scroll.scrollTo(
      scrollToRevealClip({
        clip: selectedClip,
        trackIndex: selectedTrackIndex,
        pxPerSecond: store.getSnapshot().state.pxPerSecond,
        scrollLeft: scroll.scrollLeft,
        scrollTop: scroll.scrollTop,
        viewportWidth: scroll.clientWidth,
        viewportHeight: scroll.clientHeight,
        gutterPx: GUTTER,
        rulerPx: RULER_H,
        rowHeightPx: ROW_H,
      })
    )
  }, [scrollRef, selectedClipId, store, tracks])

  return null
}

function RulerTicks({
  pps,
  durationMs,
  range,
}: {
  pps: number
  durationMs: number
  range: TimelineWindow
}) {
  const labelStep = pps >= 60 ? 1 : pps >= 34 ? 2 : 3
  return (
    <>
      {visibleTickSeconds(range, durationMs, labelStep).map((second) => {
        const left = msToPx(second * 1000, pps)
        return (
          <React.Fragment key={second}>
            <div
              style={{
                position: "absolute",
                bottom: 5,
                left,
                width: 1,
                height: 4,
                background: "var(--line2)",
              }}
            />
            <span
              style={{
                position: "absolute",
                top: 5,
                left: left + 5,
                fontSize: 9.5,
                color: "var(--mut)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {second}s
            </span>
          </React.Fragment>
        )
      })}
    </>
  )
}

function TimelineRow({
  track,
  index,
  range,
  seekDown,
  seekMove,
  seekUp,
  seekCancel,
}: {
  track: EditorTrack
  index: number
  range: TimelineWindow
  seekDown: (event: React.PointerEvent) => void
  seekMove: (event: React.PointerEvent) => void
  seekUp: (event: React.PointerEvent) => void
  seekCancel: (event: React.PointerEvent) => void
}) {
  const { store, dispatch } = useEditorRuntime()
  const kind = trackKind(track)
  const accent = ACCENTS[kind]
  const rowRef = React.useRef<HTMLDivElement>(null)
  const reorder = React.useRef<{ startY: number; rowDelta: number } | null>(null)

  function gripDown(event: React.PointerEvent) {
    if (event.button !== 0) return
    event.stopPropagation()
    reorder.current = { startY: event.clientY, rowDelta: 0 }
    try {
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    } catch {
      /* capture is best effort */
    }
  }
  // Lift the whole lane and let it follow the pointer; the new order is
  // committed on release.
  function gripMove(event: React.PointerEvent) {
    const active = reorder.current
    const row = rowRef.current
    if (!active || !row) return
    const dy = event.clientY - active.startY
    active.rowDelta = clampRowDelta(
      dy,
      index,
      store.getSnapshot().state.tracks.length
    )
    row.style.transform = `translateY(${dy}px)`
    row.style.position = "relative"
    row.style.zIndex = "35"
    row.style.opacity = "0.9"
  }
  function gripUp(event: React.PointerEvent) {
    const active = reorder.current
    reorder.current = null
    const row = rowRef.current
    if (row) {
      row.style.transform = ""
      row.style.position = ""
      row.style.zIndex = ""
      row.style.opacity = ""
    }
    if (!active) return
    try {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(
        event.pointerId
      )
    } catch {
      /* noop */
    }
    if (active.rowDelta !== 0) {
      dispatch({
        type: "MOVE_TRACK",
        trackId: track.id,
        toIndex: index + active.rowDelta,
      })
    }
  }

  return (
    <div ref={rowRef} style={{ display: "flex", height: ROW_H }}>
      <div
        style={{
          width: GUTTER,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "0 6px",
          background: "var(--panel)",
          position: "sticky",
          left: 0,
          zIndex: 2,
        }}
      >
        <span
          onPointerDown={gripDown}
          onPointerMove={gripMove}
          onPointerUp={gripUp}
          title="Drag to reorder track"
          style={{
            ...gutterCell,
            color: "var(--mut)",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <GripVertical size={13} />
        </span>
        <span
          title={trackName(track, index)}
          style={{ ...gutterCell, color: accent }}
        >
          {trackIcon(kind)}
        </span>
        <button
          type="button"
          className="st-hovbg"
          onClick={() =>
            dispatch({ type: "TOGGLE_TRACK_MUTE", trackId: track.id })
          }
          style={gutterIconBtn}
          aria-label={track.muted ? "Unmute this track" : "Mute this track"}
          title={track.muted ? "Unmute this track" : "Mute this track"}
        >
          {track.muted ? (
            <VolumeX size={13} />
          ) : kind === "audio" ? (
            <Volume2 size={13} />
          ) : (
            <Eye size={13} />
          )}
        </button>
        <button
          type="button"
          className="st-hovbg"
          onClick={() => dispatch({ type: "DELETE_TRACK", trackId: track.id })}
          style={gutterIconBtn}
          aria-label="Delete this track"
          title="Delete this track"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div
        data-track-lane
        data-track-id={track.id}
        onPointerDown={seekDown}
        onPointerMove={seekMove}
        onPointerUp={seekUp}
        onPointerCancel={seekCancel}
        onLostPointerCapture={seekCancel}
        style={{ position: "relative", flex: 1, background: "transparent" }}
      >
        {/* Only the clips near the scroll window are drawn. A seam still reads
            the clip before it from the whole lane, which may be off screen. */}
        {visibleClips(track.clips, range).map(({ clip, index: clipIndex }) => {
          const transition = resolveIncomingTransition(
            clip,
            clipIndex > 0 ? track.clips[clipIndex - 1] : null
          )
          return (
            <React.Fragment key={clip.id}>
              <ClipChip clip={clip} trackIndex={index} accent={accent} />
              {transition ? (
                <SeamBadge clip={clip} transition={transition} />
              ) : null}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

const gutterIconBtn: React.CSSProperties = {
  color: "var(--mut)",
  cursor: "pointer",
  padding: 5,
  borderRadius: 6,
  display: "inline-grid",
  placeItems: "center",
  background: "transparent",
  border: "none",
}

// The two icons that are not buttons share the button footprint, so all four
// cells in the gutter keep an even rhythm.
const gutterCell: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  padding: 5,
  flex: "none",
}

// Kept from re-rendering: a scroll that widens the drawn range re-renders every
// lane, and only the chips just entering it have anything new to draw.
const ClipChip = React.memo(function ClipChip({
  clip,
  trackIndex,
  accent,
}: {
  clip: EditorClip
  trackIndex: number
  accent: string
}) {
  const selected = useEditorSelector(
    (state) => state.selectedClipId === clip.id
  )
  const pps = useEditorSelector((state) => state.pxPerSecond)
  const cutMode = useEditorSelector((state) => state.cutMode)
  const { store, dispatch, clock } = useEditorRuntime()
  const snapGuide = React.useContext(SnapGuideContext)
  const ref = React.useRef<HTMLDivElement>(null)

  // Real frames along a video clip, sampled across the part of the file this
  // clip uses. Until they arrive the flat placeholder shows through.
  const [frames, setFrames] = React.useState<FilmstripFrame[]>([])
  React.useEffect(() => {
    if (clip.kind !== "video" || !clip.mediaId) return
    const controller = new AbortController()
    getVideoFilmstrip(
      clip.mediaId,
      { startMs: clip.trimStartMs, durationMs: clip.durationMs },
      controller.signal
    )
      .then((loaded) => {
        if (!controller.signal.aborted) setFrames(loaded)
      })
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [clip.kind, clip.mediaId, clip.trimStartMs, clip.durationMs])

  const drag = React.useRef<null | {
    mode: "move" | "trim-start" | "trim-end"
    startX: number
    startY: number
    moved: boolean
    origin: { startMs: number; durationMs: number; trimStartMs: number }
    // The snap candidates are frozen when the drag starts: the clips they come
    // from cannot move mid-drag, and rebuilding them on every pointer move is
    // the one thing that would make a long timeline stutter.
    snap: SnapIndex
  }>(null)

  // A chip can be dropped mid-drag when the zoom or the lane width changes
  // under the pointer. Its handlers go with it, so nothing would ever take the
  // guide back down — do it here.
  React.useEffect(
    () => () => {
      if (!drag.current) return
      drag.current = null
      snapGuide?.hide()
    },
    [snapGuide]
  )

  const left = msToPx(clip.startMs, pps)
  const width = Math.max(6, msToPx(clip.durationMs, pps))
  const showDuration = width > 76
  const showLabel = width > 34

  // The fill: video and pictures get a tinted block, audio a waveform, text a
  // card with a coloured edge.
  let fill: React.CSSProperties
  let overlay: React.CSSProperties | null = null
  let labelColor: string
  if (clip.kind === "video" || clip.kind === "image") {
    fill = {
      position: "absolute",
      inset: 0,
      background:
        clip.kind === "image" && clip.url
          ? `center/cover no-repeat url("${clip.url}")`
          : `linear-gradient(135deg, color-mix(in oklch, ${accent}, black 34%), color-mix(in oklch, ${accent}, black 12%))`,
    }
    overlay = {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      background:
        "linear-gradient(180deg,rgba(255,255,255,.16),transparent 42%)",
    }
    labelColor = "#fff"
  } else if (clip.kind === "audio") {
    fill = {
      position: "absolute",
      inset: 0,
      background: `color-mix(in oklch, ${accent}, var(--clip-fill-mix) 82%)`,
    }
    overlay = {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      background: waveformDataUrl("#16a34a"),
      backgroundSize: "auto 56%",
      backgroundRepeat: "repeat-x",
      backgroundPosition: "left center",
      opacity: 0.85,
    }
    labelColor = `color-mix(in oklch, ${accent}, var(--clip-label-mix) 42%)`
  } else {
    fill = {
      position: "absolute",
      inset: 0,
      background: `color-mix(in oklch, ${accent}, var(--clip-fill-mix) 80%)`,
    }
    overlay = {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      borderLeft: `3px solid ${accent}`,
      boxShadow: "inset 0 1px 0 var(--clip-bevel)",
    }
    labelColor = `color-mix(in oklch, ${accent}, var(--clip-label-mix) 50%)`
  }

  // The way into a drag, for the body of the clip and for the two trim grips.
  // A plain handler rather than one built during render, so the ref is only
  // ever written inside the event.
  function begin(
    mode: "move" | "trim-start" | "trim-end",
    event: React.PointerEvent
  ) {
    if (event.button !== 0) return
    event.stopPropagation()
    // With the cut tool on, a click on the body splits instead of dragging.
    if (cutMode && mode === "move") {
      const rect = ref.current!.getBoundingClientRect()
      dispatch({
        type: "SPLIT_CLIP",
        clipId: clip.id,
        atMs: clip.startMs + pxToMs(event.clientX - rect.left, pps),
      })
      return
    }
    dispatch({ type: "SELECT_CLIP", clipId: clip.id })
    drag.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      origin: {
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        trimStartMs: clip.trimStartMs,
      },
      snap: buildSnapIndex({
        tracks: store.getSnapshot().state.tracks,
        excludeClipId: clip.id,
        // The start of the project and the playhead are worth landing on too.
        extraMs: [0, clock.getTime()],
      }),
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  // One place turns a pointer position into the edit it means, so the chip
  // being watched and the value saved on release can never disagree. Holding
  // Alt sets the threshold to zero, which makes every candidate miss.
  function resolveDrag(
    active: NonNullable<typeof drag.current>,
    event: React.PointerEvent
  ) {
    const deltaMs = pxToMs(event.clientX - active.startX, pps)
    const thresholdMs = event.altKey ? 0 : snapThresholdMs(pps)

    if (active.mode === "move") {
      const rows = Math.round((event.clientY - active.startY) / ROW_H)
      const toIndex = trackIndex + rows
      const snapped = snapClipMove({
        candidates: candidatesForTrack(active.snap, toIndex),
        startMs: Math.max(0, active.origin.startMs + deltaMs),
        durationMs: active.origin.durationMs,
        thresholdMs,
      })
      return {
        kind: "move" as const,
        rows,
        toIndex,
        startMs: snapped.ms,
        guideMs: snapped.guideMs,
      }
    }

    const candidates = candidatesForTrack(active.snap, trackIndex)
    if (active.mode === "trim-start") {
      const snapped = snapEdge({
        candidates,
        valueMs: active.origin.startMs + deltaMs,
        thresholdMs,
      })
      const startMs = Math.min(
        active.origin.startMs + active.origin.durationMs - MIN_CLIP_MS,
        Math.max(0, snapped.ms)
      )
      const delta = startMs - active.origin.startMs
      return {
        kind: "trim-start" as const,
        startMs,
        durationMs: active.origin.durationMs - delta,
        trimStartMs: Math.max(0, active.origin.trimStartMs + delta),
        // A snap the clamp then overrode is no longer on the line, so the
        // guide has to go with it.
        guideMs: startMs === snapped.ms ? snapped.guideMs : null,
      }
    }

    const snapped = snapEdge({
      candidates,
      valueMs: active.origin.startMs + active.origin.durationMs + deltaMs,
      thresholdMs,
    })
    const wanted = snapped.ms - active.origin.startMs
    const durationMs = Math.max(MIN_CLIP_MS, wanted)
    return {
      kind: "trim-end" as const,
      durationMs,
      guideMs: durationMs === wanted ? snapped.guideMs : null,
    }
  }

  function paintGuide(guideMs: number | null) {
    if (guideMs === null) snapGuide?.hide()
    else snapGuide?.show(GUTTER + msToPx(guideMs, pps))
  }

  function onMove(event: React.PointerEvent) {
    const active = drag.current
    const element = ref.current
    if (!active || !element) return
    if (
      !active.moved &&
      Math.hypot(event.clientX - active.startX, event.clientY - active.startY) <
        4
    ) {
      return
    }
    active.moved = true
    const next = resolveDrag(active, event)
    if (next.kind === "move") {
      element.style.left = `${msToPx(next.startMs, pps)}px`
      element.style.transform = `translateY(${next.rows * ROW_H}px)`
      element.style.zIndex = "6"
    } else if (next.kind === "trim-start") {
      element.style.left = `${msToPx(next.startMs, pps)}px`
      element.style.width = `${Math.max(6, msToPx(next.durationMs, pps))}px`
    } else {
      element.style.width = `${Math.max(6, msToPx(next.durationMs, pps))}px`
    }
    paintGuide(next.guideMs)
  }

  // Put the chip back where the store says it is, and take the guide down. An
  // edit that changes the clip re-renders over these styles; one the store
  // refuses (a move with no room, a trim clamped to the same length) renders
  // nothing at all, and without this the chip would stay where it was dragged.
  function resetDragStyles() {
    const element = ref.current
    if (element) {
      element.style.transform = ""
      element.style.zIndex = ""
      element.style.left = `${left}px`
      element.style.width = `${width}px`
    }
    snapGuide?.hide()
  }

  function onUp(event: React.PointerEvent) {
    const active = drag.current
    drag.current = null
    if (!active) return
    try {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(
        event.pointerId
      )
    } catch {
      /* noop */
    }
    resetDragStyles()
    if (!active.moved) return
    const next = resolveDrag(active, event)
    if (next.kind === "move") {
      const tracks = store.getSnapshot().state.tracks
      const toIndex = Math.min(Math.max(next.toIndex, 0), tracks.length - 1)
      dispatch({
        type: "MOVE_CLIP",
        clipId: clip.id,
        toTrackId: tracks[toIndex].id,
        startMs: next.startMs,
      })
    } else if (next.kind === "trim-start") {
      dispatch({
        type: "UPDATE_CLIP",
        clipId: clip.id,
        patch: {
          startMs: next.startMs,
          durationMs: next.durationMs,
          trimStartMs: next.trimStartMs,
        },
      })
    } else {
      dispatch({
        type: "UPDATE_CLIP",
        clipId: clip.id,
        patch: { durationMs: next.durationMs },
      })
    }
  }

  // A cancelled pointer — a system gesture, the tab losing it — must not leave
  // the chip parked where it was dragged with the guide still lit.
  function onCancel() {
    if (!drag.current) return
    drag.current = null
    resetDragStyles()
  }

  const grip: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 8,
    height: "60%",
    zIndex: 4,
    cursor: "col-resize",
    display: selected ? "grid" : "none",
    placeItems: "center",
  }
  const gripBar: React.CSSProperties = {
    width: 3,
    height: "62%",
    borderRadius: 3,
    background:
      clip.kind === "video" || clip.kind === "image"
        ? "rgba(255,255,255,.85)"
        : "rgba(0,0,0,.28)",
  }

  return (
    <div
      ref={ref}
      data-clip
      onPointerDown={(event) => begin("move", event)}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      style={{
        position: "absolute",
        top: 6,
        bottom: 6,
        left,
        width,
        borderRadius: clip.kind === "text" ? 5 : 8,
        overflow: "hidden",
        cursor: cutMode ? CUT_CURSOR : "grab",
        boxShadow: selected
          ? "0 0 0 2px var(--acc),0 8px 18px -6px color-mix(in oklch,var(--acc),transparent 50%)"
          : "var(--sh-sm)",
        border: selected ? "1px solid transparent" : "1px solid rgba(0,0,0,.1)",
        zIndex: selected ? 4 : 1,
        transition: "box-shadow .12s",
        touchAction: "none",
      }}
    >
      <div style={fill} />
      {clip.kind === "video" && frames.length > 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            pointerEvents: "none",
          }}
        >
          {frames.map((frame) => (
            <div
              key={frame.index}
              style={{
                flex: 1,
                height: "100%",
                ...filmstripFrameStyle(
                  frame,
                  width / frames.length / (ROW_H - 12)
                ),
              }}
            />
          ))}
        </div>
      ) : null}
      {overlay ? <div style={overlay} /> : null}
      {showLabel ? (
        <span
          style={{
            position: "absolute",
            left: clip.kind === "text" ? 10 : 8,
            top: 6,
            right: 8,
            fontSize: 10.5,
            fontWeight: 600,
            color: labelColor,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            zIndex: 3,
            textShadow:
              clip.kind === "video" || clip.kind === "image"
                ? "0 1px 3px rgba(0,0,0,.6)"
                : undefined,
          }}
        >
          {clipLabel(clip)}
        </span>
      ) : null}
      {showDuration ? (
        <span
          style={{
            position: "absolute",
            right: 6,
            bottom: 5,
            fontSize: 8.5,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            padding: "1px 5px",
            borderRadius: 5,
            zIndex: 3,
            background:
              clip.kind === "video" || clip.kind === "image"
                ? "rgba(0,0,0,.4)"
                : "var(--clip-badge-bg)",
            color:
              clip.kind === "video" || clip.kind === "image"
                ? "#fff"
                : labelColor,
          }}
        >
          {(clip.durationMs / 1000).toFixed(1)}s
        </span>
      ) : null}
      <div
        style={{ ...grip, left: 1 }}
        onPointerDown={(event) => begin("trim-start", event)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
      >
        <span style={gripBar} />
      </div>
      <div
        style={{ ...grip, right: 1 }}
        onPointerDown={(event) => begin("trim-end", event)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
      >
        <span style={gripBar} />
      </div>
    </div>
  )
})

// A small diamond straddling the seam between two clips, marking a blend.
// Clicking it selects the incoming clip, so the inspector shows the controls.
// It is drawn in the lane rather than inside the clip, which clips its own
// overflow, so it can sit exactly on the boundary.
function SeamBadge({
  clip,
  transition,
}: {
  clip: EditorClip
  transition: ClipTransition
}) {
  const pps = useEditorSelector((state) => state.pxPerSecond)
  const selected = useEditorSelector(
    (state) => state.selectedClipId === clip.id
  )
  const { dispatch } = useEditorRuntime()
  // While the clip is selected the inspector owns the blend and the clip shows
  // its trim grips — one of which sits on this seam — so the badge steps aside.
  if (selected) return null
  const label =
    TRANSITION_OPTIONS.find((option) => option.id === transition.kind)?.label ??
    "Transition"
  const seconds = (transition.durationMs / 1000).toFixed(1)
  return (
    <button
      type="button"
      title={`${label} · ${seconds}s`}
      aria-label={`${label} transition, ${seconds} seconds`}
      onPointerDown={(event) => {
        event.stopPropagation()
        dispatch({ type: "SELECT_CLIP", clipId: clip.id })
      }}
      style={{
        position: "absolute",
        left: msToPx(clip.startMs, pps),
        top: "50%",
        width: 13,
        height: 13,
        padding: 0,
        border: "1.5px solid var(--panel)",
        borderRadius: 4,
        background: "var(--acc)",
        transform: "translate(-50%,-50%) rotate(45deg)",
        cursor: "pointer",
        zIndex: 5,
        boxShadow: "var(--sh-sm)",
      }}
    />
  )
}

// The playhead and its knob, moved straight from the clock so the timeline
// never re-renders per frame.
function ClockPlayhead({ clock, pps }: { clock: PlaybackClock; pps: number }) {
  const lineRef = React.useRef<HTMLDivElement>(null)
  const knobRef = React.useRef<HTMLDivElement>(null)
  const dragging = React.useRef<{ pointerId: number; lastMs: number } | null>(
    null
  )

  React.useEffect(() => {
    function paint() {
      const x = GUTTER + msToPx(clock.getTime(), pps)
      if (lineRef.current) lineRef.current.style.left = `${x}px`
      if (knobRef.current) knobRef.current.style.left = `${x - 10}px`
    }
    paint()
    return clock.subscribe(paint)
  }, [clock, pps])

  function down(event: React.PointerEvent) {
    if (event.button !== 0) return
    event.stopPropagation()
    const timeMs = clock.getTime()
    dragging.current = { pointerId: event.pointerId, lastMs: timeMs }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    clock.beginScrub(timeMs)
  }
  function timeAtPointer(clientX: number) {
    const inner = knobRef.current?.parentElement
    if (!inner) return clock.getTime()
    const originX = inner.getBoundingClientRect().left + GUTTER
    return Math.max(0, pxToMs(clientX - originX, pps))
  }
  function move(event: React.PointerEvent) {
    const active = dragging.current
    if (!active || active.pointerId !== event.pointerId) return
    active.lastMs = timeAtPointer(event.clientX)
    clock.updateScrub(active.lastMs)
  }
  function up(event: React.PointerEvent) {
    const active = dragging.current
    if (!active || active.pointerId !== event.pointerId) return
    active.lastMs = timeAtPointer(event.clientX)
    dragging.current = null
    clock.endScrub(active.lastMs)
    try {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(
        event.pointerId
      )
    } catch {
      /* noop */
    }
  }
  function cancel(event: React.PointerEvent) {
    const active = dragging.current
    if (!active || active.pointerId !== event.pointerId) return
    dragging.current = null
    clock.endScrub(active.lastMs)
  }

  return (
    <>
      <div
        ref={lineRef}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: GUTTER,
          width: 2,
          background: "var(--coral)",
          zIndex: 8,
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: -2,
            left: -8,
            width: 18,
            height: 20,
            background: "var(--coral)",
            borderRadius: 5,
            clipPath: "polygon(0 0,100% 0,100% 65%,50% 100%,0 65%)",
            boxShadow: "0 2px 5px rgba(0,0,0,.35)",
          }}
        />
      </div>
      <div
        ref={knobRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        title="Drag playhead"
        style={{
          position: "absolute",
          top: -3,
          left: GUTTER - 10,
          width: 22,
          height: 24,
          zIndex: 9,
          cursor: "grab",
          touchAction: "none",
        }}
      />
    </>
  )
}

function TimelineToolbar({ fit }: { fit: () => void }) {
  const pps = useEditorSelector((state) => state.pxPerSecond)
  const canUndo = useEditorSelector((state) => state.past.length > 0)
  const canRedo = useEditorSelector((state) => state.future.length > 0)
  const cutMode = useEditorSelector((state) => state.cutMode)
  const selectedClipId = useEditorSelector((state) => state.selectedClipId)
  const { dispatch } = useEditorRuntime()

  function setZoom(value: number) {
    dispatch({
      type: "SET_ZOOM",
      pxPerSecond: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)),
    })
  }

  return (
    <WorkspacePanelHeader
      icon={<LayersIcon className="size-4" />}
      title="Timeline"
      action={
        <div className="flex items-center gap-1">
          <ToolbarButton
            label="Undo"
            disabled={!canUndo}
            onClick={() => dispatch({ type: "UNDO" })}
          >
            <Undo2 size={16} />
          </ToolbarButton>
          <ToolbarButton
            label="Redo"
            disabled={!canRedo}
            onClick={() => dispatch({ type: "REDO" })}
          >
            <Redo2 size={16} />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-foreground/10" aria-hidden />
          <ToolbarButton
            label="Split with the cut tool"
            pressed={cutMode}
            onClick={() => dispatch({ type: "SET_CUT_MODE", on: !cutMode })}
          >
            <Scissors size={16} />
          </ToolbarButton>
          <ToolbarButton
            label="Delete the selected clip"
            disabled={!selectedClipId}
            onClick={() =>
              selectedClipId &&
              dispatch({ type: "DELETE_CLIP", clipId: selectedClipId })
            }
          >
            <Trash2 size={16} />
          </ToolbarButton>
          <ToolbarButton
            label="Add a track"
            onClick={() => dispatch({ type: "ADD_TRACK" })}
          >
            <Plus size={16} />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-foreground/10" aria-hidden />
          <ToolbarButton label="Zoom out" onClick={() => setZoom(pps - 8)}>
            <Minus size={16} />
          </ToolbarButton>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={1}
            value={Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pps))}
            onChange={(event) => setZoom(Number(event.target.value))}
            aria-label="Zoom"
            style={{
              width: 104,
              margin: "0 4px",
              background: `linear-gradient(90deg,var(--acc) ${zoomPct(pps)}%,var(--line2) ${zoomPct(pps)}%)`,
            }}
          />
          <ToolbarButton label="Zoom in" onClick={() => setZoom(pps + 8)}>
            <Plus size={16} />
          </ToolbarButton>
          <ToolbarButton label="Fit the whole project" onClick={fit}>
            <Maximize2 size={16} />
          </ToolbarButton>
        </div>
      }
    />
  )
}

/**
 * One button on the timeline's toolbar. They are icons only, so the name is
 * what a screen reader reads and what the tooltip says — one prop, so the two
 * cannot drift apart.
 */
function ToolbarButton({
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  pressed?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className="st-hovbg"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...iconBtn,
        background: pressed ? "var(--acc-soft)" : "transparent",
        color: pressed ? "var(--acc)" : "var(--ink2)",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  )
}

function zoomPct(pps: number) {
  return Math.round(
    ((Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pps)) - ZOOM_MIN) /
      (ZOOM_MAX - ZOOM_MIN)) *
      100
  )
}
