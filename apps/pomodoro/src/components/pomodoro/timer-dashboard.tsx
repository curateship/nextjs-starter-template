import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  CheckIcon,
  MaximizeIcon,
  MinusIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react"

import { useDiscardFocusConfirm } from "@/components/pomodoro/discard-focus-confirm"
import { SessionNotePrompt } from "@/components/pomodoro/session-note-prompt"
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
import { LoadingRow } from "@/components/ui/loading-row"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"
import {
  PAUSE_TO_CHOOSE_REASON,
  REOPEN_TO_FOCUS_REASON,
} from "@/lib/pomodoro/disabled-reasons"
import { BLANK_TASK_TITLE, taskProgressLabel } from "@/lib/pomodoro/tasks"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  cycleSessionLabel,
  MODE_LABELS,
  type TimerMode,
} from "@/lib/pomodoro/timer"
import {
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  usePomodoro,
} from "@/lib/pomodoro/use-pomodoro"

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
  "rounded-full border-[rgba(var(--p-fg-rgb),0.14)] bg-transparent text-muted-foreground hover:border-[rgba(var(--p-fg-rgb),0.3)] hover:bg-transparent hover:text-foreground dark:border-[rgba(var(--p-fg-rgb),0.14)] dark:bg-transparent dark:hover:bg-transparent"

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
          className="size-6 rounded-full text-muted-foreground hover:text-foreground"
          aria-label="Edit the daily session goal"
        >
          <PencilIcon className="size-3" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-60 gap-3 p-4">
        <strong className="text-sm font-semibold">Daily session goal</strong>
        <div className="flex items-center gap-2.5">
          <span className="mr-auto text-sm text-muted-foreground">Sessions</span>
          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-full"
            disabled={goal <= DAILY_GOAL_MIN}
            onClick={() => onChange(goal - 1)}
            aria-label="One session fewer"
          >
            <MinusIcon aria-hidden="true" />
          </Button>
          <b className="w-8 text-center font-mono text-[13px] font-normal tabular-nums">
            {goal}
          </b>
          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-full"
            disabled={goal >= DAILY_GOAL_MAX}
            onClick={() => onChange(goal + 1)}
            aria-label="One session more"
          >
            <PlusIcon aria-hidden="true" />
          </Button>
        </div>
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          What the bar above is measured against. Settings &rsaquo; Timer has
          the same number.
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
  const [taskTitle, setTaskTitle] = React.useState("")
  // Set by a blank submit and cleared by the next keystroke. The box keeps
  // whatever was in it either way.
  const [taskTitleInvalid, setTaskTitleInvalid] = React.useState(false)
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

  if (zen) return <ZenMode pomodoro={pomodoro} onLeave={leaveZen} />

  return (
    <div className="flex flex-col gap-8">
      <section className="mx-auto flex w-full max-w-[860px] flex-col items-center gap-9">
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
              className="mt-1.5 rounded-full border-[rgba(var(--p-fg-rgb),0.14)] bg-[var(--p-canvas)] px-[30px] text-[14.5px] font-bold hover:bg-[var(--p-surface-2)] dark:border-[rgba(var(--p-fg-rgb),0.14)] dark:bg-[var(--p-canvas)] dark:hover:bg-[var(--p-surface-2)]"
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

        <ModeTabs mode={pomodoro.timer.mode} onSelect={requestMode} />

        <SessionNotePrompt pomodoro={pomodoro} />

        {pomodoro.syncError ? (
          <InlineError className="text-center">
            {pomodoro.syncError}
          </InlineError>
        ) : null}

        <div className="flex w-full flex-col items-center gap-4 border-t border-[rgba(var(--p-fg-rgb),0.07)] pt-5">
          <div className="flex items-center justify-center gap-3">
            <span
              role="meter"
              aria-label={`${pomodoro.todayFocusSessions} of ${pomodoro.dailyGoalSessions} completed focus sessions`}
              aria-valuenow={Math.min(
                pomodoro.todayFocusSessions,
                pomodoro.dailyGoalSessions
              )}
              aria-valuemin={0}
              aria-valuemax={pomodoro.dailyGoalSessions}
              className="block h-2 w-[120px] overflow-hidden rounded-full bg-[rgba(var(--p-fg-rgb),0.12)]"
            >
              <span
                className="block h-full rounded-full bg-[var(--p-accent)]"
                style={{
                  width: `${Math.min(100, Math.round((pomodoro.todayFocusSessions / pomodoro.dailyGoalSessions) * 100))}%`,
                }}
              />
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {pomodoro.todayFocusSessions} of {pomodoro.dailyGoalSessions}{" "}
              sessions completed today{goalReached ? " · Goal reached" : ""}
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

      <section className="mx-auto w-full max-w-[860px] overflow-hidden rounded-3xl border border-[rgba(var(--p-fg-rgb),0.08)] bg-[var(--p-surface)]">
        <header className="flex items-center gap-3 border-b border-[rgba(var(--p-fg-rgb),0.07)] px-6 py-[18px]">
          <strong className="text-base tracking-tight">Tasks</strong>
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {completedTasks} / {pomodoro.tasks.length} done
          </span>
        </header>
        <div className="flex flex-col px-3 py-2">
          {/* Loading and empty mean opposite things, so the card says which
              one it is instead of claiming an empty list on every visit. */}
          {pomodoro.loading && !pomodoro.tasks.length ? (
            <LoadingRow label="Loading your tasks…" className="py-[18px]" />
          ) : null}
          {!pomodoro.loading &&
          !pomodoro.loadFailed &&
          !pomodoro.tasks.length ? (
            <p className="px-3 py-[18px] text-center text-[13.5px] text-muted-foreground">
              No active tasks.{" "}
              <Link
                to="/tasks"
                className="font-bold text-[var(--p-accent-2)]"
              >
                Create a task
              </Link>{" "}
              to focus on.
            </p>
          ) : null}
          {pomodoro.tasks.map((task) => {
            const selected = pomodoro.selectedTaskId === task.id
            const busy = pomodoro.taskBusy(task.id)
            return (
              <div
                key={task.id}
                className={cn(
                  "flex items-center gap-3.5 rounded-xl px-3 py-2.5 hover:bg-[rgba(var(--p-fg-rgb),0.04)]",
                  selected &&
                    "bg-[rgba(255,90,60,0.1)] shadow-[inset_3px_0_var(--p-accent)]"
                )}
              >
                <button
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-50",
                    focusRing,
                    task.completed
                      ? "bg-[var(--p-success)] text-[var(--p-on-accent)]"
                      : "border-[1.5px] border-[rgba(var(--p-fg-rgb),0.25)] text-transparent"
                  )}
                  disabled={busy}
                  onClick={() => pomodoro.toggleTask(task.id)}
                  aria-label={`${task.completed ? "Reopen" : "Complete"} ${task.title}`}
                >
                  {task.completed ? (
                    <CheckIcon
                      className="size-3"
                      strokeWidth={3.5}
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
                {/* Faded with no word was the commonest reason someone
                    thought the list was broken, so the reason rides with the
                    button. Wrapped only while it is off, and the wrapper is
                    what a keyboard lands on, because a disabled button cannot
                    take focus. */}
                <DisabledReason
                  className="min-w-0 flex-1"
                  disabled={task.completed || !pomodoro.canSelectTask}
                  reason={
                    task.completed
                      ? REOPEN_TO_FOCUS_REASON
                      : PAUSE_TO_CHOOSE_REASON
                  }
                >
                <button
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left",
                    focusRing
                  )}
                  disabled={task.completed || !pomodoro.canSelectTask}
                  aria-pressed={selected}
                  // Tapping the chosen task again clears it. It is the only
                  // way to focus on nothing now that the FOCUS TASK pill
                  // and its clear button are gone.
                  onClick={() => pomodoro.selectTask(selected ? null : task.id)}
                >
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[14.5px]",
                      task.completed &&
                        "text-muted-foreground line-through"
                    )}
                  >
                    {task.title}
                  </span>
                  <small className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {taskProgressLabel(task)}
                  </small>
                </button>
                </DisabledReason>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 rounded-full text-muted-foreground hover:bg-[rgba(var(--p-fg-rgb),0.08)] hover:text-foreground"
                  disabled={busy}
                  onClick={() => pomodoro.removeTask(task.id)}
                  aria-label={`Remove ${task.title}`}
                >
                  <XIcon className="size-[13px]" aria-hidden="true" />
                </Button>
              </div>
            )
          })}
        </div>
        <form
          className="flex items-center gap-3 border-t border-[rgba(var(--p-fg-rgb),0.07)] bg-[var(--p-surface-2)] px-6 py-3.5 text-muted-foreground"
          onSubmit={(event) => {
            event.preventDefault()
            if (!pomodoro.addTask(taskTitle)) {
              setTaskTitleInvalid(true)
              showErrorToast(BLANK_TASK_TITLE)
              return
            }
            setTaskTitle("")
          }}
        >
          <PlusIcon className="size-4 shrink-0" aria-hidden="true" />
          <input
            value={taskTitle}
            onChange={(event) => {
              setTaskTitle(event.target.value)
              setTaskTitleInvalid(false)
            }}
            aria-invalid={taskTitleInvalid || undefined}
            maxLength={160}
            placeholder="Add a task, press Enter…"
            aria-label="New task"
            className={cn(
              "h-8 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-1 text-[14.5px] text-foreground aria-invalid:ring-2 aria-invalid:ring-destructive/50",
              focusRing
            )}
          />
        </form>
      </section>
      {discardDialog}
    </div>
  )
}
