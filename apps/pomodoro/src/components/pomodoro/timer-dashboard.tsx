import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  CheckIcon,
  MaximizeIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react"

import { useDiscardFocusConfirm } from "@/components/pomodoro/discard-focus-confirm"
import { SessionNotePrompt } from "@/components/pomodoro/session-note-prompt"
import { ZenMode } from "@/components/pomodoro/zen-mode"
import { Button } from "@/components/ui/button"
import { InlineError } from "@/components/ui/inline-error"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { LoadingRow } from "@/components/ui/loading-row"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { taskProgressLabel } from "@/lib/pomodoro/tasks"
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
 * The three mode tabs, with the orange chip sliding from one to the next
 * instead of blinking out and in. The chip is one absolutely positioned
 * layer behind the labels; its left and width are measured from the live
 * buttons, because the three labels are different widths and the font
 * arrives after the first paint. A ResizeObserver re-measures when the row
 * reflows, and the chip only animates once it has been placed, so the first
 * paint does not slide it in from the left edge.
 */
function ModeTabs({
  mode,
  onSelect,
}: {
  mode: TimerMode
  onSelect: (mode: TimerMode) => void
}) {
  const row = React.useRef<HTMLDivElement>(null)
  const [chip, setChip] = React.useState<{ left: number; width: number } | null>(
    null
  )

  React.useLayoutEffect(() => {
    const element = row.current
    if (!element) return
    const measure = () => {
      const active = element.querySelector<HTMLElement>('[aria-selected="true"]')
      if (!active) return
      const next = { left: active.offsetLeft, width: active.offsetWidth }
      // Same numbers, same object: a re-render on every observer callback
      // would be wasted work, and the observer fires on every reflow.
      setChip((chip) =>
        chip && chip.left === next.left && chip.width === next.width
          ? chip
          : next
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [mode])

  return (
    <div
      ref={row}
      className="relative inline-flex gap-1 rounded-full border border-[rgba(var(--p-fg-rgb),0.07)] bg-[var(--p-canvas)] p-1"
      role="tablist"
      aria-label="Timer mode"
    >
      {chip ? (
        <span
          className="absolute inset-y-1 rounded-full bg-[rgba(255,90,60,0.14)] transition-[left,width] duration-300 ease-out motion-reduce:transition-none"
          style={{ left: chip.left, width: chip.width }}
          aria-hidden="true"
        />
      ) : null}
      {(Object.keys(MODE_LABELS) as TimerMode[]).map((key) => (
        <button
          key={key}
          role="tab"
          aria-selected={mode === key}
          className={cn(
            "relative rounded-full px-5 py-[9px] text-[13.5px] font-semibold text-muted-foreground transition-colors duration-300",
            mode === key && "text-[var(--p-accent-2)]"
          )}
          onClick={() => onSelect(key)}
        >
          {MODE_LABELS[key]}
        </button>
      ))}
    </div>
  )
}

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
        <div className="relative size-[300px]">
          <svg
            width="300"
            height="300"
            viewBox="0 0 300 300"
            aria-hidden="true"
          >
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
            <button
              className="mt-1.5 rounded-full border border-[rgba(var(--p-fg-rgb),0.14)] bg-[var(--p-canvas)] px-[30px] py-3 text-[14.5px] font-bold hover:bg-[var(--p-surface-2)]"
              onClick={pomodoro.toggleTimer}
            >
              {pomodoro.timer.running ? "Pause" : "Start"}
            </button>
            <div className="flex items-center gap-2.5">
              <button
                className="grid size-11 place-items-center rounded-full border border-[rgba(var(--p-fg-rgb),0.14)] text-muted-foreground hover:border-[rgba(var(--p-fg-rgb),0.3)] hover:text-foreground"
                onClick={requestReset}
                aria-label="Reset timer"
              >
                <RotateCcwIcon className="size-[17px]" aria-hidden="true" />
              </button>
              {/* The one icon on this screen whose picture does not say what
                  it does, so it keeps a tooltip while Reset does not. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    ref={zenButton}
                    className="grid size-11 place-items-center rounded-full border border-[rgba(var(--p-fg-rgb),0.14)] text-muted-foreground hover:border-[rgba(var(--p-fg-rgb),0.3)] hover:text-foreground"
                    onClick={() => setZen(true)}
                    aria-label="Enter zen mode"
                  >
                    <MaximizeIcon className="size-[17px]" aria-hidden="true" />
                  </button>
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
                <button
                  className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left disabled:cursor-default"
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
                <button
                  className="grid size-[30px] shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-[rgba(var(--p-fg-rgb),0.08)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy}
                  onClick={() => pomodoro.removeTask(task.id)}
                  aria-label={`Remove ${task.title}`}
                >
                  <XIcon className="size-[13px]" aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
        <form
          className="flex items-center gap-3 border-t border-[rgba(var(--p-fg-rgb),0.07)] bg-[var(--p-surface-2)] px-6 py-3.5 text-muted-foreground"
          onSubmit={(event) => {
            event.preventDefault()
            pomodoro.addTask(taskTitle)
            setTaskTitle("")
          }}
        >
          <PlusIcon className="size-4 shrink-0" aria-hidden="true" />
          <input
            value={taskTitle}
            onChange={(event) => setTaskTitle(event.target.value)}
            maxLength={160}
            placeholder="Add a task, press Enter…"
            aria-label="New task"
            className="min-w-0 flex-1 border-0 bg-transparent py-2 text-[14.5px] text-foreground outline-none"
          />
        </form>
      </section>
      {discardDialog}
    </div>
  )
}
