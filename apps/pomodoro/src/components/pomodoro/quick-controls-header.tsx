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
  SparklesIcon,
  UploadIcon,
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
import { loadLeaderboard } from "@/lib/api/pomodoro/leaderboard"
import { listTimerPresets } from "@/lib/api/pomodoro/timer-presets"
import { InitialsAvatar } from "@/components/pomodoro/initials-avatar"
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
import { browserTimezone, type TimerMode } from "@/lib/pomodoro/timer"
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

/**
 * A heading inside a quick popover: small mono capitals over a full-width
 * rule, the way the old app separated a popover's parts. The rule is a bare
 * `border-t` so it takes the theme's own border colour.
 */
function QuickSectionHeading({
  children,
  first,
}: {
  children: React.ReactNode
  first?: boolean
}) {
  return (
    <strong
      className={cn(
        "font-mono text-[11px] font-normal uppercase tracking-[0.16em] text-muted-foreground",
        !first && "border-t pt-3.5"
      )}
    >
      {children}
    </strong>
  )
}

/** A row in one of the popover lists: rounded, filled in when it is the one in use. */
const quickRowClass =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"

const quickRowSelectedClass =
  "bg-primary/15 text-[var(--p-accent-2)] hover:bg-primary/15"

export default function QuickControlsHeader() {
  return (
    <div className="flex items-center gap-2.5">
      <TimerQuickControl />
      <LeaderboardQuickControl />
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
      sessionsBeforeLongBreak: pomodoro.sessionsBeforeLongBreak,
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
      <PopoverContent className="w-[300px] gap-3.5 p-4">
        <div className="flex items-center justify-between">
          <strong className="text-sm font-semibold">Timer settings</strong>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {countdown}
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 rounded-full"
            onClick={pomodoro.toggleTimer}
          >
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
            className="rounded-full"
            onClick={pomodoro.reset}
            aria-label="Reset timer"
          >
            <RotateCcwIcon aria-hidden="true" />
          </Button>
        </div>

        <div className="flex flex-col gap-2.5">
          {modeLabels.map(([key, label]) => (
            <div key={key} className="flex items-center gap-2.5">
              <span className="mr-auto text-sm text-muted-foreground">
                {label}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                disabled={!pomodoro.timerIdle}
                onClick={() => changeDuration(key, -1)}
                aria-label={`One minute less ${label.toLowerCase()}`}
              >
                <MinusIcon aria-hidden="true" />
              </Button>
              <b className="w-14 text-center font-mono text-[13px] font-normal tabular-nums">
                {pomodoro.durations[key]} min
              </b>
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                disabled={!pomodoro.timerIdle}
                onClick={() => changeDuration(key, 1)}
                aria-label={`One minute more ${label.toLowerCase()}`}
              >
                <PlusIcon aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2.5 border-t pt-3.5">
          <Label
            htmlFor="quick-auto-start"
            className="mr-auto text-sm font-normal text-muted-foreground"
          >
            Auto-start next
          </Label>
          <Switch
            id="quick-auto-start"
            checked={pomodoro.autoStart}
            onCheckedChange={pomodoro.setAutoStart}
          />
        </div>

        <QuickSectionHeading>Presets</QuickSectionHeading>
        <div className="flex flex-col gap-1">
          {[...builtinTimerPresets, ...presets].map((preset) => {
            const selected = matched?.id === preset.id
            return (
              <button
                key={preset.id}
                className={cn(
                  quickRowClass,
                  selected && quickRowSelectedClass
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
                    preset.autoStart,
                    {
                      sessionsBeforeLongBreak: preset.sessionsBeforeLongBreak,
                    }
                  )
                }
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <strong className="truncate text-[13.5px]">
                    {preset.name}
                  </strong>
                  <small className="font-mono text-[11.5px] font-normal text-muted-foreground">
                    {presetSummary(preset)}
                  </small>
                </span>
                {selected ? (
                  <CheckIcon className="size-3.5 shrink-0" aria-hidden="true" />
                ) : null}
              </button>
            )
          })}
        </div>
        {!pomodoro.timerIdle ? (
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Reset or finish the timer to change durations or presets.
          </p>
        ) : !matched ? (
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Current values are custom.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The pair of shortcuts under each half of the Theme popover. Both open the
 * full page, because uploading a file and writing a prompt each need more
 * room than a popover has; the popover only says the two doors exist.
 */
function QuickActions({
  to,
  thing,
}: {
  to: "/sounds" | "/backgrounds"
  thing: "sound" | "background"
}) {
  const base =
    "flex h-[34px] flex-1 items-center justify-center gap-[7px] rounded-full text-[12.5px] font-semibold"
  return (
    <div className="flex gap-2">
      <Link
        to={to}
        className={cn(
          base,
          "border border-dashed border-foreground/25 text-muted-foreground hover:text-foreground"
        )}
      >
        <UploadIcon className="size-3.5" aria-hidden="true" />
        Upload
        <span className="sr-only">your own {thing}</span>
      </Link>
      <Link
        to={to}
        className={cn(
          base,
          "border border-primary/40 bg-primary/10 text-[var(--p-accent-2)] hover:bg-primary/20"
        )}
      >
        <SparklesIcon className="size-3.5" aria-hidden="true" />
        AI Generate
        <span className="sr-only">a {thing}</span>
      </Link>
    </div>
  )
}

type Leaderboard = Awaited<ReturnType<typeof loadLeaderboard>>

/**
 * The header's Leaderboard popover: this week's top five, read from the real
 * ranking rather than the sample names the old app drew. Only accounts that
 * opted in and chose a display name are in it, so no real name ever appears
 * here. Loading waits until the popover is opened, because most visits never
 * open it.
 */
function LeaderboardQuickControl() {
  const { authenticated, known } = useProductAuth()
  const [open, setOpen] = React.useState(false)
  const [board, setBoard] = React.useState<Leaderboard | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    if (!open || !known || !authenticated) return
    let cancelled = false
    void loadLeaderboard(browserTimezone())
      .then((rows) => {
        if (cancelled) return
        // Clearing the old failure here rather than before the request keeps
        // the last good ranking on screen while a retry is in flight.
        setFailed(false)
        setBoard(rows)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, known, authenticated])

  const top = board?.leaders.slice(0, 5) ?? []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={quickPillClass} aria-label="Leaderboard">
          <BarChart3Icon className="size-[17px]" aria-hidden="true" />
          Leaderboard
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[290px] gap-3 p-4">
        <div className="flex items-baseline gap-2">
          <strong className="text-sm font-semibold">Leaderboard</strong>
          <span className="font-mono text-[11px] text-muted-foreground">
            this week
          </span>
        </div>
        {!authenticated ? (
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Sign in to see this week's ranking.
          </p>
        ) : failed ? (
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            The leaderboard could not be loaded. Open it again to retry.
          </p>
        ) : !board ? (
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Loading this week's ranking.
          </p>
        ) : top.length === 0 ? (
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Nobody has opted in yet. Turn the leaderboard on in Settings and
            pick a display name to be first.
          </p>
        ) : (
          top.map((leader, index) => (
            <div
              key={`${index}-${leader.name ?? ""}`}
              className="flex items-center gap-3"
            >
              <span className="w-3.5 font-mono text-xs text-muted-foreground">
                {index + 1}
              </span>
              <InitialsAvatar
                name={leader.name ?? "?"}
                className="size-7 ring-1 ring-foreground/10"
              />
              <strong
                className={cn(
                  "mr-auto min-w-0 truncate text-[13.5px]",
                  leader.isYou && "text-[var(--p-accent-2)]"
                )}
              >
                {leader.name ?? "Someone"}
              </strong>
              <b className="shrink-0 font-mono text-xs font-normal text-[var(--p-accent-2)]">
                {leader.focusSessions} 🍅
              </b>
            </div>
          ))
        )}
        <Link
          to="/leaderboard"
          className="text-xs font-semibold text-[var(--p-accent-2)] hover:underline"
          onClick={() => setOpen(false)}
        >
          Full leaderboard
        </Link>
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
      <PopoverContent className="w-80 gap-3.5 p-4">
        <strong className="text-sm font-semibold">Theme</strong>

        <QuickSectionHeading first>Sound</QuickSectionHeading>
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
                    quickRowClass,
                    selected && quickRowSelectedClass
                  )}
                  aria-pressed={selected}
                  onClick={() => player.selectSound(reference, sound.label)}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground/5 ring-1 ring-foreground/15">
                    {playing ? (
                      <PauseIcon
                        className="size-3 fill-current"
                        aria-hidden="true"
                      />
                    ) : (
                      <PlayIcon
                        className="size-3 fill-current"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <strong className="truncate text-[13.5px]">
                      {sound.label}
                    </strong>
                    <small className="truncate text-[11.5px] text-muted-foreground">
                      {sound.hint}
                    </small>
                  </span>
                  {selected ? (
                    <CheckIcon
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              )
            })}
          <button
            className={cn(
              quickRowClass,
              !player.state.selected && quickRowSelectedClass
            )}
            aria-pressed={!player.state.selected}
            onClick={() => player.clearSound()}
          >
            <span className="size-7 shrink-0" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col">
              <strong className="truncate text-[13.5px]">Silence</strong>
              <small className="truncate text-[11.5px] text-muted-foreground">
                No sound at all
              </small>
            </span>
            {!player.state.selected ? (
              <CheckIcon className="size-3.5 shrink-0" aria-hidden="true" />
            ) : null}
          </button>
        </div>
        <QuickActions to="/sounds" thing="sound" />

        <QuickSectionHeading>Background</QuickSectionHeading>
        <div className="grid grid-cols-3 gap-2">
          {curatedBackgrounds.slice(0, 3).map((scene) => {
            const selected =
              background.type === "scene" && background.key === scene.key
            return (
              <button
                key={scene.key}
                className="flex min-w-0 flex-col gap-1.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-pressed={selected}
                onClick={() =>
                  chooseBackground({ type: "scene", key: scene.key })
                }
              >
                <span
                  className={cn(
                    "relative block overflow-hidden rounded-lg ring-2 ring-foreground/10",
                    selected && "ring-[var(--p-accent)]"
                  )}
                >
                  <img
                    src={`/backgrounds/thumbs-${scene.thumb}.png`}
                    alt=""
                    className="block aspect-[5/3] w-full object-cover"
                  />
                  {selected ? (
                    <i className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-[var(--p-accent)] text-[var(--p-on-accent)]">
                      <CheckIcon
                        className="size-2.5 stroke-[4]"
                        aria-hidden="true"
                      />
                    </i>
                  ) : null}
                </span>
                <strong
                  className={cn(
                    "truncate text-xs font-semibold text-muted-foreground",
                    selected && "text-[var(--p-accent-2)]"
                  )}
                >
                  {scene.label}
                </strong>
              </button>
            )
          })}
        </div>
        <QuickActions to="/backgrounds" thing="background" />
      </PopoverContent>
    </Popover>
  )
}
