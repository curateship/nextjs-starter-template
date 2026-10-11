import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  BarChart3Icon,
  CheckIcon,
  ImageIcon,
  Clock3Icon,
  MinusIcon,
  MusicIcon,
  PaletteIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  SkipForwardIcon,
  VolumeXIcon,
} from "lucide-react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { ErrorRow } from "@/components/ui/error-row"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { dismissErrorToast } from "@/lib/toast/error-toast"
import { RESET_TO_CHANGE_RHYTHM_REASON } from "@/lib/pomodoro/disabled-reasons"
import { loadLeaderboard } from "@/lib/api/pomodoro/leaderboard"
import { listTimerPresets } from "@/lib/api/pomodoro/timer-presets"
import { useDiscardFocusConfirm } from "@/components/pomodoro/discard-focus-confirm"
import { InitialsAvatar } from "@/components/pomodoro/initials-avatar"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import {
  GUEST_PRESETS_KEY,
  readGuestJson,
} from "@/lib/pomodoro/guest-storage"
import { normalizeCustomTimerPresets } from "@/lib/pomodoro/timer-presets"
import { useRoomMedia } from "@/lib/pomodoro/room-media-store"
import {
  builtinTimerPresets,
  matchTimerPreset,
  presetSummary,
  type CustomTimerPreset,
} from "@/lib/pomodoro/timer-presets"
import { browserTimezone, type TimerMode } from "@/lib/pomodoro/timer"
import { usePomodoro } from "@/lib/pomodoro/use-pomodoro"
import { useSoundPlayer } from "@/lib/pomodoro/use-sound-player"
import { VolumeSlider } from "@/components/pomodoro/sound-player-row"
import { TextLink } from "@/components/pomodoro/text-link"
import { SignInButton } from "@/components/pomodoro/sign-in-button"
import { plural } from "@/lib/format/plural"
import { BackdropDimRow } from "@/components/pomodoro/backdrop-look-controls"

type SoundPlayer = ReturnType<typeof useSoundPlayer>

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
/**
 * The glassy round surface every header control is drawn on: the quick pills,
 * the menu button and the notification bell. One string, so they cannot
 * drift into different shades of glass.
 */
export const quickPillSurfaceClass =
  "rounded-full border bg-[rgba(var(--p-fg-rgb),0.07)] backdrop-blur-[12px]"

/** The surface's hover, for the parts of it that are buttons. */
export const quickPillHoverClass = "hover:bg-[rgba(var(--p-fg-rgb),0.16)]"

/**
 * The header's dropdowns as frosted glass, so the scene shows through them
 * blurred. Tyler, 10 Oct 2026: "Add the currant background scene under the
 * dropdown here". The surface keeps most of its colour, because the words
 * have to stay readable over the brightest scene. Put on this app's popovers
 * rather than in the shared `PopoverContent`, which is a shell file.
 */
const quickPopoverGlassClass =
  "bg-[rgba(var(--p-popover-rgb),0.72)] backdrop-blur-[20px] backdrop-saturate-150"

/** A button inside the timer pill, which holds the timer and the music bars. */
const timerPillPartClass = `flex h-full items-center gap-2 ${quickPillHoverClass} focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none`

/**
 * The old app's glassy header pill, 36px tall with 15px words and an 18px
 * icon. Tyler asked for the header's buttons 10% larger on 7 Oct 2026; they
 * were 32px with 13.5px words, and 36px is the nearest of the four heights the
 * rulebook allows.
 *
 * Narrow, the label inside it is hidden and the padding goes even, so the pill
 * is the icon in a 36px circle rather than an icon pushed to one side of a
 * pill with a hole where the words were. Every one of these buttons carries
 * its own `aria-label`, so hiding the words costs the button no name.
 */
export const quickPillClass = `flex h-9 items-center gap-2 whitespace-nowrap ${quickPillSurfaceClass} ${quickPillHoverClass} py-0 pl-3.5 pr-4 text-[15px] font-semibold text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none max-md:px-2`

/**
 * A pill's words: on from 768px up, gone below it.
 *
 * 768 rather than 640 because 640 was measured and does not fit: with the
 * labels back on, a 640px window still scrolled sideways by 61px.
 */
function QuickPillLabel({ children }: { children: React.ReactNode }) {
  return <span className="max-md:hidden">{children}</span>
}

/**
 * Leaderboard and Theme are gone below 768px, leaving the timer pill alone in
 * the middle. Tyler, 10 Oct 2026: "remove the leaderboard and theme button in
 * mobile". Both stay one tap away in the left menu.
 */
const phoneHiddenClass = "max-md:hidden"

/**
 * A heading inside a quick popover: small mono capitals over a full-width
 * rule, the way the old app separated a popover's parts. The rule is a bare
 * `border-t` so it takes the theme's own border colour.
 */
function QuickSectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <strong className="border-t pt-3.5 font-mono text-[11px] font-normal uppercase tracking-[0.16em] text-muted-foreground">
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
  const { requestReset, discardDialog } = useDiscardFocusConfirm(pomodoro)
  const { authenticated } = useProductAuth()
  const [presets, setPresets] = React.useState<CustomTimerPreset[]>([])
  // Your own rhythms failed to load. Said out loud, because the built-ins on
  // their own would look as if your presets had been deleted.
  const [presetsFailed, setPresetsFailed] = React.useState(false)
  // Bumped by Try again, which runs the same load once more.
  const [presetAttempt, setPresetAttempt] = React.useState(0)
  const [open, setOpen] = React.useState(false)
  const player = useSoundPlayer()
  // Muting keeps the sound "playing", only silent, so the bars stay to unmute.
  const soundOn =
    player.state.selected !== null &&
    (player.state.status === "playing" || player.state.status === "loading")

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
    void listTimerPresets().then(
      (rows) => {
        if (cancelled) return
        setPresetsFailed(false)
        setPresets(rows)
      },
      () => {
        if (!cancelled) setPresetsFailed(true)
      }
    )
    return () => {
      cancelled = true
    }
  }, [open, authenticated, presetAttempt])

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
      {/* Tyler, 10 Oct 2026: "The timer and music bar is one button". One
          pill with two presses in it: the timer opens its settings, and the
          music bars at its right end mute the sound. The settings hang from
          the whole pill, not from the timer half. */}
      <PopoverPrimitive.Anchor asChild>
        <div
          className={cn(
            "flex h-9 items-center whitespace-nowrap text-[15px] font-semibold text-foreground",
            quickPillSurfaceClass
          )}
        >
          <PopoverTrigger asChild>
            <button
              className={cn(
                timerPillPartClass,
                "pl-3.5 max-md:pl-2",
                soundOn
                  ? "rounded-l-full pr-2 max-md:pr-1"
                  : "rounded-full pr-4 max-md:pr-2"
              )}
              aria-label="Timer quick controls"
            >
              <Clock3Icon className="size-[18px]" aria-hidden="true" />
              {pomodoro.timer.running || !pomodoro.timerIdle ? (
                <span className="font-mono text-xs tabular-nums">
                  {countdown}
                </span>
              ) : (
                <QuickPillLabel>Timer</QuickPillLabel>
              )}
            </button>
          </PopoverTrigger>
          {soundOn ? <SoundBarsButton player={player} /> : null}
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverContent className={cn("w-[300px] gap-3.5 p-4", quickPopoverGlassClass)}>
        <div className="flex items-center justify-between">
          <strong className="text-sm font-semibold">Timer settings</strong>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {countdown}
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={
              pomodoro.onBreak ? pomodoro.skipBreak : pomodoro.toggleTimer
            }
          >
            {pomodoro.onBreak ? (
              <SkipForwardIcon aria-hidden="true" />
            ) : pomodoro.timer.running ? (
              <PauseIcon aria-hidden="true" />
            ) : (
              <PlayIcon aria-hidden="true" />
            )}
            {pomodoro.onBreak
              ? "Skip break"
              : pomodoro.timer.running
                ? "Pause"
                : "Start"}
          </Button>
          {/* On a break the wide button skips it, so running and pausing the
              break itself gets this icon beside Reset. */}
          {pomodoro.onBreak ? (
            <Button
              size="sm"
              variant="outline"
              onClick={pomodoro.toggleTimer}
              aria-label={
                pomodoro.timer.running ? "Pause the break" : "Start the break"
              }
            >
              {pomodoro.timer.running ? (
                <PauseIcon aria-hidden="true" />
              ) : (
                <PlayIcon aria-hidden="true" />
              )}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={requestReset}
            aria-label="Reset timer"
          >
            <RotateCcwIcon aria-hidden="true" />
          </Button>
        </div>

        {/* One wrapper for all three rows rather than six wrappers around six
            steppers: the rule that switches them off is the same rule, and
            the reader only needs to be told once. */}
        <DisabledReason
          className="w-full"
          disabled={!pomodoro.timerIdle}
          reason={RESET_TO_CHANGE_RHYTHM_REASON}
        >
        <div className="flex w-full flex-col gap-2.5">
          {modeLabels.map(([key, label]) => (
            <div key={key} className="flex items-center gap-2.5">
              <span className="mr-auto text-sm text-muted-foreground">
                {label}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
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
                disabled={!pomodoro.timerIdle}
                onClick={() => changeDuration(key, 1)}
                aria-label={`One minute more ${label.toLowerCase()}`}
              >
                <PlusIcon aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
        </DisabledReason>

        <div className="flex items-center gap-2.5 border-t pt-3.5">
          <Label
            htmlFor="quick-auto-start"
            className="mr-auto text-sm font-normal text-muted-foreground"
          >
            Auto-start the next timer
          </Label>
          <Switch
            id="quick-auto-start"
            checked={pomodoro.autoStart}
            onCheckedChange={pomodoro.setAutoStart}
          />
        </div>

        <QuickSectionHeading>Presets</QuickSectionHeading>
        <DisabledReason
          className="w-full"
          disabled={!pomodoro.timerIdle}
          reason={RESET_TO_CHANGE_RHYTHM_REASON}
        >
        <div className="flex w-full flex-col gap-1">
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
        </DisabledReason>
        {authenticated && presetsFailed ? (
          <ErrorRow
            className="px-0 py-2"
            message="Your own rhythms could not be loaded. Only the built-in ones are listed above."
            onRetry={() => {
              dismissErrorToast()
              setPresetAttempt((attempt) => attempt + 1)
            }}
          />
        ) : null}
        {/* The loose paragraph that used to explain the greyed-out rows is
            gone: the reason now rides on the controls it is about. What is
            left is not a disabled reason, it is a fact about the current
            values, so it stays a line of its own. */}
        {pomodoro.timerIdle && !matched ? (
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Current values are custom.
          </p>
        ) : null}
      </PopoverContent>
      {/* Outside PopoverContent on purpose: the popover unmounts its contents
          when it closes, and opening the dialog moves focus out of it. */}
      {discardDialog}
    </Popover>
  )
}

/** How long a finger rests on the bars before the volume opens instead of muting. */
const HOLD_FOR_VOLUME_MS = 450

/** How long the volume stays open after the mouse leaves, so it can cross the gap. */
const VOLUME_CLOSE_DELAY_MS = 200

/**
 * The music bars at the right end of the timer pill, drawn while a sound
 * plays. Tyler, 10 Oct 2026: "Add an animated music icon playing here when a
 * sound is playing so user can mute the sound." The sound player itself sits
 * under the clock, so on every other page this is the only sign a sound is
 * on and the only way to silence it.
 *
 * A press mutes or unmutes, the same mute the player under the clock has.
 * The volume opens on its own: on hover with a mouse, after holding a finger
 * on the bars, or with the arrow keys, which also step it by five.
 */
function SoundBarsButton({ player }: { player: SoundPlayer }) {
  const { state } = player
  const [volumeOpen, setVolumeOpen] = React.useState(false)
  const closeTimer = React.useRef<number | undefined>(undefined)
  const holdTimer = React.useRef<number | undefined>(undefined)
  // A hold that opened the volume is not also a press that mutes.
  const held = React.useRef(false)

  React.useEffect(
    () => () => {
      window.clearTimeout(closeTimer.current)
      window.clearTimeout(holdTimer.current)
    },
    []
  )

  const openVolume = () => {
    window.clearTimeout(closeTimer.current)
    setVolumeOpen(true)
  }
  const closeVolumeSoon = () => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(
      () => setVolumeOpen(false),
      VOLUME_CLOSE_DELAY_MS
    )
  }
  const stopHold = () => window.clearTimeout(holdTimer.current)

  return (
    <Popover open={volumeOpen} onOpenChange={setVolumeOpen}>
      <PopoverPrimitive.Anchor asChild>
        <button
          type="button"
          className={cn(
            timerPillPartClass,
            // A held finger must not select text or open the phone's own menu.
            "rounded-r-full pr-3.5 pl-2 select-none [-webkit-touch-callout:none] max-md:pr-2.5 max-md:pl-1.5"
          )}
          aria-label={state.muted ? "Unmute sound" : "Mute sound"}
          aria-pressed={state.muted}
          aria-keyshortcuts="ArrowUp ArrowDown"
          onClick={() => {
            if (held.current) {
              held.current = false
              return
            }
            player.toggleMuted()
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") openVolume()
          }}
          onPointerLeave={(event) => {
            stopHold()
            if (event.pointerType === "mouse") closeVolumeSoon()
          }}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse") return
            held.current = false
            stopHold()
            holdTimer.current = window.setTimeout(() => {
              held.current = true
              openVolume()
            }, HOLD_FOR_VOLUME_MS)
          }}
          onPointerUp={stopHold}
          onPointerCancel={stopHold}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            const step =
              event.key === "ArrowUp" || event.key === "ArrowRight"
                ? 5
                : event.key === "ArrowDown" || event.key === "ArrowLeft"
                  ? -5
                  : 0
            if (step === 0) return
            event.preventDefault()
            player.setVolume(Math.min(100, Math.max(0, state.volume + step)))
            openVolume()
          }}
        >
          {state.muted ? (
            <VolumeXIcon className="size-4" aria-hidden="true" />
          ) : (
            <MusicBars />
          )}
        </button>
      </PopoverPrimitive.Anchor>
      <PopoverContent
        className={cn("w-48 gap-2 p-3", quickPopoverGlassClass)}
        // Opened by a hover, so it must not take the keyboard away.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") openVolume()
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") closeVolumeSoon()
        }}
      >
        <span className="flex items-baseline justify-between gap-2">
          <strong className="text-sm font-semibold">Volume</strong>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {state.muted ? "Muted" : `${state.volume}%`}
          </span>
        </span>
        <VolumeSlider player={player} className="w-full" />
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          Press the bars to {state.muted ? "unmute" : "mute"}.
        </p>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Three bars rising and falling, the room cards' "live vibe" mark. With less
 * movement asked for they stand still at three heights.
 */
function MusicBars() {
  return (
    <span aria-hidden="true" className="flex h-3.5 items-end gap-[2px]">
      {[
        { height: "100%", delay: "0s" },
        { height: "55%", delay: "-0.4s" },
        { height: "80%", delay: "-0.2s" },
      ].map((bar) => (
        <b
          key={bar.delay}
          className="w-[3px] origin-bottom animate-[pomodoro-equaliser_0.8s_ease-in-out_infinite] rounded-sm bg-current motion-reduce:animate-none"
          style={{ height: bar.height, animationDelay: bar.delay }}
        />
      ))}
    </span>
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
        <button
          className={cn(quickPillClass, phoneHiddenClass)}
          aria-label="Leaderboard"
        >
          <BarChart3Icon className="size-[18px]" aria-hidden="true" />
          <QuickPillLabel>Leaderboard</QuickPillLabel>
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[290px] gap-3 p-4", quickPopoverGlassClass)}>
        <div className="flex items-baseline gap-2">
          <strong className="text-sm font-semibold">Leaderboard</strong>
          <span className="font-mono text-[11px] text-muted-foreground">
            this week
          </span>
        </div>
        {!authenticated ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Sign in to see this week's ranking.
            </p>
            <SignInButton />
          </div>
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
            Nobody has opted in yet. Turn the leaderboard on in{" "}
            <TextLink
              to="/settings"
              search={{ tab: "profile" }}
              onClick={() => setOpen(false)}
            >
              Settings
            </TextLink>{" "}
            and pick a display name to be first.
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
                {/* Your row is told apart by more than its colour. */}
                {leader.isYou ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · you
                  </span>
                ) : null}
              </strong>
              <b className="shrink-0 font-mono text-xs font-normal text-[var(--p-accent-2)]">
                {leader.focusSessions} {plural(leader.focusSessions, "session")}
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

/**
 * The header's Theme pill. It used to pick a sound and a scene in one click,
 * which started the loop through the header's player and fought the timer's
 * Start on the front page. Tyler, 7 Oct 2026: preview first, then add. So
 * the pill now only says whose room the pair belongs to and opens the two
 * pages where a sound or a theme is previewed and added.
 */
function ThemeQuickControl() {
  const { room } = useRoomMedia()
  const { authenticated } = useProductAuth()
  const owner = room
    ? room.role === "host"
      ? `${room.name}, the room you host`
      : `${room.name}, picked by its host`
    : authenticated
      ? "Your personal room"
      : "Picked at random for this visit"
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(quickPillClass, phoneHiddenClass)}
          aria-label="Theme quick controls"
        >
          <PaletteIcon className="size-[18px]" aria-hidden="true" />
          <QuickPillLabel>Theme</QuickPillLabel>
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-72 gap-3.5 p-4", quickPopoverGlassClass)}>
        <span className="flex flex-col gap-0.5">
          <strong className="text-sm font-semibold">Theme</strong>
          <small className="text-xs text-muted-foreground">{owner}</small>
        </span>
        <div className="flex flex-col gap-1">
          <Link to="/sounds" className={quickRowClass}>
            <MusicIcon className="size-4 shrink-0" aria-hidden="true" />
            <strong className="text-[13.5px]">Choose a sound</strong>
          </Link>
          <Link to="/backgrounds" className={quickRowClass}>
            <ImageIcon className="size-4 shrink-0" aria-hidden="true" />
            <strong className="text-[13.5px]">Choose a theme</strong>
          </Link>
        </div>
        <BackdropDimRow />
      </PopoverContent>
    </Popover>
  )
}
