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
import { SessionNotePrompt } from "@/components/pomodoro/session-note-prompt"
import {
  NewTaskForm,
  TodayTaskList,
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
import { Meter } from "@/components/ui/meter"
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
import { cn } from "@/lib/utils"
import { contentColumn } from "@/lib/pomodoro/content-column"

const circumference = 2 * Math.PI * 132

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
    <Tabs value={mode} onValueChange={(value) => onSelect(value as TimerMode)}>
      <TabsList aria-label="Timer mode">
        {(Object.keys(MODE_LABELS) as TimerMode[]).map((key) => (
          <TabsTrigger key={key} value={key}>
            {MODE_LABELS[key]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

/**
 * The two round buttons under Start. 36px, the largest height the rulebook
 * allows, because they sit inside the ring where a 32px control looks lost;
 * they were 44px, which is not one of the four.
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
          className="size-6 text-muted-foreground hover:text-foreground"
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
          What the bar above is measured against.{" "}
          <TextLink to="/settings">Settings &rsaquo; Timer</TextLink> has the
          same number.
        </p>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The timer, matched to the old app's dashboard side by side: the 300px
 * ring floating on the hero image with the muted mono digits and the dark
 * Start pill inside it, the pill-shaped mode tabs with the orange active
 * chip, the FOCUS TASK pill, the centred hint, the thin goal bar, and the
 * rounded tasks card below on the plain canvas.
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
  const completedTasks = pomodoro.tasks.filter((task) => task.completed).length
  // The same toggle the break's play button and the Start pill call, here and
  // in zen mode alike, which is why it lives above the early return.
  useSpaceToggle(pomodoro.toggleTimer)

  if (zen) return <ZenMode pomodoro={pomodoro} onLeave={leaveZen} />

  return (
    <div className="flex flex-col gap-8">
      <section className={`${contentColumn} flex flex-col items-center gap-9`}>
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
              r="132"
              fill="none"
              stroke="rgba(var(--p-fg-rgb), 0.07)"
              strokeWidth="10"
            />
            <circle
              cx="150"
              cy="150"
              r="132"
              fill="none"
              stroke={
                pomodoro.timer.running ? "var(--p-success)" : "var(--p-accent)"
              }
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 150 150)"
              style={{
                transition: "stroke-dashoffset .9s linear, stroke .2s ease",
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
            <time className="font-mono text-[54px] font-medium leading-none tracking-tight opacity-65">
              {String(minutes).padStart(2, "0")}:
              {String(seconds).padStart(2, "0")}
            </time>
            {/* The shared Button at its 36px size, which is where the
                Pomoder pill already sat; the skin is the `--p-*` tokens on
                top of it. Shared rather than hand-rolled so the keyboard
                focus ring is the one every other button draws. */}
            <Button
              size="lg"
              variant="outline"
              className="mt-1.5 bg-[var(--p-canvas)] px-[30px] text-[14.5px] hover:bg-[var(--p-surface-2)] dark:border-border dark:bg-[var(--p-canvas)] dark:hover:bg-[var(--p-surface-2)]"
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
            <div className="flex items-center gap-2.5">
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
          </div>
        </div>

        {/* Only where there is a keyboard to press it on. */}
        <span className="hidden font-mono text-xs text-muted-foreground pointer-fine:inline">
          Space to {pomodoro.timer.running ? "pause" : "start"}
        </span>

        <ModeTabs mode={pomodoro.timer.mode} onSelect={requestMode} />

        <SessionNotePrompt pomodoro={pomodoro} />

        {pomodoro.syncError ? (
          <InlineError className="text-center">
            {pomodoro.syncError}
          </InlineError>
        ) : null}

        <div className="flex w-full flex-col items-center gap-4 border-t pt-5">
          <div className="flex items-center justify-center gap-3">
            <Meter
              label="Today's daily goal"
              value={pomodoro.todayFocusSessions}
              max={pomodoro.dailyGoalSessions}
              valueText={`${pomodoro.todayFocusSessions} of ${pomodoro.dailyGoalSessions} ${plural(pomodoro.dailyGoalSessions, "session")}${goalReached ? ", goal reached" : ""}`}
              // The bar turns to the success colour once the goal is met, so
              // the line under it is not the only sign. The colour is set on
              // the fill, which the shared Meter draws as its one child.
              className={cn(
                "h-2 w-[120px]",
                goalReached && "[&>div]:bg-[var(--p-success)]"
              )}
            />
            <span className="font-mono text-xs text-muted-foreground">
              {pomodoro.todayFocusSessions} of {pomodoro.dailyGoalSessions}{" "}
              {plural(pomodoro.dailyGoalSessions, "session")} completed today
              {goalReached ? (
                // Darker than the grey line, not green: the light theme's
                // green is under 4.5:1 on white at this size.
                <span className="font-semibold text-foreground">
                  {" "}
                  · Goal reached
                </span>
              ) : null}
            </span>
            <DailyGoalEditor
              goal={pomodoro.dailyGoalSessions}
              onChange={pomodoro.setDailyGoal}
            />
          </div>
          {/* Where this rhythm's long break is. Same mono treatment as the
              goal and streak lines, and the same words the room cards use. */}
          <span className="font-mono text-xs text-muted-foreground">
            {cycleSessionLabel(
              pomodoro.timer.mode,
              pomodoro.cycleFocusSessions,
              pomodoro.sessionsBeforeLongBreak
            )}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {pomodoro.currentStreak} day streak · best {pomodoro.bestStreak}
          </span>
          <div className="flex items-center gap-2">
            <Switch
              id="auto-start"
              checked={pomodoro.autoStart}
              onCheckedChange={pomodoro.setAutoStart}
            />
            <Label htmlFor="auto-start">Auto-start the next timer</Label>
          </div>
        </div>
      </section>

      <section className={`${contentColumn} overflow-hidden rounded-3xl border bg-[var(--p-surface)]`}>
        <header className="flex items-center gap-3 border-b px-6 py-[18px]">
          <strong className="text-base tracking-tight">Tasks</strong>
          {/* Waits for the first task, the same as the Tasks page. */}
          {pomodoro.tasks.length ? (
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {completedTasks} / {pomodoro.tasks.length} done
            </span>
          ) : null}
        </header>
        {/* The same list and the same add box as the Tasks page, without
            the drag handles: the day is planned there, and focused on here. */}
        <div className="flex flex-col gap-3 px-3 py-3">
          <TodayTaskList pomodoro={pomodoro} />
          <NewTaskForm onAdd={pomodoro.addTask} />
        </div>
      </section>
      {discardDialog}
    </div>
  )
}
