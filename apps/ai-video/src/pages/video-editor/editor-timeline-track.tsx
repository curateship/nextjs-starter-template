import * as React from "react"
import {
  CopyIcon,
  GripVerticalIcon,
  ReplaceIcon,
  Trash2Icon,
  TypeIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  useEditor,
  type ClipKind,
  type EditorClip,
  type EditorTrack,
} from "@/pages/video-editor/editor-store"
import {
  clampRowDelta,
  CUT_CURSOR,
  MIN_CLIP_MS,
  msToPx,
  pxToMs,
  TRACK_HEIGHT_PX,
} from "@/pages/video-editor/timeline-utils"
import {
  ReplaceMediaDialog,
  type ReplacementMedia,
} from "@/pages/video-editor/replace-media-dialog"
import { getVideoFilmstrip } from "@/pages/video-editor/video-thumbnails"

// Repeating dark "film frames" with thin separators — the placeholder shown
// while a video clip's real frame thumbnail loads (or if extraction fails).
const FILMSTRIP_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(0,0,0,0.35)), repeating-linear-gradient(90deg, #3f3f46 0px, #555a63 22px, #3f3f46 44px, #18181b 44px, #18181b 47px)",
}

// One 64x24 tile of waveform bars, repeated horizontally across audio clips.
const WAVEFORM_BAR_HEIGHTS = [7, 13, 18, 10, 22, 15, 8, 17, 20, 9, 14, 6]
const WAVEFORM_TILE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='24'>${WAVEFORM_BAR_HEIGHTS.map(
  (height, index) =>
    `<rect x='${(index * 64) / WAVEFORM_BAR_HEIGHTS.length + 1}' y='${12 - height / 2}' width='3' height='${height}' rx='1.5' fill='white' fill-opacity='0.55'/>`
).join("")}</svg>`
const WAVEFORM_STYLE: React.CSSProperties = {
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(WAVEFORM_TILE_SVG)}")`,
  backgroundRepeat: "repeat-x",
  backgroundPosition: "left center",
}

// Chip surface per clip kind.
const KIND_CLASSES: Record<ClipKind, string> = {
  text: "bg-blue-600 text-white",
  audio: "bg-orange-500 text-white",
  image: "bg-zinc-700 text-white ring-1 ring-white/10 ring-inset",
  video: "bg-zinc-800 text-white ring-1 ring-white/10 ring-inset",
}

// Tile an image horizontally across the chip at full chip height.
function tileBackground(url: string): React.CSSProperties {
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: "auto 100%",
    backgroundRepeat: "repeat-x",
  }
}

// One timeline lane: sticky controls gutter on the left, draggable clips on
// the track to its right.
export function TimelineTrackRow({
  track,
  trackIndex,
}: {
  track: EditorTrack
  trackIndex: number
}) {
  const { state, dispatch } = useEditor()
  const rowRef = React.useRef<HTMLDivElement>(null)
  // Vertical grip drag for reordering tracks; visuals are applied straight
  // to the row node, the new order is committed on release.
  const gripDrag = React.useRef<{ startY: number; rowDelta: number } | null>(
    null
  )

  function handleGripDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    gripDrag.current = { startY: e.clientY, rowDelta: 0 }
  }

  function resetRowStyles() {
    const row = rowRef.current
    if (!row) return
    row.style.transform = ""
    row.style.position = ""
    row.style.zIndex = ""
    row.style.opacity = ""
  }

  function handleGripMove(e: React.PointerEvent) {
    const drag = gripDrag.current
    const row = rowRef.current
    if (!drag || !row) return
    const dy = e.clientY - drag.startY
    drag.rowDelta = clampRowDelta(dy, trackIndex, state.tracks.length)
    row.style.transform = `translateY(${dy}px)`
    row.style.position = "relative" // static rows ignore z-index
    row.style.zIndex = "35" // dragged row rides above other gutters
    row.style.opacity = "0.9"
  }

  function handleGripUp(e: React.PointerEvent) {
    const drag = gripDrag.current
    gripDrag.current = null
    if (!drag) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    resetRowStyles()
    if (drag.rowDelta !== 0) {
      dispatch({
        type: "MOVE_TRACK",
        trackId: track.id,
        toIndex: trackIndex + drag.rowDelta,
      })
    }
  }

  function handleGripCancel() {
    gripDrag.current = null
    resetRowStyles()
  }

  return (
    <div
      ref={rowRef}
      className="flex border-b border-border/60"
      style={{ height: TRACK_HEIGHT_PX }}
    >
      {/* Gutter stays visible during horizontal scroll */}
      <div className="sticky left-0 z-30 flex w-24 shrink-0 items-center border-r bg-background px-1.5">
        <div
          role="button"
          aria-label="Reorder track"
          className="flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          onPointerDown={handleGripDown}
          onPointerMove={handleGripMove}
          onPointerUp={handleGripUp}
          onPointerCancel={handleGripCancel}
        >
          <GripVerticalIcon
            className="size-4 text-muted-foreground/60"
            aria-hidden="true"
          />
        </div>
        <TrackIconButton
          label={track.muted ? "Unmute track" : "Mute track"}
          onClick={() =>
            dispatch({ type: "TOGGLE_TRACK_MUTE", trackId: track.id })
          }
        >
          {track.muted ? (
            <VolumeXIcon className="text-destructive" />
          ) : (
            <Volume2Icon />
          )}
        </TrackIconButton>
        <TrackIconButton
          label="Delete track"
          onClick={() => dispatch({ type: "DELETE_TRACK", trackId: track.id })}
        >
          <Trash2Icon />
        </TrackIconButton>
      </div>

      {/* data-track-lane lets media-panel drops and lane seeks find tracks */}
      <div
        data-track-lane
        data-track-id={track.id}
        className="relative min-w-0 flex-1"
        style={state.cutMode ? { cursor: CUT_CURSOR } : undefined}
      >
        {track.clips.map((clip) => (
          <TimelineClipChip
            key={clip.id}
            clip={clip}
            track={track}
            trackIndex={trackIndex}
            selected={state.selectedClipId === clip.id}
          />
        ))}
      </div>
    </div>
  )
}

// Small ghost button with a tooltip, used for per-track controls.
function TrackIconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className="text-muted-foreground"
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// Pointer-drag bookkeeping. Visuals are applied straight to the DOM node
// (transform / left / width) so dragging never re-renders React — the final
// position is committed to the store on pointer-up.
type DragState =
  | {
      mode: "move"
      startX: number
      startY: number
      moved: boolean
      dxPx: number
      rowDelta: number
    }
  | {
      mode: "trim-start" | "trim-end"
      startX: number
      prevEndMs: number
      nextStartMs: number
      patch: Partial<EditorClip> | null
    }

function TimelineClipChip({
  clip,
  track,
  trackIndex,
  selected,
}: {
  clip: EditorClip
  track: EditorTrack
  trackIndex: number
  selected: boolean
}) {
  const { state, dispatch, mode } = useEditor()
  const pxPerSecond = state.pxPerSecond
  const chipRef = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<DragState | null>(null)
  // Template-slot replacement picker (only rendered for replaceable clips).
  const [replaceOpen, setReplaceOpen] = React.useState(false)

  const leftPx = msToPx(clip.startMs, pxPerSecond)
  const widthPx = msToPx(clip.durationMs, pxPerSecond)

  // Real frame filmstrip for video clips; until it resolves (or if extraction
  // fails) the CSS filmstrip placeholder shows instead.
  const [frames, setFrames] = React.useState<string[]>([])
  React.useEffect(() => {
    if (clip.kind !== "video" || !clip.mediaId) return
    let active = true
    // Sample only the slice this clip shows — template slots and split clips
    // are short trims of the same source, so the window drives the frames.
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

  // Closest neighbor edges in this track — trims may not cross them.
  function neighborBounds() {
    let prevEndMs = 0
    let nextStartMs = Number.POSITIVE_INFINITY
    for (const other of track.clips) {
      if (other.id === clip.id) continue
      const otherEnd = other.startMs + other.durationMs
      if (otherEnd <= clip.startMs) prevEndMs = Math.max(prevEndMs, otherEnd)
      if (other.startMs >= clip.startMs + clip.durationMs) {
        nextStartMs = Math.min(nextStartMs, other.startMs)
      }
    }
    return { prevEndMs, nextStartMs }
  }

  function startDrag(e: React.PointerEvent, dragState: DragState) {
    if (e.button !== 0) return
    e.stopPropagation() // don't trigger the lane's seek handler

    // Cut tool: clicking anywhere on the clip splits it at the pointer
    // instead of selecting/dragging (DaVinci-style razor).
    if (state.cutMode) {
      const rect = chipRef.current?.getBoundingClientRect()
      if (rect) {
        dispatch({
          type: "SPLIT_CLIP",
          clipId: clip.id,
          atMs: clip.startMs + pxToMs(e.clientX - rect.x, pxPerSecond),
        })
      }
      return
    }

    dispatch({ type: "SELECT_CLIP", clipId: clip.id })
    chipRef.current?.setPointerCapture(e.pointerId)
    drag.current = dragState
  }

  function handleBodyDown(e: React.PointerEvent) {
    startDrag(e, {
      mode: "move",
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      dxPx: 0,
      rowDelta: 0,
    })
  }

  function handleTrimDown(e: React.PointerEvent, mode: "trim-start" | "trim-end") {
    const { prevEndMs, nextStartMs } = neighborBounds()
    startDrag(e, { mode, startX: e.clientX, prevEndMs, nextStartMs, patch: null })
  }

  function handleMove(e: React.PointerEvent) {
    const d = drag.current
    const el = chipRef.current
    if (!d || !el) return

    if (d.mode === "move") {
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (!d.moved && Math.hypot(dx, dy) < 3) return // click tolerance
      d.moved = true
      d.dxPx = dx
      d.rowDelta = clampRowDelta(dy, trackIndex, state.tracks.length)
      el.style.transform = `translate(${dx}px, ${d.rowDelta * TRACK_HEIGHT_PX}px)`
      el.style.zIndex = "35" // dragged clips ride above the track gutters
      el.style.opacity = "0.85"
      return
    }

    const deltaMs = pxToMs(e.clientX - d.startX, pxPerSecond)
    const clipEndMs = clip.startMs + clip.durationMs
    // Only video/audio have source timing; text/images stretch freely.
    const isTimedMedia = clip.kind === "video" || clip.kind === "audio"

    if (d.mode === "trim-start") {
      // Left edge: bounded by the previous clip, the source in-point (media
      // can't expose frames before the file starts) and minimum length.
      const minStart = Math.max(
        d.prevEndMs,
        isTimedMedia ? clip.startMs - clip.trimStartMs : 0,
        0
      )
      const maxStart = clipEndMs - MIN_CLIP_MS
      const newStart = Math.min(Math.max(clip.startMs + deltaMs, minStart), maxStart)
      const newDuration = clipEndMs - newStart
      d.patch = {
        startMs: newStart,
        durationMs: newDuration,
        trimStartMs: isTimedMedia
          ? clip.trimStartMs + (newStart - clip.startMs)
          : 0,
      }
      el.style.left = `${msToPx(newStart, pxPerSecond)}px`
      el.style.width = `${msToPx(newDuration, pxPerSecond)}px`
    } else {
      // Right edge: bounded by the next clip, the source length and minimum.
      const sourceCap =
        isTimedMedia && clip.sourceDurationMs !== undefined
          ? clip.startMs + (clip.sourceDurationMs - clip.trimStartMs)
          : Number.POSITIVE_INFINITY
      const maxEnd = Math.min(d.nextStartMs, sourceCap)
      const newEnd = Math.min(
        Math.max(clipEndMs + deltaMs, clip.startMs + MIN_CLIP_MS),
        maxEnd
      )
      d.patch = { durationMs: newEnd - clip.startMs }
      el.style.width = `${msToPx(newEnd - clip.startMs, pxPerSecond)}px`
    }
  }

  // Restore DOM styles to the pre-drag React values; if a commit changes
  // state, React repaints with the new ones.
  function resetChipStyles() {
    const el = chipRef.current
    if (!el) return
    el.style.transform = ""
    el.style.zIndex = ""
    el.style.opacity = ""
    el.style.left = `${leftPx}px`
    el.style.width = `${widthPx}px`
  }

  function handleUp(e: React.PointerEvent) {
    const d = drag.current
    drag.current = null
    if (!d) return
    chipRef.current?.releasePointerCapture(e.pointerId)
    resetChipStyles()

    if (d.mode === "move") {
      if (!d.moved) return // plain click — selection already happened
      const targetTrack = state.tracks[trackIndex + d.rowDelta]
      dispatch({
        type: "MOVE_CLIP",
        clipId: clip.id,
        toTrackId: targetTrack.id,
        startMs: clip.startMs + pxToMs(d.dxPx, pxPerSecond),
      })
    } else if (d.patch) {
      dispatch({ type: "UPDATE_CLIP", clipId: clip.id, patch: d.patch })
    }
  }

  function handleCancel() {
    drag.current = null
    resetChipStyles()
  }

  // Video clips show a real frame filmstrip (rendered as a child layer); the
  // CSS placeholder is the chip background until the frames resolve. Image
  // clips tile their actual picture.
  const kindStyle: React.CSSProperties | undefined =
    clip.kind === "video"
      ? FILMSTRIP_STYLE
      : clip.kind === "audio"
        ? WAVEFORM_STYLE
        : clip.kind === "image" && clip.url
          ? tileBackground(clip.url)
          : undefined

  // Swap the slot's media in place; the dialog lives outside the chip node so
  // its pointer events never reach the drag handlers.
  function handleReplace(media: ReplacementMedia) {
    dispatch({ type: "REPLACE_CLIP_MEDIA", clipId: clip.id, media })
    setReplaceOpen(false)
  }

  return (
    <>
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={chipRef}
          data-clip
          className={cn(
            "group absolute inset-y-1.5 touch-none overflow-hidden rounded-md select-none",
            KIND_CLASSES[clip.kind],
            !state.cutMode && "cursor-grab active:cursor-grabbing"
          )}
          style={{ left: leftPx, width: widthPx, ...kindStyle }}
          onPointerDown={handleBodyDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleCancel}
          // Right-click selects the clip the menu will act on.
          onContextMenu={() =>
            dispatch({ type: "SELECT_CLIP", clipId: clip.id })
          }
        >
      {/* Video filmstrip: the extracted frames laid out evenly across the
          clip. Each fills its 1/N cell with cover (crop, no distortion). */}
      {clip.kind === "video" && frames.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 flex">
          {frames.map((frame, index) => (
            <div
              key={index}
              className="h-full flex-1 bg-cover bg-center"
              style={{ backgroundImage: `url("${frame}")` }}
            />
          ))}
        </div>
      ) : null}

      {/* Label */}
      {clip.kind === "video" || clip.kind === "image" ? (
        // Template slots get the role badge below; their name is the same role,
        // so skip this generic label to avoid a duplicate ("Solution" twice).
        clip.segmentLabel ? null : (
          <span className="pointer-events-none absolute bottom-1 left-2 max-w-full truncate text-[11px] text-white/85 drop-shadow">
            {clip.name}
          </span>
        )
      ) : (
        <div className="pointer-events-none flex h-full items-center gap-1.5 px-2.5">
          {clip.kind === "text" ? (
            <TypeIcon className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Volume2Icon className="size-4 shrink-0 drop-shadow" aria-hidden="true" />
          )}
          <span
            className={cn(
              "truncate text-xs font-medium",
              clip.kind === "audio" && "rounded bg-black/30 px-1.5 text-[11px]"
            )}
          >
            {clip.kind === "text" ? clip.text : clip.name}
          </span>
        </div>
      )}

      {/* Template slot extras: role label + hover Replace button */}
      {clip.segmentLabel ? (
        <span className="pointer-events-none absolute left-2 top-1 rounded bg-black/50 px-1 text-[10px] font-medium uppercase tracking-wide text-white/90">
          {clip.segmentLabel}
        </span>
      ) : null}
      {mode === "regular" &&
      clip.replaceable &&
      clip.kind !== "text" &&
      !state.cutMode ? (
        <button
          type="button"
          aria-label="Replace media"
          className="absolute left-1/2 top-1/2 z-20 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 shadow-md transition-[opacity,background-color] group-hover:opacity-100 hover:bg-green-500"
          // Don't start a clip drag or lane seek from the button.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setReplaceOpen(true)}
        >
          <ReplaceIcon className="size-4" aria-hidden="true" />
        </button>
      ) : null}

      {/* Trim handles (visible on hover/selection) */}
      {(["trim-start", "trim-end"] as const).map((mode) => (
        <div
          key={mode}
          className={cn(
            "absolute inset-y-0 z-10 flex w-2.5 cursor-ew-resize items-center justify-center",
            mode === "trim-start" ? "left-0" : "right-0"
          )}
          onPointerDown={(e) => handleTrimDown(e, mode)}
        >
          <div
            className={cn(
              "h-5 w-1 rounded-full bg-white/80",
              !selected && "opacity-0 group-hover:opacity-100"
            )}
          />
        </div>
      ))}

      {/* Selection border. Drawn as a top overlay (z-30) so it sits ABOVE the
          filmstrip frames, which would otherwise paint over an inset ring on
          the chip itself. */}
      {selected ? (
        <div className="pointer-events-none absolute inset-0 z-30 rounded-md ring-2 ring-green-500 ring-inset" />
      ) : null}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() =>
            dispatch({ type: "DUPLICATE_CLIP", clipId: clip.id })
          }
        >
          <CopyIcon />
          Duplicate
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onSelect={() => dispatch({ type: "DELETE_CLIP", clipId: clip.id })}
        >
          <Trash2Icon />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
    {clip.replaceable && clip.kind !== "text" ? (
      <ReplaceMediaDialog
        clipKind={clip.kind}
        open={replaceOpen}
        onOpenChange={setReplaceOpen}
        onReplace={handleReplace}
      />
    ) : null}
    </>
  )
}
