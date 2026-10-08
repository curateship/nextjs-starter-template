import * as React from "react"
import {
  MaximizeIcon,
  MinusIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react"

import { useDiscardFocusConfirm } from "@/components/pomodoro/discard-focus-confirm"
import { BreakCard } from "@/components/pomodoro/break-card"
import { SessionNotePrompt } from "@/components/pomodoro/session-note-prompt"
import {
  TasksSection,
} from "@/components/pomodoro/today-task-list"
import { ZenMode } from "@/components/pomodoro/zen-mode"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { InlineError } from "@/components/ui/inline-error"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  cycleSessionLabel,
  MODE_LABELS,
  type TimerMode,
} from "@/lib/pomodoro/timer"
import {
  DAILY_GOAL_LIMIT_REASON,
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  usePomodoro,
} from "@/lib/pomodoro/use-pomodoro"
import { useSpaceToggle } from "@/lib/pomodoro/use-space-toggle"
import { TextLink } from "@/components/pomodoro/text-link"
import { plural } from "@/lib/format/plural"
import { formatDuration } from "@/lib/format/format-time"
import { cn } from "@/lib/utils"
import { contentColumn } from "@/lib/pomodoro/content-column"
import { HomeOpenRooms } from "@/components/pomodoro/open-rooms"

const ringRadius = 144
const circumference = 2 * Math.PI * ringRadius

/** The small spaced capitals that name each part of the screen. */
const eyebrowClass =
  "font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/75"

const statCellClass = "flex min-w-0 flex-col gap-2 px-5 py-4"

const statValueClass = "text-lg font-semibold leading-6 tracking-tight"

/** Above this many sessions, Today's chips drop their "25m" labels. */
const MAX_LABELLED_SESSIONS = 6

/**
 * Today's goal as one chip per session, each labelled with the focus length
 * ("25m"). A finished focus fills orange, the next one has an orange outline,
 * the rest are grey, and every finished chip turns green once the goal is
 * met. A goal of more than six has no room for the labels, so its chips are
 * blank squares, from Tyler's design of 8 Oct 2026. It reads out like the shared
 * `Meter` does ("Today's daily goal, 3 of 4 sessions"); the shared one draws a
 * single fill, which cannot show the sessions apart.
 */
function GoalSegments({
  done,
  goal,
  reached,
  focusMinutes,
}: {
  done: number
  goal: number
  reached: boolean
  focusMinutes: number
}) {
  const filled = Math.min(Math.max(done, 0), goal)
  const many = goal > MAX_LABELLED_SESSIONS
  return (
    <div
      role="meter"
      aria-label="Today's daily goal"
      aria-valuenow={filled}
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuetext={`${done} of ${goal} ${plural(goal, "session")}${reached ? ", goal reached" : ""}`}
      className="mt-1 flex gap-1.5"
    >
      {Array.from({ length: goal }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            "grid min-w-0 flex-1 place-items-center rounded-[6px] border font-mono text-[11px] transition-colors motion-reduce:transition-none",
            many ? "h-6" : "h-[22px]",
            index < filled
              ? reached
                ? "border-transparent bg-[var(--p-success)] text-white"
                : "border-transparent bg-primary text-primary-foreground"
              : index === filled
                ? "border-primary/70 bg-primary/15 text-primary"
                : "bg-foreground/5 text-muted-foreground"
          )}
        >
          {many ? null : `${focusMinutes}m`}
        </span>
      ))}
    </div>
  )
}

/**
 * The three mode tabs.
 *
 * This is the shared segmented `Tabs`, the same control History's range strip
 * uses. The hand-rolled version before it claimed `role="tablist"` while
 * behaving like three unrelated buttons: every pill was its own tab stop and
 * the arrow keys did nothing. Radix brings the roving focus and the left and
 * right arrows with it, so the strip now behaves the way it already said it
 * did.
 */
function ModeTabs({
  mode,
  onSelect,
}: {
  mode: TimerMode
  onSelect: (mode: TimerMode) => void
}) {
  return (
    // 16px more room under the ring than the column's 24px gap, which Tyler
    // asked for on 7 Oct 2026 ("add some spacing here").
    <Tabs
      value={mode}
      onValueChange={(value) => onSelect(value as TimerMode)}
      className="mt-4"
    >
      {/* Larger and rounder than every other tab row, on Tyler's word on
          7 Oct 2026: "the focus, short break, long break tabs should be large
          like the screenshot". These three are the screen's main switch, not
          a filter, so they are the one row allowed past 32px. A phone gets
          tighter padding so the row fits a 375px screen. */}
      <TabsList
        aria-label="Timer mode"
        className="h-12 rounded-full border p-1.5 [&>[data-slot=tabs-pill]]:rounded-full"
      >
        {(Object.keys(MODE_LABELS) as TimerMode[]).map((key) => (
          <TabsTrigger
            key={key}
            value={key}
            className="h-9 rounded-full px-3 text-[15px] sm:px-5 sm:text-base"
          >
            {MODE_LABELS[key]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

/**
 * The round buttons either side of Start. 36px, the largest height the
 * rulebook allows, because they sit inside the ring where a 32px control looks
 * lost; they were 44px, which is not one of the four.
 */
const ringIconButtonClass =
  "bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground dark:border-border dark:bg-transparent dark:hover:bg-transparent"

/**
 * The pencil beside the goal bar: how many focus sessions today is meant to
 * hold. It is a stepper in a popover rather than a typed field, because the
 * number only ever moves by one and a typed field on the dashboard would
 * need its own saving and error line. Changing it saves straight away and
 * never touches the countdown, so it works while the timer runs.
 */
function DailyGoalEditor({
  goal,
  onChange,
}: {
  goal: number
  onChange: (sessions: number) => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-my-1 size-6 text-muted-foreground hover:text-foreground"
          aria-label="Edit the daily session goal"
        >
          <PencilIcon className="size-3" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-60 gap-3 p-4">
        <strong className="text-sm font-semibold">Daily session goal</strong>
        <div className="flex items-center gap-2.5">
          <span className="mr-auto text-sm text-muted-foreground">Sessions</span>
          {/* At either end the button says why it stopped, rather than
              looking broken. */}
          <DisabledReason
            reason={DAILY_GOAL_LIMIT_REASON}
            disabled={goal <= DAILY_GOAL_MIN}
          >
            <Button
              variant="outline"
              size="icon-sm"
              disabled={goal <= DAILY_GOAL_MIN}
              onClick={() => onChange(goal - 1)}
              aria-label="One session fewer"
            >
              <MinusIcon aria-hidden="true" />
            </Button>
          </DisabledReason>
          <b className="w-8 text-center font-mono text-[13px] font-normal tabular-nums">
            {goal}
          </b>
          <DisabledReason
            reason={DAILY_GOAL_LIMIT_REASON}
            disabled={goal >= DAILY_GOAL_MAX}
          >
            <Button
              variant="outline"
              size="icon-sm"
              disabled={goal >= DAILY_GOAL_MAX}
              onClick={() => onChange(goal + 1)}
              aria-label="One session more"
            >
              <PlusIcon aria-hidden="true" />
            </Button>
          </DisabledReason>
        </div>
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          What the bars under Today count towards.{" "}
          <TextLink to="/settings">Settings &rsaquo; Timer</TextLink> has the
          same number.
        </p>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The timer: the ring with the session line, the countdown, the orange Start
 * pill between Reset and Zen mode and the Space hint all inside it; the mode
 * tabs under it; a card of three for today's goal, the streak and auto-start;
 * and the Tasks card below.
 */
export function TimerDashboard() {
  const pomodoro = usePomodoro()
  const { requestReset, requestMode, discardDialog } =
    useDiscardFocusConfirm(pomodoro)
  const [zen, setZen] = React.useState(false)
  const zenButton = React.useRef<HTMLButtonElement>(null)
  // Leaving unmounts zen mode and mounts this screen again, so the focus move
  // back to the control that opened it waits for that button to exist.
  const leaveZen = React.useCallback(() => {
    setZen(false)
    requestAnimationFrame(() => zenButton.current?.focus())
  }, [])
  const minutes = Math.floor(pomodoro.remainingSeconds / 60)
  const seconds = pomodoro.remainingSeconds % 60
  const totalSeconds = pomodoro.timer.durationMinutes * 60
  const dashOffset =
    circumference * (1 - pomodoro.remainingSeconds / totalSeconds)
  const goalReached =
    pomodoro.todayFocusSessions >= pomodoro.dailyGoalSessions
  // The same toggle the break's play button and the Start pill call, here and
  // in zen mode alike, which is why it lives above the early return.
  useSpaceToggle(pomodoro.toggleTimer)

  if (zen) return <ZenMode pomodoro={pomodoro} onLeave={leaveZen} />

  return (
    <div className="flex flex-col gap-7">
      <section className={`${contentColumn} flex flex-col items-center gap-6`}>
        {/* The ring takes the smaller of 300px and the width the page
            actually has, so it stays whole on a narrow phone instead of
            running off the side. The percentage is of the content column, not
            the window, so it follows the page gutter without repeating its
            number. `aspect-square` keeps it a circle once the width is
            capped, and the `viewBox` keeps every coordinate below at the
            300-unit scale they were drawn for. Zen mode does the same thing
            against the window, which is the right measure there because it
            covers the window. */}
        <div className="relative aspect-square w-[min(300px,100%)]">
          <svg className="size-full" viewBox="0 0 300 300" aria-hidden="true">
            <circle
              cx="150"
              cy="150"
              r={ringRadius}
              fill="none"
              stroke="rgba(var(--p-fg-rgb), 0.07)"
              strokeWidth="8"
            />
            <circle
              cx="150"
              cy="150"
              r={ringRadius}
              fill="none"
              stroke={
                pomodoro.timer.running ? "var(--p-success)" : "var(--p-accent)"
              }
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 150 150)"
              style={{
                transition: "stroke-dashoffset .9s linear, stroke .2s ease",
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {/* Where this rhythm's long break is, in the short form the ring
                has room for. */}
            <span className={eyebrowClass}>
              {cycleSessionLabel(
                pomodoro.timer.mode,
                pomodoro.cycleFocusSessions,
                pomodoro.sessionsBeforeLongBreak,
                { short: true }
              )}
            </span>
            <time className="mt-3 font-mono text-[64px] font-semibold leading-none tracking-tight">
              {String(minutes).padStart(2, "0")}:
              {String(seconds).padStart(2, "0")}
            </time>
            <div className="mt-6 flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-lg"
                className={ringIconButtonClass}
                onClick={requestReset}
                aria-label="Reset timer"
              >
                <RotateCcwIcon className="size-[17px]" aria-hidden="true" />
              </Button>
              {/* On a break the pill is Skip break, so running and pausing
                  the break itself moves here. It appears on breaks only, and
                  the focus screen keeps its two buttons. */}
              {pomodoro.onBreak ? (
                <Button
                  variant="outline"
                  size="icon-lg"
                  className={ringIconButtonClass}
                  onClick={pomodoro.toggleTimer}
                  aria-label={
                    pomodoro.timer.running
                      ? "Pause the break"
                      : "Start the break"
                  }
                >
                  {pomodoro.timer.running ? (
                    <PauseIcon className="size-[17px]" aria-hidden="true" />
                  ) : (
                    <PlayIcon className="size-[17px]" aria-hidden="true" />
                  )}
                </Button>
              ) : null}
              {/* The shared Button at its 36px size in the orange, the same
                  skin as Register in the header. Shared rather than
                  hand-rolled so the keyboard focus ring is the one every
                  other button draws. */}
              <Button
                size="lg"
                // Narrower on a break, where a fourth round button joins the
                // row and the wider pill would press against the ring.
                className={cn(
                  "bg-[var(--p-accent)] text-[14.5px] text-[var(--p-on-accent)] hover:bg-[var(--p-accent-2)]",
                  pomodoro.onBreak ? "px-4" : "px-7"
                )}
                onClick={
                  pomodoro.onBreak ? pomodoro.skipBreak : pomodoro.toggleTimer
                }
              >
                {pomodoro.onBreak
                  ? "Skip break"
                  : pomodoro.timer.running
                    ? "Pause"
                    : "Start"}
              </Button>
              {/* The one icon on this screen whose picture does not say what
                  it does, so it keeps a tooltip while Reset does not. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    ref={zenButton}
                    variant="outline"
                    size="icon-lg"
                    className={ringIconButtonClass}
                    onClick={() => setZen(true)}
                    aria-label="Enter zen mode"
                  >
                    <MaximizeIcon className="size-[17px]" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Zen mode: fullscreen, just the ring and the task
                </TooltipContent>
              </Tooltip>
            </div>
            {/* Only where there is a keyboard to press it on. */}
            <span className="mt-5 hidden font-mono text-xs text-muted-foreground pointer-fine:inline">
              Space to {pomodoro.timer.running ? "pause" : "start"}
            </span>
          </div>
        </div>

        <ModeTabs mode={pomodoro.timer.mode} onSelect={requestMode} />

        {/* What to do away from the screen, for as long as the timer is on a
            break. Keyed by the break, so the ticks start empty each time. */}
        {pomodoro.timer.mode !== "focus" ? (
          <BreakCard
            key={`${pomodoro.timer.mode}-${pomodoro.todayFocusSessions}`}
            kind={pomodoro.timer.mode}
            minutes={pomodoro.timer.durationMinutes}
            sessions={pomodoro.sessionsBeforeLongBreak}
          />
        ) : null}

        <SessionNotePrompt pomodoro={pomodoro} />

        {pomodoro.syncError ? (
          <InlineError className="text-center">
            {pomodoro.syncError}
          </InlineError>
        ) : null}
      </section>

      {/* One card: today, the streak and auto-start along the top (one row
          of three on a wide screen, stacked on a phone), then the tasks
          under a full-width divider, then the add box under another. */}
      <div
        className={`${contentColumn} overflow-hidden rounded-[24px] border bg-[var(--p-surface)]`}
      >
        <section
          aria-label="Today"
          className="grid divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        >
          <div className={statCellClass}>
            <div className="flex items-center justify-between gap-2">
              <span className={eyebrowClass}>
                Today
                {/* Darker than the grey line, not green: the light theme's
                    green is under 4.5:1 on white at this size. */}
                {goalReached ? (
                  <span className="text-foreground"> · Goal reached</span>
                ) : null}
              </span>
              <DailyGoalEditor
                goal={pomodoro.dailyGoalSessions}
                onChange={pomodoro.setDailyGoal}
              />
            </div>
            <p className={statValueClass}>
              {pomodoro.todayFocusSessions}
              <span className="font-normal text-muted-foreground">
                {" "}
                / {pomodoro.dailyGoalSessions}{" "}
                {plural(pomodoro.dailyGoalSessions, "session")}
              </span>
            </p>
            {/* The minutes behind the count, for a goal too long for the
                chips to carry their own "25m". */}
            {pomodoro.dailyGoalSessions > MAX_LABELLED_SESSIONS ? (
              <p className="font-mono text-xs text-muted-foreground">
                {formatDuration(
                  pomodoro.todayFocusSessions * pomodoro.durations.focus * 60_000,
                  { zero: "0m" }
                )}{" "}
                of{" "}
                {formatDuration(
                  pomodoro.dailyGoalSessions * pomodoro.durations.focus * 60_000
                )}
              </p>
            ) : null}
            <GoalSegments
              done={pomodoro.todayFocusSessions}
              goal={pomodoro.dailyGoalSessions}
              reached={goalReached}
              focusMinutes={pomodoro.durations.focus}
            />
          </div>
          <div className={statCellClass}>
            <span className={eyebrowClass}>Streak</span>
            <p className={statValueClass}>
              {pomodoro.currentStreak}{" "}
              {plural(pomodoro.currentStreak, "day")}
              <span className="font-normal text-muted-foreground">
                {" "}
                · best {pomodoro.bestStreak}
              </span>
            </p>
          </div>
          <div className={statCellClass}>
            <span id="auto-start-heading" className={eyebrowClass}>
              Auto-start
            </span>
            <div className="flex items-center gap-2.5">
              <Switch
                id="auto-start"
                checked={pomodoro.autoStart}
                onCheckedChange={pomodoro.setAutoStart}
                aria-labelledby="auto-start-heading auto-start-label"
              />
              <Label
                id="auto-start-label"
                htmlFor="auto-start"
                className="text-[15px] font-normal"
              >
                Next timer
              </Label>
            </div>
          </div>
        </section>

        <TasksSection pomodoro={pomodoro} />
      </div>
      {/* Its own block under Tasks, with more room above it than the cards
          above share, so it reads as the next thing rather than part of Tasks. */}
      <HomeOpenRooms className={`${contentColumn} mt-10`} />
      {discardDialog}
    </div>
  )
}
