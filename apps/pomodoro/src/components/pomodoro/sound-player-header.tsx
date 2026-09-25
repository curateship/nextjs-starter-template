import * as React from "react"
import {
  Loader2Icon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import {
  formatSleepRemaining,
  SLEEP_TIMER_PRESETS,
} from "@/lib/pomodoro/sleep-timer"
import { useSoundPlayer } from "@/lib/pomodoro/use-sound-player"

/**
 * The sound player in the header (a shell header.rightActions item), ported
 * from the old app: play/pause the ambient loop, its name, mute, a volume
 * slider, the sleep timer, and stop. The audio itself lives in the
 * module-level engine, so it keeps playing while pages change; this control
 * draws nothing while no sound is selected.
 */
export default function SoundPlayerHeader() {
  const player = useSoundPlayer()
  const { state } = player
  if (!state.selected && !state.notice) return null
  const playing = state.status === "playing"
  const loading = state.status === "loading"
  const silent = state.muted || state.volume === 0

  return (
    <div className="flex items-center gap-1.5">
      {state.selected ? (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={player.togglePlayback}
            aria-label={playing ? `Pause ${state.label}` : `Play ${state.label}`}
          >
            {loading ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : playing ? (
              <PauseIcon aria-hidden="true" />
            ) : (
              <PlayIcon aria-hidden="true" />
            )}
          </Button>
          <span
            className="max-w-28 truncate text-xs font-semibold"
            title={state.label ?? undefined}
          >
            {state.label}
          </span>
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
          <Slider
            className="w-20"
            min={0}
            max={100}
            step={1}
            value={[state.volume]}
            onValueChange={([volume]) => player.setVolume(volume)}
            aria-label="Sound volume"
          />
          <SleepTimerControl player={player} />
        </>
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={player.clearSound}
        aria-label="Stop sound"
      >
        <XIcon aria-hidden="true" />
      </Button>
      {state.notice ? (
        <small role="status" className="max-w-40 text-[10px] text-muted-foreground">
          {state.notice}
        </small>
      ) : null}
    </div>
  )
}

function SleepTimerControl({
  player,
}: {
  player: ReturnType<typeof useSoundPlayer>
}) {
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
          size="sm"
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
