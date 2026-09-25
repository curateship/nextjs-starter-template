import * as React from "react"
import { Link } from "@tanstack/react-router"
import { CheckIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { taskProgressLabel } from "@/lib/pomodoro/tasks"
import type { TimerMode } from "@/lib/pomodoro/timer"
import { usePomodoro } from "@/lib/pomodoro/use-pomodoro"

const modeLabels: Record<TimerMode, string> = {
  focus: "Focus",
  short: "Short break",
  long: "Long break",
}

// The old app's own words, kept letter for letter.
const modeHints: Record<TimerMode, string> = {
  focus: "Silence the noise. One task, nothing else, until the ring closes.",
  short: "Step away from the screen. Stretch, breathe, refill the glass.",
  long: "You earned it. A proper pause before the next block of four.",
}

const circumference = 2 * Math.PI * 132

/**
 * The timer, matched to the old app's dashboard side by side: the 300px
 * ring floating on the hero image with the muted mono digits and the dark
 * Start pill inside it, the pill-shaped mode tabs with the orange active
 * chip, the FOCUS TASK pill, the centred hint, the thin goal bar, and the
 * rounded tasks card below on the plain canvas.
 */
export function TimerDashboard() {
  const pomodoro = usePomodoro()
  const [taskTitle, setTaskTitle] = React.useState("")
  const minutes = Math.floor(pomodoro.remainingSeconds / 60)
  const seconds = pomodoro.remainingSeconds % 60
  const totalSeconds = pomodoro.timer.durationMinutes * 60
  const dashOffset =
    circumference * (1 - pomodoro.remainingSeconds / totalSeconds)
  const goalReached =
    pomodoro.todayFocusSessions >= pomodoro.dailyGoalSessions
  const completedTasks = pomodoro.tasks.filter((task) => task.completed).length

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
            <button
              className="grid size-11 place-items-center rounded-full border border-[rgba(var(--p-fg-rgb),0.14)] text-muted-foreground hover:border-[rgba(var(--p-fg-rgb),0.3)] hover:text-foreground"
              onClick={pomodoro.reset}
              aria-label="Reset timer"
            >
              <RotateCcwIcon className="size-[17px]" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          className="inline-flex gap-1 rounded-full border border-[rgba(var(--p-fg-rgb),0.07)] bg-[var(--p-canvas)] p-1"
          role="tablist"
          aria-label="Timer mode"
        >
          {(Object.keys(modeLabels) as TimerMode[]).map((mode) => (
            <button
              key={mode}
              role="tab"
              aria-selected={pomodoro.timer.mode === mode}
              className={cn(
                "rounded-full px-5 py-[9px] text-[13.5px] font-semibold text-muted-foreground",
                pomodoro.timer.mode === mode &&
                  "bg-[rgba(255,90,60,0.14)] text-[var(--p-accent-2)]"
              )}
              onClick={() => pomodoro.selectMode(mode)}
            >
              {modeLabels[mode]}
            </button>
          ))}
        </div>

        <div
          className="flex min-h-[42px] max-w-[min(520px,calc(100vw-36px))] items-center gap-2.5 rounded-[14px] border border-[rgba(var(--p-fg-rgb),0.1)] bg-[rgba(var(--p-canvas-rgb),0.75)] py-2 pl-3.5 pr-2.5"
          aria-live="polite"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {pomodoro.timer.mode === "focus" ? "Focus task" : "Next focus task"}
          </span>
          {pomodoro.selectedTask ? (
            <>
              <strong className="min-w-0 truncate text-[13.5px]">
                {pomodoro.selectedTask.title}
              </strong>
              <button
                className="ml-auto grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-[rgba(var(--p-fg-rgb),0.08)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                disabled={!pomodoro.canSelectTask}
                onClick={() => pomodoro.selectTask(null)}
                aria-label={`Clear selected task ${pomodoro.selectedTask.title}`}
              >
                <XIcon className="size-[13px]" aria-hidden="true" />
              </button>
            </>
          ) : (
            <Link
              to="/tasks"
              className="text-[13.5px] font-bold text-[var(--p-accent-2)]"
            >
              Choose a task
            </Link>
          )}
        </div>

        <p className="max-w-[380px] text-center text-[15.5px] leading-[1.55] text-[rgba(var(--p-text-rgb),0.65)]">
          {modeHints[pomodoro.timer.mode]}
        </p>
        {pomodoro.syncError ? (
          <p role="alert" className="text-center text-sm text-[var(--p-accent-2)]">
            {pomodoro.syncError}
          </p>
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
              completed today{goalReached ? " · Goal reached" : ""}
            </span>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {pomodoro.currentStreak} day streak · best {pomodoro.bestStreak}
          </span>
          <div className="flex items-center gap-2">
            <Switch
              id="auto-start"
              checked={pomodoro.autoStart}
              onCheckedChange={pomodoro.setAutoStart}
            />
            <Label htmlFor="auto-start">Auto-start next phase</Label>
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
          {!pomodoro.tasks.length ? (
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
                    "grid size-6 shrink-0 place-items-center rounded-full",
                    task.completed
                      ? "bg-[var(--p-success)] text-[var(--p-on-accent)]"
                      : "border-[1.5px] border-[rgba(var(--p-fg-rgb),0.25)] text-transparent"
                  )}
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
                  onClick={() => pomodoro.selectTask(task.id)}
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
                  className="grid size-[30px] shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-[rgba(var(--p-fg-rgb),0.08)] hover:text-foreground"
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
    </div>
  )
}
