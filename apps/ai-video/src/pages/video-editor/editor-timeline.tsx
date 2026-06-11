import * as React from "react"
import {
  ChevronsDownIcon,
  ExpandIcon,
  MonitorIcon,
  PlayIcon,
  Redo2Icon,
  ScissorsIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Undo2Icon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DEMO_DURATION_MS,
  DEMO_TRACKS,
  formatTimecode,
  msToPx,
  TIMELINE_GUTTER_PX,
} from "@/pages/video-editor/demo-timeline"
import { TimelineTrackRow } from "@/pages/video-editor/editor-timeline-track"

// Last whole second shown on the ruler.
const RULER_SECONDS = Math.floor(DEMO_DURATION_MS / 1000)

// Extra lane width past the final clip so it isn't flush with the edge.
const TIMELINE_TAIL_PX = 24

// Bottom strip: transport toolbar over a single scroll container that holds
// the ruler (sticky top), the demo tracks, and the playhead. UI-only — the
// playhead is fixed at 0 and all transport controls are inert.
export function EditorTimeline() {
  // Total scrollable content width: controls gutter + the full demo duration.
  const contentWidth =
    TIMELINE_GUTTER_PX + msToPx(DEMO_DURATION_MS) + TIMELINE_TAIL_PX

  return (
    <div className="flex h-full flex-col bg-background">
      <TimelineToolbar />

      {/* One shared x/y scroll container so ruler and tracks stay aligned */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="relative"
          style={{ width: contentWidth, minWidth: "100%" }}
        >
          {/* Ruler row: sticks to the top during vertical scroll */}
          <div className="sticky top-0 z-30 flex h-7 border-b bg-background">
            {/* Corner spacer above the track gutters */}
            <div className="sticky left-0 z-40 w-24 shrink-0 border-r bg-background" />
            <div className="relative min-w-0 flex-1">
              <RulerTicks />
              {/* Playhead flag at 0s */}
              <div className="absolute bottom-0 left-0 h-3 w-2 -translate-x-1/2 rounded-[3px] bg-red-500" />
            </div>
          </div>

          {DEMO_TRACKS.map((track) => (
            <TimelineTrackRow key={track.id} track={track} />
          ))}

          {/* Playhead line at 0s, dropping through the tracks. Sits under the
              sticky gutter/ruler (z-30) so it gets occluded when scrolled. */}
          <div
            className="pointer-events-none absolute inset-y-0 z-20 w-px bg-red-500"
            style={{ left: TIMELINE_GUTTER_PX }}
          />
        </div>
      </div>
    </div>
  )
}

// Tick marks every second, labels every 5 seconds ("0s" ... "30s").
function RulerTicks() {
  return (
    <>
      {Array.from({ length: RULER_SECONDS + 1 }, (_, second) => {
        const isMajor = second % 5 === 0
        const left = msToPx(second * 1000)
        return (
          <React.Fragment key={second}>
            <div
              className={
                isMajor
                  ? "absolute bottom-0 h-2.5 w-px bg-border"
                  : "absolute bottom-0 h-1.5 w-px bg-border/70"
              }
              style={{ left }}
            />
            {isMajor && (
              <span
                className="absolute top-0.5 text-[10px] text-muted-foreground"
                style={{ left: left + 4 }}
              >
                {second}s
              </span>
            )}
          </React.Fragment>
        )
      })}
    </>
  )
}

// Transport + view controls. Everything is inert except the aspect select and
// zoom slider, which hold cosmetic local state so they feel real.
function TimelineToolbar() {
  const [aspectRatio, setAspectRatio] = React.useState("16:9")

  return (
    <div className="flex h-11 shrink-0 items-center gap-0.5 border-b bg-background px-2">
      <ToolbarIconButton label="Undo">
        <Undo2Icon />
      </ToolbarIconButton>
      <ToolbarIconButton label="Redo">
        <Redo2Icon />
      </ToolbarIconButton>
      <ToolbarIconButton label="Split clip">
        <ScissorsIcon />
      </ToolbarIconButton>

      {/* Centered transport cluster */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs tabular-nums"
            >
              1x
            </Button>
          </TooltipTrigger>
          <TooltipContent>Playback speed</TooltipContent>
        </Tooltip>
        <ToolbarIconButton label="Previous frame">
          <SkipBackIcon />
        </ToolbarIconButton>
        <ToolbarIconButton label="Play">
          <PlayIcon />
        </ToolbarIconButton>
        <ToolbarIconButton label="Next frame">
          <SkipForwardIcon />
        </ToolbarIconButton>
        <span className="pl-2 text-xs tabular-nums whitespace-nowrap text-muted-foreground">
          {formatTimecode(0)} / {formatTimecode(DEMO_DURATION_MS)}
        </span>
      </div>

      {/* View controls: aspect ratio + zoom (cosmetic) */}
      <Select value={aspectRatio} onValueChange={setAspectRatio}>
        {/* Borderless, styled like the ghost toolbar buttons around it */}
        <SelectTrigger
          className="w-auto border-transparent hover:bg-muted dark:bg-transparent dark:hover:bg-muted/50"
          aria-label="Aspect ratio"
        >
          <MonitorIcon className="size-3.5 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="16:9">16:9</SelectItem>
          <SelectItem value="9:16">9:16</SelectItem>
          <SelectItem value="1:1">1:1</SelectItem>
          <SelectItem value="4:3">4:3</SelectItem>
        </SelectContent>
      </Select>
      <ToolbarIconButton label="Zoom out">
        <ZoomOutIcon />
      </ToolbarIconButton>
      <Slider
        defaultValue={[50]}
        max={100}
        step={1}
        className="mx-1 w-24"
        aria-label="Timeline zoom"
      />
      <ToolbarIconButton label="Zoom in">
        <ZoomInIcon />
      </ToolbarIconButton>
      <ToolbarIconButton label="Fit timeline">
        <ExpandIcon />
      </ToolbarIconButton>
      <ToolbarIconButton label="Collapse timeline">
        <ChevronsDownIcon />
      </ToolbarIconButton>
    </div>
  )
}

// Inert ghost icon button with a tooltip, used across the toolbar.
function ToolbarIconButton({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
