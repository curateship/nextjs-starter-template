import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  Loader2Icon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  PowerIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  quickPillClass,
  quickPillSurfaceClass,
} from "@/components/pomodoro/quick-controls-header"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { useNarrowScreen } from "@/lib/pomodoro/narrow-screen"
import {
  formatSleepRemaining,
  SLEEP_TIMER_PRESETS,
} from "@/lib/pomodoro/sleep-timer"
import { useSoundPlayer } from "@/lib/pomodoro/use-sound-player"

type Player = ReturnType<typeof useSoundPlayer>

/**
 * The sound player in the header, ported from the old app: play/pause the
 * ambient loop, its name, mute, a volume slider, the sleep timer, and stop.
 * The audio itself lives in the module-level engine, so it keeps playing while
 * pages change; this control draws nothing while no sound is selected.
 *
 * It sits in the header's right-hand group, on the same glassy pill as the
 * quick buttons. Tyler, 7 Oct 2026: "Move the audio player to the right. Make
 * sure the audio player uses the same ui styling as the button." The pill is
 * the 36px of a quick button, holding 28px controls.
 */
export default function SoundPlayerHeader() {
  const player = useSoundPlayer()
  const narrow = useNarrowScreen()
  const { state } = player
  if (!state.selected && !state.notice) return null

  // Six controls and a name do not fit beside the quick pills on a phone, so
  // narrow they fold behind one pill and the popover holds the same six. With
  // no sound chosen there is only Stop and a notice, which fits at any width.
  if (narrow && state.selected) return <CollapsedPlayer player={player} />

  return (
    <div
      // The quick buttons' round pill and border, with a lighter fill and
      // blur so more of the background shows through. Tyler, 7 Oct 2026:
      // "make the audio player more transparent".
      className={cn(
        "flex h-9 items-center gap-1 px-1 text-foreground",
        quickPillSurfaceClass,
        "bg-[rgba(var(--p-fg-rgb),0.03)] backdrop-blur-[4px]"
      )}
    >
      {state.selected ? (
        <>
          <PlayPauseButton player={player} />
          <SoundName player={player} />
          <MuteButton player={player} />
          <VolumeSlider player={player} className="w-20" />
          <SleepTimerControl player={player} />
        </>
      ) : null}
      <StopButton player={player} />
      <PlayerNotice player={player} />
    </div>
  )
}

/**
 * The whole player behind one pill, for a window too narrow to hold it.
 *
 * The pill shows whether the sound is playing, because that is the one thing
 * you look at the header to find out, and it names the sound out loud so the
 * button is not just an icon. The controls inside are the same components the
 * wide row uses, stacked rather than in a line.
 */
function CollapsedPlayer({ player }: { player: Player }) {
  const { state } = player

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={quickPillClass}
          aria-label={`Sound ${statusWord(state.status)}: ${state.label}`}
        >
          <PlayerStatusIcon player={player} className="size-[18px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-3 p-4">
        <div className="flex items-center gap-1.5">
          <PlayPauseButton player={player} />
          <SoundName player={player} />
          <StopButton player={player} />
        </div>
        <div className="flex items-center gap-1.5">
          <MuteButton player={player} />
          <VolumeSlider player={player} className="flex-1" />
        </div>
        <SleepTimerControl player={player} />
        <PlayerNotice player={player} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The three states in a word, for the pill's name. It reads the same `status`
 * the icon beside it reads, so the word and the picture cannot disagree — the
 * pill said "paused" while the loop was still loading before this.
 */
function statusWord(status: Player["state"]["status"]) {
  if (status === "loading") return "starting"
  if (status === "playing") return "playing"
  return "paused"
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
  if (status === "loading")
    return <Loader2Icon className={cn("animate-spin", className)} aria-hidden="true" />
  if (status === "playing")
    return <PauseIcon className={className} aria-hidden="true" />
  return <PlayIcon className={className} aria-hidden="true" />
}

function PlayPauseButton({ player }: { player: Player }) {
  const { state } = player
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={player.togglePlayback}
      aria-label={
        state.status === "playing" ? `Pause ${state.label}` : `Play ${state.label}`
      }
    >
      <PlayerStatusIcon player={player} />
    </Button>
  )
}

function SoundName({ player }: { player: Player }) {
  return (
    <span
      // Never squeezed to nothing when the header is tight; the header wraps
      // instead. Over 128px it ends in an ellipsis.
      className="max-w-32 shrink-0 truncate text-[15px] font-semibold"
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

function VolumeSlider({
  player,
  className,
}: {
  player: Player
  className?: string
}) {
  return (
    <Slider
      className={className}
      min={0}
      max={100}
      step={1}
      value={[player.state.volume]}
      onValueChange={([volume]) => player.setVolume(volume)}
      aria-label="Sound volume"
    />
  )
}

/**
 * Turns the sound off for good: the choice is forgotten and the player goes.
 * It used to be an X labelled "Stop sound", which read as a pause, so the
 * toast after it says where to pick a sound again.
 */
function StopButton({ player }: { player: Player }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => {
        player.clearSound()
        toast.success(
          <span>
            Sound off. Pick one again on{" "}
            <Link to="/sounds" className="underline underline-offset-2">
              Sounds
            </Link>
            .
          </span>
        )
      }}
      aria-label="Turn sound off"
      title="Turn sound off"
    >
      <PowerIcon aria-hidden="true" />
    </Button>
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
      <PopoverContent align="end" className="w-56">
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
