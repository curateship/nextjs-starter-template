import * as React from "react"
import { toast } from "sonner"
import { CheckIcon, PauseIcon, PlayIcon, TimerIcon } from "lucide-react"

import { RainbowEdge } from "@/components/project/rainbow-edge"
import type { Change } from "@/components/project/task-body"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { pauseTaskClock, setTaskClockTotal, startTaskClock } from "@/lib/api/project/clock"
import { saveTask, setStatus, type TaskCard, type TaskDetail } from "@/lib/api/project/tasks"
import {
  clockFace,
  clockSeconds,
  clockTotal,
  guessGap,
  parseMinutes,
  type TaskClock,
} from "@/lib/project/clock"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The task clock on screen (Tyler, 20 Oct 2026). How it works is in
 * `workspace/docs/task-clock.md`.
 */

/**
 * The time now, moving on each second while `on`, so a running clock ticks.
 * A paused clock doesn't read it, so it can be a second stale.
 */
function useTicking(on: boolean) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!on) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [on])
  return now
}

/** "0:42" while it runs, "2h 15m" while paused, nothing for a clock never started. */
export function ClockReadout({ clock, className }: { clock: TaskClock; className?: string }) {
  const running = Boolean(clock.runningSince)
  const seconds = clockSeconds(clock, useTicking(running))
  if (!running && seconds === 0) return null
  return (
    <span className={cn("text-sm tabular-nums", running ? "font-medium" : "text-muted-foreground", className)}>
      {running ? clockFace(seconds) : clockTotal(seconds)}
    </span>
  )
}

/**
 * The open task's footer, pinned to the panel's bottom: the status, the clock
 * with its guess, then Start or Pause (Start again on a Done task), and
 * Completed. Only the person assigned and the site admin get the clock's
 * buttons; everyone else sees the time and Completed.
 */
export function TaskClockFooter({
  detail,
  status,
  change,
  busy,
  readOnly,
}: {
  detail: TaskDetail
  /** The status dropdown, the same one the task used to have in its header. */
  status: React.ReactNode
  change: Change
  busy: boolean
  readOnly: boolean
}) {
  const { task } = detail
  const running = Boolean(task.clock.runningSince)
  const done = task.status === "done"
  const canRun = detail.canRunClock && !readOnly
  const [confirming, setConfirming] = React.useState(false)
  const stepsLeft = detail.steps.filter((step) => !step.done).length

  function start() {
    void change(async () => {
      const { pausedTitle } = await startTaskClock(task.id)
      if (pausedTitle) toast.success(`Paused the clock on ${pausedTitle}.`)
    })
  }

  function complete() {
    if (stepsLeft) {
      setConfirming(true)
      return
    }
    void finish()
  }

  async function finish() {
    const ok = await change(() => setStatus({ taskId: task.id, status: "done", stuckReason: null }), "Task completed.")
    if (ok) setConfirming(false)
  }

  return (
    // The buttons keep together at the right, and drop to a row of their own
    // together when the panel is too narrow for one row.
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t p-3">
      {status}
      <TimeMenu detail={detail} change={change} busy={busy} readOnly={readOnly} canFix={detail.canFixClock && !readOnly} />
      <div className="ml-auto flex items-center gap-2">
        {canRun ? (
          running ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void change(() => pauseTaskClock(task.id))}
            >
              <PauseIcon className="size-4" />
              Pause
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled={busy} onClick={start}>
              <PlayIcon className="size-4" />
              {done ? "Start again" : "Start"}
            </Button>
          )
        ) : null}
        {readOnly || done ? null : (
          <Button type="button" disabled={busy} onClick={complete}>
            <CheckIcon className="size-4" />
            Completed
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Mark it completed anyway?"
        description={`${stepsLeft} of ${detail.steps.length} steps aren't done.`}
        confirmLabel="Mark completed"
        destructive={false}
        loading={busy}
        onConfirm={() => void finish()}
      />
    </div>
  )
}

/**
 * The clock's time, and the guess against it ("20m over"). Pressed, it opens
 * the two boxes: Time spent, for the person assigned and the site admin to
 * correct, and Guess, for anyone on the project. Each saves when left or on
 * Enter.
 */
function TimeMenu({
  detail,
  change,
  busy,
  readOnly,
  canFix,
}: {
  detail: TaskDetail
  change: Change
  busy: boolean
  readOnly: boolean
  canFix: boolean
}) {
  const { task } = detail
  const running = Boolean(task.clock.runningSince)
  const seconds = clockSeconds(task.clock, useTicking(running))
  const [open, setOpen] = React.useState(false)
  const gap = task.guessMinutes ? guessGap(seconds, task.guessMinutes) : null
  const started = running || seconds > 0

  // Nothing to show and nothing to change: no button at all.
  if (!started && !task.guessMinutes && readOnly) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label={started ? `Time spent: ${clockTotal(seconds)}` : "Time and guess"}
          className={cn("gap-1.5 px-2", open && "bg-muted")}
        >
          <TimerIcon className="size-4 text-muted-foreground" />
          {started ? <ClockReadout clock={task.clock} className="text-foreground" /> : null}
          {gap ? (
            <span className={cn("text-xs", gap.endsWith("over") ? "text-destructive" : "text-muted-foreground")}>
              {gap}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={16} className="grid w-64 gap-4 p-3">
        <MinutesField
          id="task-time-spent"
          label="Time spent"
          minutes={Math.floor(seconds / 60)}
          disabled={!canFix || busy}
          max={LIMITS.clockSeconds / 60}
          placeholder="0m"
          note={running ? "Changing it pauses the clock." : null}
          onSave={(minutes) =>
            change(() => setTaskClockTotal(task.id, (minutes ?? 0) * 60), "Time changed.")
          }
        />
        <MinutesField
          id="task-guess"
          label="Guess"
          minutes={task.guessMinutes}
          disabled={readOnly || busy}
          max={LIMITS.guessMinutes}
          placeholder="45m"
          note={null}
          onSave={(minutes) => change(() => saveTask({ taskId: task.id, guessMinutes: minutes }))}
        />
      </PopoverContent>
    </Popover>
  )
}

/** A box for a length of time, typed as "45m", "1h 30m" or "1:30". Empty clears it. */
function MinutesField({
  id,
  label,
  minutes,
  disabled,
  max,
  placeholder,
  note,
  onSave,
}: {
  id: string
  label: string
  minutes: number | null
  disabled: boolean
  max: number
  placeholder: string
  note: string | null
  onSave: (minutes: number | null) => Promise<boolean>
}) {
  const shown = minutes ? clockTotal(minutes * 60) : ""
  const [text, setText] = React.useState(shown)
  const [invalid, setInvalid] = React.useState(false)
  // A new figure from the server replaces the box, unless it is being typed in.
  const [was, setWas] = React.useState(shown)
  if (was !== shown) {
    setWas(shown)
    setText(shown)
  }

  function save() {
    const typed = text.trim()
    const next = typed ? parseMinutes(typed) : null
    if (typed && (next === null || next > max)) {
      setInvalid(true)
      showErrorToast(next === null ? 'Type a length such as "45m", "1h 30m" or "1:30".' : "That's more than 999 hours.")
      return
    }
    setInvalid(false)
    if ((next ?? 0) === (minutes ?? 0)) {
      setText(shown)
      return
    }
    void onSave(next === 0 ? null : next)
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setText(event.target.value)
          setInvalid(false)
        }}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
      />
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}

/**
 * "Doing" in a moving rainbow after a task's title on the List, while its
 * clock runs (Tyler, 20 Oct 2026, `workspace/docs/assets/pasted-image-1792518621244475000.png`).
 */
export function ClockRunningChip({ task }: { task: TaskCard }) {
  if (!task.clock.runningSince) return null
  return (
    <RainbowEdge className="rounded-full">
      <span className="relative rounded-full bg-background px-2 text-xs leading-5 font-medium">Doing</span>
    </RainbowEdge>
  )
}

/** The running clock on a My tasks row, with its Pause. Nothing while the clock is paused. */
export function RowClock({ task, onPause }: { task: TaskCard; onPause: (task: TaskCard) => void }) {
  if (!task.clock.runningSince) return null
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5">
      <ClockReadout clock={task.clock} className="text-xs" />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Pause the clock on ${task.title}`}
        onClick={() => onPause(task)}
      >
        <PauseIcon className="size-3.5" />
      </Button>
    </span>
  )
}
