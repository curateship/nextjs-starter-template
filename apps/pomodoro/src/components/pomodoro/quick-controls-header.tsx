import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  BarChart3Icon,
  CheckIcon,
  Clock3Icon,
  MinusIcon,
  PaletteIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { listTimerPresets } from "@/lib/api/pomodoro/timer-presets"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import {
  GUEST_PRESETS_KEY,
  readGuestJson,
} from "@/lib/pomodoro/guest-storage"
import { normalizeCustomTimerPresets } from "@/lib/pomodoro/timer-presets"
import {
  curatedBackgrounds,
} from "@/lib/pomodoro/background-catalog"
import { useBackgroundSelection } from "@/lib/pomodoro/background-store"
import {
  curatedSounds,
  sameSoundReference,
} from "@/lib/pomodoro/sound-catalog"
import {
  builtinTimerPresets,
  matchTimerPreset,
  presetSummary,
  type CustomTimerPreset,
} from "@/lib/pomodoro/timer-presets"
import type { TimerMode } from "@/lib/pomodoro/timer"
import { usePomodoro } from "@/lib/pomodoro/use-pomodoro"
import { useSoundPlayer } from "@/lib/pomodoro/use-sound-player"

const modeLabels: Array<[TimerMode, string]> = [
  ["focus", "Focus"],
  ["short", "Short break"],
  ["long", "Long break"],
]

/**
 * The header's quick controls (a shell header.rightActions item): a Timer
 * popover — start/pause and reset, minute steppers, auto-start, the preset
 * list — and a Theme popover with the free sounds, three backgrounds and
 * links to the full pages. The timer lives in the module engine, so these
 * controls work identically on every page.
 */
/** The old app's glassy header pill. */
export const quickPillClass =
  "flex h-[42px] items-center gap-2 whitespace-nowrap rounded-full border border-[rgba(var(--p-fg-rgb),0.14)] bg-[rgba(var(--p-fg-rgb),0.07)] py-0 pl-3.5 pr-[18px] text-[13.5px] font-semibold text-foreground backdrop-blur-[12px] hover:bg-[rgba(var(--p-fg-rgb),0.16)]"

export default function QuickControlsHeader() {
  return (
    <div className="flex items-center gap-2.5">
      <TimerQuickControl />
      <Link to="/leaderboard" className={quickPillClass}>
        <BarChart3Icon className="size-[17px]" aria-hidden="true" />
        Leaderboard
      </Link>
      <ThemeQuickControl />
    </div>
  )
}

function TimerQuickControl() {
  const pomodoro = usePomodoro()
  const { authenticated } = useProductAuth()
  const [presets, setPresets] = React.useState<CustomTimerPreset[]>([])
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    if (!authenticated) {
      setPresets(
        normalizeCustomTimerPresets(
          readGuestJson<{ presets?: unknown }>(GUEST_PRESETS_KEY)?.presets
        )
      )
      return
    }
    let cancelled = false
    void listTimerPresets()
      .then((rows) => {
        if (!cancelled) setPresets(rows)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open, authenticated])

  const minutes = Math.floor(pomodoro.remainingSeconds / 60)
  const seconds = pomodoro.remainingSeconds % 60
  const countdown = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  const matched = matchTimerPreset(
    {
      focusMinutes: pomodoro.durations.focus,
      shortBreakMinutes: pomodoro.durations.short,
      longBreakMinutes: pomodoro.durations.long,
      autoStart: pomodoro.autoStart,
    },
    presets
  )

  const changeDuration = (key: TimerMode, delta: number) => {
    pomodoro.applyDurations(
      {
        ...pomodoro.durations,
        [key]: Math.min(90, Math.max(1, pomodoro.durations[key] + delta)),
      },
      pomodoro.autoStart
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={quickPillClass} aria-label="Timer quick controls">
          <Clock3Icon className="size-[17px]" aria-hidden="true" />
          {pomodoro.timer.running || !pomodoro.timerIdle ? (
            <span className="font-mono text-xs tabular-nums">{countdown}</span>
          ) : (
            "Timer"
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <strong className="text-sm">Timer</strong>
            <span className="font-mono text-lg tabular-nums">{countdown}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={pomodoro.toggleTimer}>
              {pomodoro.timer.running ? (
                <PauseIcon aria-hidden="true" />
              ) : (
                <PlayIcon aria-hidden="true" />
              )}
              {pomodoro.timer.running ? "Pause" : "Start"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={pomodoro.reset}
              aria-label="Reset timer"
            >
              <RotateCcwIcon aria-hidden="true" />
            </Button>
          </div>

          {modeLabels.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <span className="text-sm">{label}</span>
              <span className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={!pomodoro.timerIdle}
                  onClick={() => changeDuration(key, -1)}
                  aria-label={`One minute less ${label.toLowerCase()}`}
                >
                  <MinusIcon aria-hidden="true" />
                </Button>
                <b className="w-14 text-center font-mono text-xs">
                  {pomodoro.durations[key]} min
                </b>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={!pomodoro.timerIdle}
                  onClick={() => changeDuration(key, 1)}
                  aria-label={`One minute more ${label.toLowerCase()}`}
                >
                  <PlusIcon aria-hidden="true" />
                </Button>
              </span>
            </div>
          ))}

          <div className="flex items-center gap-2">
            <Switch
              id="quick-auto-start"
              checked={pomodoro.autoStart}
              onCheckedChange={pomodoro.setAutoStart}
            />
            <Label htmlFor="quick-auto-start">Auto-start next</Label>
          </div>

          <strong className="text-xs uppercase tracking-widest text-muted-foreground">
            Presets
          </strong>
          <div className="flex flex-col gap-1">
            {[...builtinTimerPresets, ...presets].map((preset) => {
              const selected = matched?.id === preset.id
              return (
                <button
                  key={preset.id}
                  className={cn(
                    "flex items-center justify-between rounded-md border px-2 py-1.5 text-left disabled:opacity-50",
                    selected && "border-l-2 border-l-primary"
                  )}
                  disabled={!pomodoro.timerIdle}
                  aria-pressed={selected}
                  onClick={() =>
                    pomodoro.applyDurations(
                      {
                        focus: preset.focusMinutes,
                        short: preset.shortBreakMinutes,
                        long: preset.longBreakMinutes,
                      },
                      preset.autoStart
                    )
                  }
                >
                  <span className="flex flex-col">
                    <strong className="text-xs">{preset.name}</strong>
                    <small className="font-mono text-[10px] text-muted-foreground">
                      {presetSummary(preset)}
                    </small>
                  </span>
                  {selected ? (
                    <CheckIcon
                      className="size-3.5 text-[var(--p-accent-2)]"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              )
            })}
          </div>
          {!pomodoro.timerIdle ? (
            <p className="text-xs text-muted-foreground">
              Reset or finish the timer to change durations or presets.
            </p>
          ) : !matched ? (
            <p className="text-xs text-muted-foreground">
              Current values are custom.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ThemeQuickControl() {
  const player = useSoundPlayer()
  const { background, chooseBackground } = useBackgroundSelection()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={quickPillClass} aria-label="Theme quick controls">
          <PaletteIcon className="size-[17px]" aria-hidden="true" />
          Theme
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="flex flex-col gap-3">
          <strong className="text-xs uppercase tracking-widest text-muted-foreground">
            Sound
          </strong>
          <div className="flex flex-col gap-1">
            {curatedSounds
              .filter((sound) => !sound.locked)
              .map((sound) => {
                const reference = { type: "curated", key: sound.key } as const
                const selected = sameSoundReference(
                  player.state.selected,
                  reference
                )
                const playing = selected && player.state.status === "playing"
                return (
                  <button
                    key={sound.key}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left",
                      selected && "border-l-2 border-l-primary"
                    )}
                    aria-pressed={selected}
                    onClick={() => player.selectSound(reference, sound.label)}
                  >
                    {playing ? (
                      <PauseIcon className="size-3.5" aria-hidden="true" />
                    ) : (
                      <PlayIcon className="size-3.5" aria-hidden="true" />
                    )}
                    <span className="flex flex-col">
                      <strong className="text-xs">{sound.label}</strong>
                      <small className="text-[10px] text-muted-foreground">
                        {sound.hint}
                      </small>
                    </span>
                    {selected ? (
                      <CheckIcon
                        className="ml-auto size-3.5 text-[var(--p-accent-2)]"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                )
              })}
            <button
              className={cn(
                "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left",
                !player.state.selected && "border-l-2 border-l-primary"
              )}
              aria-pressed={!player.state.selected}
              onClick={() => player.clearSound()}
            >
              <span className="size-3.5" aria-hidden="true" />
              <span className="flex flex-col">
                <strong className="text-xs">Silence</strong>
                <small className="text-[10px] text-muted-foreground">
                  No sound at all
                </small>
              </span>
              {!player.state.selected ? (
                <CheckIcon
                  className="ml-auto size-3.5 text-[var(--p-accent-2)]"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          </div>
          <Link to="/sounds" className="text-xs font-semibold text-[var(--p-accent-2)] hover:underline">
            All sounds
          </Link>

          <strong className="text-xs uppercase tracking-widest text-muted-foreground">
            Background
          </strong>
          <div className="grid grid-cols-3 gap-2">
            {curatedBackgrounds.slice(0, 3).map((scene) => {
              const selected =
                background.type === "scene" && background.key === scene.key
              return (
                <button
                  key={scene.key}
                  className="flex flex-col gap-1 text-left"
                  aria-pressed={selected}
                  onClick={() =>
                    chooseBackground({ type: "scene", key: scene.key })
                  }
                >
                  <span
                    className={cn(
                      "relative block overflow-hidden rounded-md",
                      selected && "ring-2 ring-[var(--p-accent)]"
                    )}
                  >
                    <img
                      src={`/backgrounds/thumbs-${scene.thumb}.png`}
                      alt=""
                      className="aspect-video w-full object-cover"
                    />
                    {selected ? (
                      <i className="absolute inset-0 grid place-items-center">
                        <CheckIcon
                          className="size-4 text-white drop-shadow"
                          aria-hidden="true"
                        />
                      </i>
                    ) : null}
                  </span>
                  <strong className="text-[10px]">{scene.label}</strong>
                </button>
              )
            })}
          </div>
          <Link
            to="/backgrounds"
            className="text-xs font-semibold text-[var(--p-accent-2)] hover:underline"
          >
            All backgrounds
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
