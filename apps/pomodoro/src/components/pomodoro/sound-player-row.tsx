import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  Loader2Icon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  SkipForwardIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import {
  formatSleepRemaining,
  SLEEP_TIMER_PRESETS,
} from "@/lib/pomodoro/sleep-timer"
import { useSoundPlayer } from "@/lib/pomodoro/use-sound-player"
import {
  playNextFromPools,
  useRoomMedia,
} from "@/lib/pomodoro/room-media-store"

type Player = ReturnType<typeof useSoundPlayer>

/**
 * The sound player, under the clock it follows: the timer's ring on the front
 * page and the room's ring in a room. Tyler, 9 Oct 2026: "remove this from
 * navigation and move it somewhere around the timer". It holds play/pause,
 * the sound's name, next, mute, volume and the sleep timer. The
 * audio itself lives in the module-level engine, so it keeps playing while
 * pages change. With no sound chosen it says so and links to Sounds, so it
 * never just disappears (Tyler, 9 Oct 2026: "dont see it").
 *
 * The sound follows the clock (`runningEdge` in `sound-engine.ts`): a focus
 * starting plays it, a pause or a break fades it out. Play and Pause here only
 * turn the sound on or off for the focus that is running, and never touch the
 * timer.
 */
export function SoundPlayerRow({ className }: { className?: string }) {
  const player = useSoundPlayer()
  const { state } = player
  // "No sound" is read from the room media store, which has the loader's
  // answer on the server and in the first frame, so somebody with a sound
  // never sees it flash before the engine catches up.
  const { sound, room } = useRoomMedia()
  // In somebody else's room the host picks the sound, so there is nothing
  // for a member to pick from here.
  const canPick = !room || room.role === "host"
  return (
    <div
      role="group"
      aria-label="Sound"
      // Wraps rather than squeezes: on a phone the volume slider and the
      // sleep timer drop to a second line.
      className={cn("flex flex-wrap items-center justify-center gap-x-[5px] gap-y-1.5 [&_svg:not([class*=size-])]:size-3.5", className)}
    >
      {/* Tyler's design of 9 Oct 2026 ("redesign the sound bar"): play in a
          round tinted button, the name, next, the speaker and a grey volume
          slider, then the sleep timer. The hairlines between them went the
          same day ("remove the divider").
          Turn-off went the same day ("remove the turn sound off icon"), and
          the whole bar shrank by a tenth ("trt 10% instead", after asking
          for 20% smaller). */}
      {state.selected ? (
        <>
          <PlayPauseButton player={player} />
          <SoundName player={player} />
          <NextButton />
          {/* The speaker and its slider wrap as one, never apart. */}
          <span className="flex items-center gap-[5px]">
            <MuteButton player={player} />
            <VolumeSlider player={player} className="w-18" />
          </span>
          <SleepTimerControl player={player} />
        </>
      ) : sound ? null : (
        <span className="text-[13.5px] text-muted-foreground">
          No sound
          {canPick ? (
            <>
              {" · "}
              <Link to="/sounds" className="font-semibold text-foreground underline underline-offset-2">
                Pick one
              </Link>
            </>
          ) : null}
        </span>
      )}
      <PlayerNotice player={player} />
    </div>
  )
}

/** Playing, paused, or still loading, as one icon. */
function PlayerStatusIcon({
  player,
  className,
}: {
  player: Player
  className?: string
}) {
  const { status } = player.state
  // Tyler, 9 Oct 2026: "just remove the delay but keep the fade". Play turns
  // into Pause the moment it is pressed, while the file arrives and fades in.
  // The spinner is only for a file that takes over a second to arrive.
  const slow = useSlowLoading(status === "loading")
  if (slow)
    return <Loader2Icon className={cn("animate-spin", className)} aria-hidden="true" />
  if (status === "playing" || status === "loading")
    return <PauseIcon className={cn("fill-current", className)} aria-hidden="true" />
  return <PlayIcon className={cn("fill-current", className)} aria-hidden="true" />
}

/** True once loading has gone on for a second. */
function useSlowLoading(loading: boolean) {
  const [slow, setSlow] = React.useState(false)
  React.useEffect(() => {
    if (!loading) return
    const timer = window.setTimeout(() => setSlow(true), 1000)
    return () => {
      window.clearTimeout(timer)
      setSlow(false)
    }
  }, [loading])
  return loading && slow
}

function PlayPauseButton({ player }: { player: Player }) {
  const { state } = player
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="mr-1 rounded-full bg-[rgba(var(--p-fg-rgb),0.1)] hover:bg-[rgba(var(--p-fg-rgb),0.18)]"
      onClick={player.togglePlayback}
      aria-label={
        state.status === "playing" || state.status === "loading"
          ? `Pause ${state.label}`
          : `Play ${state.label}`
      }
    >
      <PlayerStatusIcon player={player} />
    </Button>
  )
}

/**
 * The next sound from a shuffle or tags choice, and the next theme with it
 * when the theme is a group too. Only drawn while the sound is a group.
 */
function NextButton() {
  const { soundPool } = useRoomMedia()
  if (!soundPool) return null
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      // Grey beside the white name and play, from Tyler's design.
      className="text-[rgba(var(--p-fg-rgb),0.7)]"
      onClick={playNextFromPools}
      aria-label="Next sound"
    >
      <SkipForwardIcon className="fill-current" aria-hidden="true" />
    </Button>
  )
}

function SoundName({ player }: { player: Player }) {
  return (
    <span
      // Never squeezed to nothing; the row wraps instead. Over 160px it ends
      // in an ellipsis.
      className="max-w-56 shrink-0 truncate text-[13.5px] font-semibold max-sm:max-w-28"
      title={player.state.label ?? undefined}
    >
      {player.state.label}
    </span>
  )
}

function MuteButton({ player }: { player: Player }) {
  const { state } = player
  const silent = state.muted || state.volume === 0
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      // Grey beside the white name and play, from Tyler's design.
      className="text-[rgba(var(--p-fg-rgb),0.7)]"
      onClick={player.toggleMuted}
      aria-pressed={state.muted}
      aria-label={state.muted ? "Unmute sound" : "Mute sound"}
    >
      {silent ? (
        <VolumeXIcon aria-hidden="true" />
      ) : (
        <Volume2Icon aria-hidden="true" />
      )}
    </Button>
  )
}

/** The volume, also drawn from the header's music bars, so both move one value. */
export function VolumeSlider({
  player,
  className,
}: {
  player: Player
  className?: string
}) {
  return (
    <Slider
      // A grey track and knob rather than the shared slider's black and
      // white, from Tyler's design.
      className={cn(
        "[&_[data-slot=slider-track]]:h-[7px] [&_[data-slot=slider-track]]:bg-[rgba(var(--p-fg-rgb),0.14)]",
        "[&_[data-slot=slider-range]]:bg-[rgba(var(--p-fg-rgb),0.45)]",
        "[&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:bg-neutral-400",
        className
      )}
      min={0}
      max={100}
      step={1}
      value={[player.state.volume]}
      onValueChange={([volume]) => player.setVolume(volume)}
      aria-label="Sound volume"
    />
  )
}

function PlayerNotice({ player }: { player: Player }) {
  if (!player.state.notice) return null
  return (
    <small role="status" className="max-w-40 text-[10px] text-muted-foreground">
      {player.state.notice}
    </small>
  )
}

function SleepTimerControl({ player }: { player: Player }) {
  const [open, setOpen] = React.useState(false)
  const sleepTimer = player.state.sleepTimer
  const remaining = sleepTimer
    ? formatSleepRemaining(sleepTimer.remainingMs)
    : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={sleepTimer ? "outline" : "ghost"}
          // A circle like its neighbours until a timer runs, when it widens
          // to hold the time left.
          size={remaining ? "sm" : "icon-sm"}
          aria-label={
            remaining ? `Sleep timer, ${remaining} remaining` : "Set a sleep timer"
          }
        >
          <MoonIcon aria-hidden="true" />
          {remaining ? (
            <span className="font-mono text-[10px]">{remaining}</span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56">
        <div className="flex flex-col gap-2">
          <strong className="text-sm">Sleep timer</strong>
          <p className="text-xs text-muted-foreground">
            Let the sound fade out on its own. The focus timer keeps running.
          </p>
          {sleepTimer ? (
            <div className="flex flex-col items-start gap-2">
              <span className="font-mono text-lg">{remaining}</span>
              <small className="text-xs text-muted-foreground">
                until the sound fades out
              </small>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  player.cancelSleepTimer()
                  setOpen(false)
                }}
              >
                Cancel timer
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              {SLEEP_TIMER_PRESETS.map((minutes) => (
                <Button
                  key={minutes}
                  variant="outline"
                  size="sm"
                  onClick={() => player.startSleepTimer(minutes)}
                >
                  {minutes} min
                </Button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
