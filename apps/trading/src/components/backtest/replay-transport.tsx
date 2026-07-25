import type * as React from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  REPLAY_SPEED_OPTIONS,
  type ReplaySpeed,
} from "@/lib/backtest/replay"
import {
  ChevronDownIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from "lucide-react"

/**
 * The replay transport bar shared by the finished-run chart and the manual
 * practice session: jump/step/play/speed controls plus a scrubber over the
 * window. With `allowRewind` off (manual sessions), every backwards control
 * disappears and the scrubber refuses to move left — time only goes forward,
 * so the practice score stays honest.
 */
export function ReplayTransport({
  playheadMs,
  playing,
  speed,
  startMs,
  endMs,
  barMs,
  allowRewind = true,
  endLabel = "Live end",
  onScrub,
  onTogglePlay,
  onStep,
  onJumpToStart,
  onJumpToEnd,
  onSpeedChange,
  trailing,
}: {
  /** Current replay position; null = parked at the window's end. */
  playheadMs: number | null
  playing: boolean
  speed: ReplaySpeed
  startMs: number
  endMs: number
  barMs: number
  /** Off for manual sessions: hides jump/step-back and clamps the scrubber. */
  allowRewind?: boolean
  /** Label shown while parked at the end of the window. */
  endLabel?: string
  onScrub: (ms: number) => void
  onTogglePlay: () => void
  onStep: (direction: 1 | -1) => void
  onJumpToStart?: () => void
  onJumpToEnd?: () => void
  onSpeedChange: (speed: ReplaySpeed) => void
  /** Extra controls after the speed dropdown (e.g. pause-on-signal). */
  trailing?: React.ReactNode
}) {
  const cutoff = playheadMs
  const playheadLabel =
    cutoff === null
      ? null
      : new Date(cutoff).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })

  return (
    <div className="flex shrink-0 items-center gap-1 border-t px-2 py-1">
      {allowRewind ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Jump to start"
            onClick={onJumpToStart}
          >
            <ChevronFirstIcon className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Step back one bar"
            onClick={() => onStep(-1)}
          >
            <ChevronLeftIcon className="size-3.5" />
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={playing ? "Pause replay" : "Play replay"}
        onClick={onTogglePlay}
      >
        {playing ? (
          <PauseIcon className="size-3.5" />
        ) : (
          <PlayIcon className="size-3.5" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Step forward one bar"
        disabled={cutoff === null}
        onClick={() => onStep(1)}
      >
        <ChevronRightIcon className="size-3.5" />
      </Button>
      {allowRewind ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Jump to end"
          disabled={cutoff === null}
          onClick={onJumpToEnd}
        >
          <ChevronLastIcon className="size-3.5" />
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="w-10 font-mono text-[10px]"
            aria-label="Replay speed"
          >
            {speed}×
            <ChevronDownIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-16"
          // Keep focus OFF the trigger after closing: with it focused, the
          // next Space press reopens this menu instead of toggling playback.
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {REPLAY_SPEED_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option}
              checked={option === speed}
              onCheckedChange={() => onSpeedChange(option)}
            >
              {option}×
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {trailing}
      <input
        type="range"
        aria-label="Replay position"
        className="min-w-0 flex-1 accent-foreground"
        min={startMs}
        max={endMs}
        step={barMs}
        value={cutoff ?? endMs}
        onChange={(event) => {
          const next = Number(event.target.value)
          // Forward-only sessions ignore any drag to the left of the playhead.
          if (!allowRewind && cutoff !== null && next < cutoff) return
          onScrub(next)
        }}
      />
      <span className="w-28 text-right font-mono text-[10px] text-muted-foreground">
        {playheadLabel ?? endLabel}
      </span>
    </div>
  )
}

// Dev-only: practice sessions hold live engine and playback state that does
// not survive hot swapping coherently — stale module generations show up as
// drawings "skipping". Any edit reaching this module reloads the page.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate()
  })
}
