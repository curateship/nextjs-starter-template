import * as React from "react"
import { ScissorsIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  MIN_TRIM_MS,
  formatClock,
  type UploadTrim,
} from "@/lib/pomodoro/upload-labels"

/**
 * Two handles on a strip under a preview player, for a sound or a clip. The
 * upload window uses it before a file goes up, and the cog on an upload's card
 * uses it to cut the kept original again. Nothing is cut in the browser: the
 * start and end go to the server and the worker cuts while it re-encodes.
 *
 * `value` is null for the whole file. Moving both handles back to the ends
 * gives null again, so a trim that keeps everything is never sent.
 */
export function TrimStrip({
  src,
  kind,
  value,
  onChange,
  startOpen = false,
  unplayableNote,
  disabled = false,
}: {
  src: string
  kind: "audio" | "video"
  value: UploadTrim | null
  onChange: (trim: UploadTrim | null) => void
  /** Shown at once, rather than behind a Trim button. */
  startOpen?: boolean
  /** What happens when this browser cannot play the file. */
  unplayableNote: string
  /**
   * Locks the handles while the file is going up or a save runs. Radix's
   * slider ignores a disabled fieldset, so it is told directly.
   */
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(startOpen)
  const [duration, setDuration] = React.useState<number | null>(null)
  const [unplayable, setUnplayable] = React.useState(false)
  const player = React.useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const headingId = React.useId()
  const readoutId = React.useId()

  if (!open) {
    return (
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <ScissorsIcon aria-hidden="true" />
          Trim
        </Button>
      </div>
    )
  }

  const trim =
    duration === null
      ? null
      : value
        ? { startMs: value.startMs, endMs: Math.min(value.endMs, duration) }
        : { startMs: 0, endMs: duration }
  const mediaProps = {
    ref: player,
    src,
    controls: true,
    preload: "metadata" as const,
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const seconds = event.currentTarget.duration
      // A stream with no length the browser can read cannot be trimmed.
      if (Number.isFinite(seconds) && seconds > 0)
        setDuration(Math.floor(seconds * 1000))
      else setUnplayable(true)
    },
    onError: () => setUnplayable(true),
    // Playing stops at the end handle, so what you hear is what you keep. Only
    // while playing: dragging the end handle puts the preview on the end on
    // purpose, and sending it back to the start then hid where the end was.
    onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const element = event.currentTarget
      if (!trim || element.paused) return
      if (element.currentTime * 1000 >= trim.endMs) {
        element.pause()
        element.currentTime = trim.startMs / 1000
      }
    },
    // Play from outside the kept part, or from the end handle, starts at the
    // start handle.
    onPlay: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const element = event.currentTarget
      if (!trim) return
      const at = element.currentTime * 1000
      if (at < trim.startMs || at >= trim.endMs - 100)
        element.currentTime = trim.startMs / 1000
    },
  }

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      aria-describedby={readoutId}
      className="grid gap-2"
    >
      <span id={headingId} className="text-sm font-medium">
        Trim
      </span>
      {unplayable ? (
        <p id={readoutId} className="text-sm text-muted-foreground">
          {unplayableNote}
        </p>
      ) : (
        <>
          {kind === "video" ? (
            <video
              {...mediaProps}
              muted
              playsInline
              className="aspect-video max-h-64 w-full rounded-lg bg-muted object-contain"
            />
          ) : (
            <audio {...mediaProps} className="w-full" />
          )}
          {duration !== null && trim ? (
            <>
              <Slider
                min={0}
                max={duration}
                step={100}
                disabled={disabled}
                minStepsBetweenThumbs={Math.ceil(MIN_TRIM_MS / 100)}
                value={[trim.startMs, trim.endMs]}
                onValueChange={([rawStart, rawEnd]) => {
                  // The slider snaps to tenths of a second, so a 12.345 s
                  // file's far right is 12.3 s. Within a step of an end
                  // counts as the end, or the whole file could never be
                  // chosen again.
                  const startMs = rawStart < 100 ? 0 : rawStart
                  const endMs = rawEnd > duration - 100 ? duration : rawEnd
                  // The preview jumps to whichever handle moved.
                  const moved = rawStart !== trim.startMs ? startMs : endMs
                  if (player.current) player.current.currentTime = moved / 1000
                  onChange(
                    startMs <= 0 && endMs >= duration ? null : { startMs, endMs }
                  )
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span id={readoutId} className="tabular-nums">
                  {`Starts ${formatClock(trim.startMs)}, ends ${formatClock(trim.endMs)}. ${formatClock(trim.endMs - trim.startMs)} kept.`}
                </span>
                {value ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange(null)}
                  >
                    Keep the whole file
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
