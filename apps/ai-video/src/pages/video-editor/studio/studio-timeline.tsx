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
  useEditor,
  type EditorClip,
  type EditorTrack,
} from "@/pages/video-editor/editor-store"
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
import { getVideoFilmstrip } from "@/pages/video-editor/video-thumbnails"

const GUTTER = 120
const ROW_H = 52
const RULER_H = 28
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
  const { state, dispatch, clock, durationMs } = useEditor()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const innerRef = React.useRef<HTMLDivElement>(null)
  const pps = state.pxPerSecond

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
  const scrubbing = React.useRef(false)
  function seekDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    // A pointer-down that lands on a clip is handled by the clip itself.
    if ((e.target as HTMLElement).closest("[data-clip]")) return
    dispatch({ type: "SELECT_CLIP", clipId: null })
    scrubbing.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    clock.seek(msAtClientX(e.clientX))
  }
  function seekMove(e: React.PointerEvent) {
    if (scrubbing.current) clock.seek(msAtClientX(e.clientX))
  }
  function seekUp(e: React.PointerEvent) {
    scrubbing.current = false
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* capture may already be gone */
    }
  }

  const contentWidth = GUTTER + msToPx(Math.max(durationMs, 1000), pps) + 48

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
              style={{ position: "relative", flex: 1, cursor: "pointer" }}
            >
              <RulerTicks pps={pps} durationMs={durationMs} />
            </div>
          </div>

          {state.tracks.map((track, index) => (
            <TimelineRow
              key={track.id}
              track={track}
              index={index}
              seekDown={seekDown}
              seekMove={seekMove}
              seekUp={seekUp}
            />
          ))}

          <ClockPlayhead clock={clock} pps={pps} />
        </div>
      </div>
    </section>
  )
}

function RulerTicks({ pps, durationMs }: { pps: number; durationMs: number }) {
  const labelStep = pps >= 60 ? 1 : pps >= 34 ? 2 : 3
  const seconds = Math.ceil(Math.max(durationMs, 1000) / 1000)
  const ticks: React.ReactNode[] = []
  for (let s = 0; s <= seconds; s++) {
    if (s % labelStep !== 0) continue
    const left = msToPx(s * 1000, pps)
    ticks.push(
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
  }
  return <>{ticks}</>
}

function TimelineRow({
  track,
  index,
  seekDown,
  seekMove,
  seekUp,
}: {
  track: EditorTrack
  index: number
  seekDown: (e: React.PointerEvent) => void
  seekMove: (e: React.PointerEvent) => void
  seekUp: (e: React.PointerEvent) => void
}) {
  const { state, dispatch } = useEditor()
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
    r.rowDelta = clampRowDelta(dy, index, state.tracks.length)
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
        style={{ position: "relative", flex: 1, background: "transparent" }}
      >
        {track.clips.map((clip) => (
          <ClipChip
            key={clip.id}
            clip={clip}
            trackIndex={index}
            accent={accent}
          />
        ))}
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

function ClipChip({
  clip,
  trackIndex,
  accent,
}: {
  clip: EditorClip
  trackIndex: number
  accent: string
}) {
  const { state, dispatch, mode } = useEditor()
  const selected = state.selectedClipId === clip.id
  const pps = state.pxPerSecond
  const ref = React.useRef<HTMLDivElement>(null)

  // Real frame filmstrip for video clips (sampled across this clip's trim
  // window); until it resolves, the dark placeholder fill shows through.
  const [frames, setFrames] = React.useState<string[]>([])
  React.useEffect(() => {
    if (clip.kind !== "video" || !clip.mediaId) return
    let active = true
    getVideoFilmstrip(clip.mediaId, {
      startMs: clip.trimStartMs,
      durationMs: clip.durationMs,
    })
      .then((urls) => {
        if (active) setFrames(urls)
      })
      .catch(() => undefined)
    return () => {
      active = false
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
    if (state.cutMode && mode === "move") {
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
    // reset imperative styles; the store re-render positions the clip.
    el.style.transform = ""
    el.style.zIndex = ""
    if (!d.moved) return
    const dms = pxToMs(e.clientX - d.startX, pps)
    if (d.mode === "move") {
      const rows = Math.round((e.clientY - d.startY) / ROW_H)
      const toIndex = Math.min(
        Math.max(trackIndex + rows, 0),
        state.tracks.length - 1
      )
      dispatch({
        type: "MOVE_CLIP",
        clipId: clip.id,
        toTrackId: state.tracks[toIndex].id,
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
        cursor: state.cutMode ? CUT_CURSOR : "grab",
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
          {frames.map((frame, index) => (
            <div
              key={index}
              style={{
                flex: 1,
                height: "100%",
                background: `center/cover no-repeat url("${frame}")`,
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
}

// The playhead line + drag knob, positioned imperatively from the clock so the
// timeline never re-renders per frame.
function ClockPlayhead({
  clock,
  pps,
}: {
  clock: ReturnType<typeof useEditor>["clock"]
  pps: number
}) {
  const lineRef = React.useRef<HTMLDivElement>(null)
  const knobRef = React.useRef<HTMLDivElement>(null)
  const dragging = React.useRef(false)

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
    dragging.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function move(e: React.PointerEvent) {
    if (!dragging.current) return
    const inner = knobRef.current?.parentElement
    if (!inner) return
    const originX = inner.getBoundingClientRect().left + GUTTER
    clock.seek(Math.max(0, pxToMs(e.clientX - originX, pps)))
  }
  function up(e: React.PointerEvent) {
    dragging.current = false
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
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
  const { state, dispatch } = useEditor()
  const pps = state.pxPerSecond

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
        height: 48,
        flex: "none",
        padding: "0 12px",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <button
        type="button"
        className="st-hovbg"
        onClick={() => dispatch({ type: "UNDO" })}
        disabled={state.past.length === 0}
        style={{ ...iconBtn, opacity: state.past.length === 0 ? 0.4 : 1 }}
        title="Undo"
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        className="st-hovbg"
        onClick={() => dispatch({ type: "REDO" })}
        disabled={state.future.length === 0}
        style={{ ...iconBtn, opacity: state.future.length === 0 ? 0.4 : 1 }}
        title="Redo"
      >
        <Redo2 size={16} />
      </button>
      <div style={{ width: 1, height: 20, background: "var(--line)", margin: "0 4px" }} />
      <button
        type="button"
        onClick={() => dispatch({ type: "SET_CUT_MODE", on: !state.cutMode })}
        style={{
          height: 32,
          minWidth: 32,
          display: "grid",
          placeItems: "center",
          border: "none",
          borderRadius: 9,
          cursor: "pointer",
          background: state.cutMode ? "var(--acc-soft)" : "transparent",
          color: state.cutMode ? "var(--acc)" : "var(--ink2)",
        }}
        title="Split (cut tool)"
      >
        <Scissors size={16} />
      </button>
      <button
        type="button"
        className="st-hovbg"
        onClick={() =>
          state.selectedClipId &&
          dispatch({ type: "DELETE_CLIP", clipId: state.selectedClipId })
        }
        style={{ ...iconBtn, opacity: state.selectedClipId ? 1 : 0.4 }}
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
          const on = state.aspect === a
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
