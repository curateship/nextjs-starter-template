import * as React from "react"
import {
  Eye,
  Film,
  GripVertical,
  Image as ImageIcon,
  Layers,
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
  useEditorDurationMs,
  useEditorRuntime,
  useEditorSelector,
  type EditorClip,
  type EditorTrack,
} from "@/pages/video-editor/editor-store"
import {
  resolveIncomingTransition,
  TRANSITION_OPTIONS,
  type ClipTransition,
} from "@/lib/clip-transitions"
import type { PlaybackClock } from "@/pages/video-editor/playback-clock"
import {
  clampRowDelta,
  CUT_CURSOR,
  MAX_PX_PER_SECOND,
  MIN_CLIP_MS,
  MIN_PX_PER_SECOND,
  msToPx,
  pxToMs,
  waveformDataUrl,
} from "@/pages/video-editor/timeline-utils"
import {
  metricsCovered,
  padWindow,
  scrollToRevealClip,
  visibleClips,
  visibleTickSeconds,
  visibleTimeRange,
  type ScrollMetrics,
  type TimelineWindow,
} from "@/pages/video-editor/timeline-virtualization"
import {
  filmstripFrameStyle,
  getVideoFilmstrip,
  type FilmstripFrame,
} from "@/pages/video-editor/video-thumbnails"

const GUTTER = 120
export const ROW_H = 52
export const RULER_H = 28
export const TOOLBAR_H = 48
// The Studio zoom slider works in a denser sub-range of the store's bounds so
// clips read like the mock; still clamped to the store's hard limits.
const ZOOM_MIN = Math.max(MIN_PX_PER_SECOND, 18)
const ZOOM_MAX = Math.min(MAX_PX_PER_SECOND, 90)

const ACCENTS = {
  video: "var(--acc)",
  text: "var(--warn)",
  audio: "var(--good)",
  image: "var(--violet)",
  mixed: "var(--mut)",
} as const

// A track carries no kind/name of its own — derive both from its clips so the
// gutter can colour-code lanes the way the mock does.
function trackKind(track: EditorTrack): keyof typeof ACCENTS {
  if (!track.clips.length) return "mixed"
  const kinds = new Set(track.clips.map((c) => c.kind))
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

// Kind icon shown in the gutter in place of a text label (the name is a hover
// tooltip). Mixed-content lanes fall back to a layers glyph. Returns the element
// (not the component) so it stays a render helper, colored via currentColor.
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
      return <Layers size={size} />
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
  if (clip.kind === "text") {
    return clip.text || clip.words?.map((w) => w.text).join(" ") || clip.name
  }
  return clip.name
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

export function StudioTimeline() {
  const tracks = useEditorSelector((state) => state.tracks)
  const pps = useEditorSelector((state) => state.pxPerSecond)
  const durationMs = useEditorDurationMs()
  const { dispatch, clock } = useEditorRuntime()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const innerRef = React.useRef<HTMLDivElement>(null)

  // The scrub origin (x of t=0) sits one gutter in from the inner content edge.
  const timeOriginX = React.useCallback(() => {
    const inner = innerRef.current
    return inner ? inner.getBoundingClientRect().left + GUTTER : 0
  }, [])
  const msAtClientX = React.useCallback(
    (clientX: number) =>
      Math.max(0, pxToMs(clientX - timeOriginX(), pps)),
    [pps, timeOriginX]
  )

  // Fit the whole timeline to the visible lane width once on mount (and when the
  // project first loads a duration) — the store default zoom is very sparse.
  const fittedRef = React.useRef(false)
  const fit = React.useCallback(() => {
    const scroll = scrollRef.current
    if (!scroll || durationMs <= 0) return
    const laneW = scroll.clientWidth - GUTTER - 48
    const next = Math.round(
      Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, laneW / (durationMs / 1000)))
    )
    dispatch({ type: "SET_ZOOM", pxPerSecond: next })
  }, [dispatch, durationMs])

  React.useEffect(() => {
    if (fittedRef.current || durationMs <= 0) return
    fittedRef.current = true
    fit()
  }, [durationMs, fit])

  // ---- scrub / seek on the ruler & empty lane areas ----------------------
  const scrub = React.useRef<{ pointerId: number; lastMs: number } | null>(null)
  function seekDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    // A pointer-down that lands on a clip is handled by the clip itself.
    if ((e.target as HTMLElement).closest("[data-clip]")) return
    dispatch({ type: "SELECT_CLIP", clipId: null })
    const timeMs = msAtClientX(e.clientX)
    scrub.current = { pointerId: e.pointerId, lastMs: timeMs }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    clock.beginScrub(timeMs)
  }
  function seekMove(e: React.PointerEvent) {
    const active = scrub.current
    if (!active || active.pointerId !== e.pointerId) return
    active.lastMs = msAtClientX(e.clientX)
    clock.updateScrub(active.lastMs)
  }
  function seekUp(e: React.PointerEvent) {
    const active = scrub.current
    if (!active || active.pointerId !== e.pointerId) return
    active.lastMs = msAtClientX(e.clientX)
    scrub.current = null
    clock.endScrub(active.lastMs)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* capture may already be gone */
    }
  }
  function seekCancel(e: React.PointerEvent) {
    const active = scrub.current
    if (!active || active.pointerId !== e.pointerId) return
    scrub.current = null
    clock.endScrub(active.lastMs)
  }

  const contentWidth = GUTTER + msToPx(Math.max(durationMs, 1000), pps) + 48
  // Only the clips and ticks inside this time range are mounted.
  const range = useTimelineWindow(scrollRef, pps)

  return (
    <section
      data-screen-label="Timeline"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--panel)",
        minHeight: 0,
        position: "relative",
      }}
    >
      <TimelineToolbar fit={fit} />

      <div
        ref={scrollRef}
        style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}
      >
        <div
          ref={innerRef}
          style={{
            position: "relative",
            minWidth: "100%",
            width: contentWidth,
          }}
        >
          {/* ruler */}
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

          <ClockPlayhead clock={clock} pps={pps} />
        </div>
      </div>

      <ClipReveal scrollRef={scrollRef} />
    </section>
  )
}

// Measures the horizontal scroll window and turns it into the time range the
// lanes draw. Scroll and resize are coalesced through requestAnimationFrame,
// and a new measurement is only committed once the viewport reaches the edge of
// what is already drawn, so scrolling inside the overscan costs no re-render.
// What is stored is the scroll offset and width, not the time range: a zoom
// leaves both untouched, so the range recomputes from them in the same render
// rather than a frame later, when a zoom out would already have painted lanes
// too narrow for the new scale.
function useTimelineWindow(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  pps: number
) {
  // The scroll box cannot be measured before the first paint, and it always
  // starts at the left edge — assume a generous viewport so the first frame is
  // never blank, then correct it from the real measurement.
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
        scrollLeft: scroll.scrollLeft,
        viewportPx: scroll.clientWidth,
      }
      if (!force && metricsCovered(metricsRef.current, next)) return
      metricsRef.current = next
      setMetrics(next)
    }
    // Replace the pre-paint guess with the real box straight away.
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

// Adding a clip auto-selects it, so a selected clip that was not in the
// previous snapshot was just inserted — scroll it into view. Virtualization
// means it may not be mounted anywhere, so the offsets are computed from its
// timeline position rather than from an element. Renders nothing: keeping the
// selection subscription out of the timeline body stops a plain click from
// re-rendering every lane. The zoom is read from the store at reveal time
// rather than taken as a prop, so dragging the zoom slider does not re-walk
// every clip in the project on each tick.
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
    // The first pass has no previous snapshot, so nothing counts as new.
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
      {visibleTickSeconds(range, durationMs, labelStep).map((s) => {
        const left = msToPx(s * 1000, pps)
        return (
          <React.Fragment key={s}>
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
              {s}s
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
  seekDown: (e: React.PointerEvent) => void
  seekMove: (e: React.PointerEvent) => void
  seekUp: (e: React.PointerEvent) => void
  seekCancel: (e: React.PointerEvent) => void
}) {
  const { store, dispatch } = useEditorRuntime()
  const kind = trackKind(track)
  const accent = ACCENTS[kind]
  const rowRef = React.useRef<HTMLDivElement>(null)
  const reorder = React.useRef<{ startY: number; rowDelta: number } | null>(null)

  function gripDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    reorder.current = { startY: e.clientY, rowDelta: 0 }
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* capture is best-effort */
    }
  }
  // Lift the whole row and follow the pointer while reordering (matches the
  // original timeline's drag feedback); the new order commits on release.
  function gripMove(e: React.PointerEvent) {
    const r = reorder.current
    const row = rowRef.current
    if (!r || !row) return
    const dy = e.clientY - r.startY
    r.rowDelta = clampRowDelta(
      dy,
      index,
      store.getSnapshot().state.tracks.length
    )
    row.style.transform = `translateY(${dy}px)`
    row.style.position = "relative"
    row.style.zIndex = "35"
    row.style.opacity = "0.9"
  }
  function gripUp(e: React.PointerEvent) {
    const r = reorder.current
    reorder.current = null
    const row = rowRef.current
    if (row) {
      row.style.transform = ""
      row.style.position = ""
      row.style.zIndex = ""
      row.style.opacity = ""
    }
    if (!r) return
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    if (r.rowDelta !== 0) {
      dispatch({
        type: "MOVE_TRACK",
        trackId: track.id,
        toIndex: index + r.rowDelta,
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
        {/* Four equal cells with a uniform gap read as one evenly-spaced row. */}
        {/* Drag handle: grabs the whole row to reorder tracks. */}
        <span
          onPointerDown={gripDown}
          onPointerMove={gripMove}
          onPointerUp={gripUp}
          title="Drag to reorder track"
          style={{ ...gutterCell, color: "var(--mut)", cursor: "grab", touchAction: "none" }}
        >
          <GripVertical size={13} />
        </span>
        {/* Colored kind icon = track identity; the derived name is a tooltip. */}
        <span title={trackName(track, index)} style={{ ...gutterCell, color: accent }}>
          {trackIcon(kind)}
        </span>
        <button
          type="button"
          className="st-hovbg"
          onClick={() => dispatch({ type: "TOGGLE_TRACK_MUTE", trackId: track.id })}
          style={gutterIconBtn}
          title={track.muted ? "Unmute track" : "Mute track"}
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
          title="Delete track"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div
        data-track-lane
        onPointerDown={seekDown}
        onPointerMove={seekMove}
        onPointerUp={seekUp}
        onPointerCancel={seekCancel}
        onLostPointerCapture={seekCancel}
        style={{ position: "relative", flex: 1, background: "transparent" }}
      >
        {/* Only the clips near the scroll window are mounted; the seam
            transition still reads the preceding clip from the full track, which
            may itself be off-screen. */}
        {visibleClips(track.clips, range).map(({ clip, index: i }) => {
          const transition = resolveIncomingTransition(
            clip,
            i > 0 ? track.clips[i - 1] : null
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

// Non-button gutter icons (grip, kind) share the button footprint so all four
// cells line up with an even rhythm.
const gutterCell: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  padding: 5,
  flex: "none",
}

// Memoized: a scroll that widens the rendered range re-renders every lane, and
// only the chips entering the window have anything new to draw.
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
  const { store, dispatch, mode } = useEditorRuntime()
  const ref = React.useRef<HTMLDivElement>(null)

  // Real frame filmstrip for video clips (sampled across this clip's trim
  // window); until it resolves, the dark placeholder fill shows through.
  const [frames, setFrames] = React.useState<FilmstripFrame[]>([])
  React.useEffect(() => {
    if (clip.kind !== "video" || !clip.mediaId) return
    const controller = new AbortController()
    getVideoFilmstrip(clip.mediaId, {
      startMs: clip.trimStartMs,
      durationMs: clip.durationMs,
    }, controller.signal)
      .then((urls) => {
        if (!controller.signal.aborted) setFrames(urls)
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
  }>(null)

  const left = msToPx(clip.startMs, pps)
  const width = Math.max(6, msToPx(clip.durationMs, pps))
  const showDur = width > 76
  const showLabel = width > 34

  // Fill by kind: video/image get a kind-tinted gradient, audio a waveform,
  // text an accent-bordered card.
  let fill: React.CSSProperties
  let overlay: React.CSSProperties | null = null
  let labelColor: string
  if (clip.kind === "video" || clip.kind === "image") {
    // Images tile their own picture; videos get a dark placeholder that the
    // extracted frame filmstrip (a separate layer) covers once it loads.
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
      background: "linear-gradient(180deg,rgba(255,255,255,.16),transparent 42%)",
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

  // Pointer-down entry for the clip body (move/split) and the two trim grips.
  // Kept as a plain handler (not a factory called in render) so the ref writes
  // only happen inside the event, never during render.
  function begin(mode: "move" | "trim-start" | "trim-end", e: React.PointerEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    // Cut tool: a plain click splits instead of dragging.
    if (cutMode && mode === "move") {
      const rect = ref.current!.getBoundingClientRect()
      dispatch({
        type: "SPLIT_CLIP",
        clipId: clip.id,
        atMs: clip.startMs + pxToMs(e.clientX - rect.left, pps),
      })
      return
    }
    dispatch({ type: "SELECT_CLIP", clipId: clip.id })
    drag.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      origin: {
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        trimStartMs: clip.trimStartMs,
      },
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current
    const el = ref.current
    if (!d || !el) return
    const dx = e.clientX - d.startX
    if (!d.moved && Math.hypot(dx, e.clientY - d.startY) < 4) return
    d.moved = true
    const dms = pxToMs(dx, pps)
    if (d.mode === "move") {
      el.style.left = `${msToPx(Math.max(0, d.origin.startMs + dms), pps)}px`
      const rows = Math.round((e.clientY - d.startY) / ROW_H)
      el.style.transform = `translateY(${rows * ROW_H}px)`
      el.style.zIndex = "6"
    } else if (d.mode === "trim-start") {
      const newStart = Math.min(
        d.origin.startMs + d.origin.durationMs - MIN_CLIP_MS,
        Math.max(0, d.origin.startMs + dms)
      )
      const delta = newStart - d.origin.startMs
      el.style.left = `${msToPx(newStart, pps)}px`
      el.style.width = `${Math.max(6, msToPx(d.origin.durationMs - delta, pps))}px`
    } else {
      const newDur = Math.max(MIN_CLIP_MS, d.origin.durationMs + dms)
      el.style.width = `${Math.max(6, msToPx(newDur, pps))}px`
    }
  }

  function onUp(e: React.PointerEvent) {
    const d = drag.current
    drag.current = null
    const el = ref.current
    if (!d || !el) return
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    // Reset the imperative styles the drag wrote. A dispatch that changes the
    // clip re-renders over these; one the store rejects (a move with no room,
    // a trim clamped to the same length) renders nothing at all, and without
    // this the chip would sit at the dragged position for good.
    el.style.transform = ""
    el.style.zIndex = ""
    el.style.left = `${left}px`
    el.style.width = `${width}px`
    if (!d.moved) return
    const dms = pxToMs(e.clientX - d.startX, pps)
    if (d.mode === "move") {
      const tracks = store.getSnapshot().state.tracks
      const rows = Math.round((e.clientY - d.startY) / ROW_H)
      const toIndex = Math.min(
        Math.max(trackIndex + rows, 0),
        tracks.length - 1
      )
      dispatch({
        type: "MOVE_CLIP",
        clipId: clip.id,
        toTrackId: tracks[toIndex].id,
        startMs: Math.max(0, d.origin.startMs + dms),
        // Template slots re-pack back-to-back instead of leaving gaps.
        placement:
          mode !== "regular" && clip.replaceable ? "slot-reflow" : "gap",
      })
    } else if (d.mode === "trim-start") {
      const newStart = Math.min(
        d.origin.startMs + d.origin.durationMs - MIN_CLIP_MS,
        Math.max(0, d.origin.startMs + dms)
      )
      const delta = newStart - d.origin.startMs
      const patch: Partial<EditorClip> = {
        startMs: newStart,
        durationMs: d.origin.durationMs - delta,
        trimStartMs: Math.max(0, d.origin.trimStartMs + delta),
      }
      dispatch({ type: "UPDATE_CLIP", clipId: clip.id, patch })
    } else {
      const newDur = Math.max(MIN_CLIP_MS, d.origin.durationMs + dms)
      dispatch({
        type: "UPDATE_CLIP",
        clipId: clip.id,
        patch: { durationMs: newDur },
      })
    }
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

  const rL = clip.kind === "text" ? 5 : 8
  return (
    <div
      ref={ref}
      data-clip
      onPointerDown={(e) => begin("move", e)}
      onPointerMove={onMove}
      onPointerUp={onUp}
      style={{
        position: "absolute",
        top: 6,
        bottom: 6,
        left,
        width,
        borderRadius: rL,
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
        <div style={{ position: "absolute", inset: 0, display: "flex", pointerEvents: "none" }}>
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
      {showDur ? (
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
        onPointerDown={(e) => begin("trim-start", e)}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <span style={gripBar} />
      </div>
      <div
        style={{ ...grip, right: 1 }}
        onPointerDown={(e) => begin("trim-end", e)}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <span style={gripBar} />
      </div>
    </div>
  )
})

// A small diamond straddling the seam between two clips, marking a transition.
// Clicking it selects the incoming clip so its inspector shows the blend
// controls. Rendered in the lane (not inside the overflow-clipped clip) so it
// can sit on the boundary.
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
  // While selected, the inspector's Transition card is the control surface and
  // the clip shows its trim grips (the left one sits on this seam) — so hide the
  // badge to avoid intercepting the grip.
  if (selected) return null
  const label =
    TRANSITION_OPTIONS.find((option) => option.id === transition.kind)?.label ??
    "Transition"
  return (
    <button
      type="button"
      title={`${label} · ${(transition.durationMs / 1000).toFixed(1)}s`}
      aria-label={`${label} transition, ${(transition.durationMs / 1000).toFixed(1)} seconds`}
      onPointerDown={(e) => {
        e.stopPropagation()
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

// The playhead line + drag knob, positioned imperatively from the clock so the
// timeline never re-renders per frame.
function ClockPlayhead({
  clock,
  pps,
}: {
  clock: PlaybackClock
  pps: number
}) {
  const lineRef = React.useRef<HTMLDivElement>(null)
  const knobRef = React.useRef<HTMLDivElement>(null)
  const dragging = React.useRef<{
    pointerId: number
    lastMs: number
  } | null>(null)

  React.useEffect(() => {
    function paint() {
      const x = GUTTER + msToPx(clock.getTime(), pps)
      if (lineRef.current) lineRef.current.style.left = `${x}px`
      if (knobRef.current) knobRef.current.style.left = `${x - 10}px`
    }
    paint()
    return clock.subscribe(paint)
  }, [clock, pps])

  function down(e: React.PointerEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    const timeMs = clock.getTime()
    dragging.current = { pointerId: e.pointerId, lastMs: timeMs }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    clock.beginScrub(timeMs)
  }
  function timeAtPointer(clientX: number) {
    const inner = knobRef.current?.parentElement
    if (!inner) return clock.getTime()
    const originX = inner.getBoundingClientRect().left + GUTTER
    return Math.max(0, pxToMs(clientX - originX, pps))
  }
  function move(e: React.PointerEvent) {
    const active = dragging.current
    if (!active || active.pointerId !== e.pointerId) return
    active.lastMs = timeAtPointer(e.clientX)
    clock.updateScrub(active.lastMs)
  }
  function up(e: React.PointerEvent) {
    const active = dragging.current
    if (!active || active.pointerId !== e.pointerId) return
    active.lastMs = timeAtPointer(e.clientX)
    dragging.current = null
    clock.endScrub(active.lastMs)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
  }
  function cancel(e: React.PointerEvent) {
    const active = dragging.current
    if (!active || active.pointerId !== e.pointerId) return
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
            content: "''",
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
  const aspect = useEditorSelector((state) => state.aspect)
  const { dispatch } = useEditorRuntime()

  function setZoom(value: number) {
    dispatch({
      type: "SET_ZOOM",
      pxPerSecond: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)),
    })
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        height: TOOLBAR_H,
        flex: "none",
        padding: "0 12px",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <button
        type="button"
        className="st-hovbg"
        onClick={() => dispatch({ type: "UNDO" })}
        disabled={!canUndo}
        style={{ ...iconBtn, opacity: canUndo ? 1 : 0.4 }}
        title="Undo"
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        className="st-hovbg"
        onClick={() => dispatch({ type: "REDO" })}
        disabled={!canRedo}
        style={{ ...iconBtn, opacity: canRedo ? 1 : 0.4 }}
        title="Redo"
      >
        <Redo2 size={16} />
      </button>
      <div style={{ width: 1, height: 20, background: "var(--line)", margin: "0 4px" }} />
      <button
        type="button"
        onClick={() => dispatch({ type: "SET_CUT_MODE", on: !cutMode })}
        style={{
          height: 32,
          minWidth: 32,
          display: "grid",
          placeItems: "center",
          border: "none",
          borderRadius: 9,
          cursor: "pointer",
          background: cutMode ? "var(--acc-soft)" : "transparent",
          color: cutMode ? "var(--acc)" : "var(--ink2)",
        }}
        title="Split (cut tool)"
      >
        <Scissors size={16} />
      </button>
      <button
        type="button"
        className="st-hovbg"
        onClick={() =>
          selectedClipId &&
          dispatch({ type: "DELETE_CLIP", clipId: selectedClipId })
        }
        style={{ ...iconBtn, opacity: selectedClipId ? 1 : 0.4 }}
        title="Delete selected"
      >
        <Trash2 size={16} />
      </button>

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: "flex",
          gap: 3,
          padding: 3,
          background: "var(--elev)",
          borderRadius: 9,
          marginRight: 8,
        }}
      >
        {(["9:16", "1:1", "16:9"] as const).map((a) => {
          const on = aspect === a
          return (
            <button
              key={a}
              type="button"
              onClick={() => dispatch({ type: "SET_ASPECT", aspect: a })}
              style={{
                padding: "6px 10px",
                border: "none",
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                background: on ? "var(--panel)" : "transparent",
                color: on ? "var(--ink)" : "var(--ink2)",
                boxShadow: on ? "var(--sh-sm)" : "none",
              }}
            >
              {a}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        className="st-hovbg"
        onClick={() => setZoom(pps - 8)}
        style={iconBtn}
        title="Zoom out"
      >
        <Minus size={16} />
      </button>
      <input
        type="range"
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={1}
        value={Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pps))}
        onChange={(e) => setZoom(Number(e.target.value))}
        aria-label="Zoom"
        style={{
          width: 104,
          margin: "0 4px",
          background: `linear-gradient(90deg,var(--acc) ${zoomPct(pps)}%,var(--line2) ${zoomPct(pps)}%)`,
        }}
      />
      <button
        type="button"
        className="st-hovbg"
        onClick={() => setZoom(pps + 8)}
        style={iconBtn}
        title="Zoom in"
      >
        <Plus size={16} />
      </button>
      <button type="button" className="st-hovbg" onClick={fit} style={iconBtn} title="Fit">
        <Maximize2 size={16} />
      </button>
    </div>
  )
}

function zoomPct(pps: number) {
  return Math.round(
    ((Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pps)) - ZOOM_MIN) /
      (ZOOM_MAX - ZOOM_MIN)) *
      100
  )
}
