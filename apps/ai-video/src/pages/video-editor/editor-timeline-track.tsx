import type * as React from "react"
import { GripVerticalIcon, Trash2Icon, TypeIcon, Volume2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  msToPx,
  type TimelineClip,
  type TimelineTrack,
} from "@/pages/video-editor/demo-timeline"

// Repeating dark "film frames" with thin separators — a CSS-only stand-in for
// real video thumbnails (filmstrip extraction is future functionality).
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

// One timeline lane: sticky controls gutter on the left, clips positioned
// absolutely on the track to its right. Controls are inert in the UI-only build.
export function TimelineTrackRow({ track }: { track: TimelineTrack }) {
  return (
    <div className="flex h-12 border-b border-border/60">
      {/* Gutter stays visible during horizontal scroll (z above the playhead line) */}
      <div className="sticky left-0 z-30 flex w-24 shrink-0 items-center border-r bg-background px-1.5">
        <GripVerticalIcon
          className="size-3.5 shrink-0 text-muted-foreground/60"
          aria-hidden="true"
        />
        <TrackIconButton label="Mute track">
          <Volume2Icon />
        </TrackIconButton>
        <TrackIconButton label="Delete track">
          <Trash2Icon />
        </TrackIconButton>
      </div>
      <div className="relative min-w-0 flex-1">
        {track.clips.map((clip) => (
          <TimelineClipChip key={clip.id} clip={clip} />
        ))}
      </div>
    </div>
  )
}

// Small inert ghost button with a tooltip, used for per-track controls.
function TrackIconButton({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          className="text-muted-foreground"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// A single clip chip, positioned by its start/duration at the fixed px-per-second scale.
function TimelineClipChip({ clip }: { clip: TimelineClip }) {
  const position: React.CSSProperties = {
    left: msToPx(clip.startMs),
    width: msToPx(clip.durationMs),
  }

  if (clip.kind === "text") {
    return (
      <div
        className="absolute inset-y-1.5 flex items-center gap-1 overflow-hidden rounded-md bg-blue-600 px-2 text-white"
        style={position}
      >
        <TypeIcon className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate text-[11px] font-medium">{clip.label}</span>
      </div>
    )
  }

  if (clip.kind === "audio") {
    return (
      <div
        className="absolute inset-y-1.5 flex items-center gap-1 overflow-hidden rounded-md bg-orange-500 px-2 text-white"
        style={{ ...position, ...WAVEFORM_STYLE }}
      >
        <Volume2Icon className="size-3 shrink-0 drop-shadow" aria-hidden="true" />
        <span className="truncate rounded bg-black/30 px-1 text-[10px] font-medium">
          {clip.label}
        </span>
      </div>
    )
  }

  // Video clip: filmstrip background + filename pinned bottom-left.
  return (
    <div
      className="absolute inset-y-1.5 overflow-hidden rounded-md bg-zinc-800 ring-1 ring-white/10 ring-inset"
      style={{ ...position, ...FILMSTRIP_STYLE }}
    >
      <span className="absolute bottom-0.5 left-1.5 max-w-full truncate text-[10px] text-white/80">
        {clip.label}
      </span>
    </div>
  )
}
