import * as React from "react"
import { Link } from "@tanstack/react-router"
import { BellRingIcon, CheckIcon, HourglassIcon, PlusIcon, XIcon } from "lucide-react"

import type { Change } from "@/components/project/task-body"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { addTaskWait, removeTaskWait, setReminder } from "@/lib/api/project/planning"
import { saveTaskMilestone } from "@/lib/api/project/projects"
import {
  findTasksToWaitFor,
  saveTask,
  setTaskRepeat,
  type RepeatInput,
  type RepeatRule,
  type TaskChoice,
  type TaskDetail,
} from "@/lib/api/project/tasks"
import { dateFromKey, keyFromDate, todayKey } from "@/lib/project/dates"
import { addDays, dayLabel, shortDayLabel, weekdayOf } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS, WEEK_DAYS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const NEVER = "never"

const NO_MILESTONE = "none"

/**
 * The one milestone this task counts toward. Shown once the project has
 * milestones; they are made on the project's details panel.
 */
function MilestoneField({
  detail,
  disabled,
  change,
}: {
  detail: TaskDetail
  disabled: boolean
  change: Change
}) {
  if (detail.milestones.length === 0) return null
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor="task-milestone">Milestone</Label>
      <Select
        value={detail.milestoneId ?? NO_MILESTONE}
        disabled={disabled}
        onValueChange={(next) =>
          void change(() => saveTaskMilestone(detail.task.id, next === NO_MILESTONE ? null : next))
        }
      >
        <SelectTrigger id="task-milestone" className="w-full sm:w-fit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_MILESTONE}>No milestone</SelectItem>
          {detail.milestones.map((milestone) => (
            <SelectItem key={milestone.id} value={milestone.id}>
              {milestone.name}
              {milestone.dueDate ? ` · ${dayLabel(milestone.dueDate)}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * When a task happens: its milestone, whether it repeats, whether it's snoozed until a
 * later day, what it waits on, and my own reminder. Each saves the moment it
 * changes.
 */
export function TaskPlanCard({
  detail,
  readOnly,
  busy,
  change,
}: {
  detail: TaskDetail
  readOnly: boolean
  busy: boolean
  change: Change
}) {
  const { task } = detail
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Plan</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <MilestoneField detail={detail} disabled={readOnly || busy} change={change} />
        <RepeatField taskId={task.id} repeat={task.repeat} disabled={readOnly || busy} change={change} />
        <div className="grid content-start gap-2">
          <Label htmlFor="task-snooze">Snooze until</Label>
          <div className="flex flex-wrap items-center gap-2">
            <DatePicker
              id="task-snooze"
              value={dateFromKey(task.snoozedUntil)}
              placeholder="Not snoozed"
              disabled={readOnly || busy}
              onChange={(date) =>
                void change(() => saveTask({ taskId: task.id, snoozedUntil: keyFromDate(date) }))
              }
            />
            {task.snoozedUntil && !readOnly ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void change(() => saveTask({ taskId: task.id, snoozedUntil: null }))}
              >
                Wake it now
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Out of the check-in and My tasks until the morning of that day.
          </p>
        </div>
        <WaitingOnField detail={detail} disabled={readOnly || busy} change={change} />
        {detail.myReminder ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <BellRingIcon className="size-4 text-muted-foreground" aria-hidden />
            <span>Reminding you on {shortDayLabel(detail.myReminder)}, at your check-in time.</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void change(() => setReminder(task.id, null), "Reminder taken off.")}
            >
              <XIcon className="size-4" />
              Take it off
            </Button>
          </div>
        ) : null}
        {detail.holdingUp.tasks.length || detail.holdingUp.elsewhere ? (
          <p className="text-sm text-muted-foreground">
            Holding up:{" "}
            {detail.holdingUp.tasks.map((other, index) => (
              <React.Fragment key={other.id}>
                {index ? ", " : null}
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: other.projectId }}
                  search={{ task: other.id }}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {other.title}
                </Link>
              </React.Fragment>
            ))}
            {detail.holdingUp.elsewhere
              ? `${detail.holdingUp.tasks.length ? ", " : ""}${detail.holdingUp.elsewhere} ${
                  detail.holdingUp.elsewhere === 1 ? "task" : "tasks"
                } in another project`
              : ""}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function RepeatField({
  taskId,
  repeat,
  disabled,
  change,
}: {
  taskId: string
  repeat: RepeatRule | null
  disabled: boolean
  change: Change
}) {
  function save(next: RepeatInput | null) {
    return change(() => setTaskRepeat({ taskId, repeat: next }))
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="task-repeat">Repeat</Label>
      <Select
        value={repeat?.every ?? NEVER}
        disabled={disabled}
        onValueChange={(value) => void save(value === NEVER ? null : startingRule(value as RepeatRule["every"]))}
      >
        <SelectTrigger id="task-repeat" className="w-full sm:w-fit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NEVER}>Doesn't repeat</SelectItem>
          <SelectItem value="workday">Every work day</SelectItem>
          <SelectItem value="week">Every week</SelectItem>
          <SelectItem value="two_weeks">Every 2 weeks</SelectItem>
          <SelectItem value="month">Every month</SelectItem>
          <SelectItem value="quarter">Every 3 months</SelectItem>
          <SelectItem value="last_workday">Last work day of the month</SelectItem>
        </SelectContent>
      </Select>
      {repeat?.every === "week" || repeat?.every === "two_weeks" ? (
        <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
          <legend className="sr-only">On these days</legend>
          {WEEK_DAYS.map(({ day, short }) => {
            const id = `repeat-day-${day}`
            const on = repeat.weekDays.includes(day)
            return (
              <div key={day} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={on}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    const days = checked
                      ? [...repeat.weekDays, day]
                      : repeat.weekDays.filter((d) => d !== day)
                    if (days.length === 0) {
                      showErrorToast("Pick at least one day of the week.")
                      return
                    }
                    void save({ every: repeat.every, weekDays: days })
                  }}
                />
                <Label htmlFor={id} className="font-normal">
                  {short}
                </Label>
              </div>
            )
          })}
        </fieldset>
      ) : null}
      {repeat?.every === "month" ? (
        <div className="flex items-center gap-2 text-sm">
          <Label htmlFor="repeat-month-day" className="font-normal">
            On day
          </Label>
          <Select
            value={String(repeat.monthDay)}
            disabled={disabled}
            onValueChange={(value) => void save({ every: "month", monthDay: Number(value) })}
          >
            <SelectTrigger id="repeat-month-day" className="w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <SelectItem key={day} value={String(day)}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">of each month, or its last day</span>
        </div>
      ) : null}
      {repeat?.every === "two_weeks" ? (
        <p className="text-xs text-muted-foreground">
          The week of {dayLabel(mondayOf(repeat.from))} counts as the first, then every other week.
        </p>
      ) : null}
      {repeat?.every === "quarter" ? (
        <div className="grid gap-2">
          <Label htmlFor="repeat-quarter-from" className="font-normal">
            First date
          </Label>
          <DatePicker
            id="repeat-quarter-from"
            value={dateFromKey(repeat.from)}
            disabled={disabled}
            onChange={(date) => {
              const from = keyFromDate(date)
              if (from) void save({ every: "quarter", from })
            }}
          />
          <p className="text-xs text-muted-foreground">{quarterWords(repeat.from)}</p>
        </div>
      ) : null}
      {repeat?.every === "last_workday" ? (
        <p className="text-xs text-muted-foreground">The team's last work day of each month.</p>
      ) : null}
      {repeat ? (
        <p className="text-xs text-muted-foreground">
          A fresh copy appears at midnight on the day, once this one is Done. Until then, no new
          copy is made.
        </p>
      ) : null}
    </div>
  )
}

/** What a repeat starts as when it is picked, before its days or date are changed. */
function startingRule(every: RepeatRule["every"]): RepeatInput {
  switch (every) {
    case "week":
    case "two_weeks":
      return { every, weekDays: [1] }
    case "month":
      return { every, monthDay: 1 }
    case "quarter":
      return { every, from: todayKey() }
    default:
      return { every }
  }
}

function mondayOf(day: string) {
  return addDays(day, -((weekdayOf(day) + 6) % 7))
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "Comes back on the 15th of Jan, Apr, Jul and Oct." */
function quarterWords(from: string) {
  const [, month, day] = from.split("-").map(Number)
  const months = [0, 3, 6, 9].map((step) => (month - 1 + step) % 12).sort((a, b) => a - b)
  const names = months.map((index) => MONTH_NAMES[index])
  const last = day > 28 ? ", or the month's last day" : ""
  return `Comes back on the ${ordinal(day)} of ${names.slice(0, 3).join(", ")} and ${names[3]}${last}.`
}

function ordinal(day: number) {
  const tens = day % 100
  if (tens >= 11 && tens <= 13) return `${day}th`
  return `${day}${["th", "st", "nd", "rd"][day % 10] ?? "th"}`
}

function WaitingOnField({
  detail,
  disabled,
  change,
}: {
  detail: TaskDetail
  disabled: boolean
  change: Change
}) {
  const { task } = detail
  const [query, setQuery] = React.useState("")
  const [picking, setPicking] = React.useState(false)
  const [tries, setTries] = React.useState(0)
  // Each answer carries the search it answers, so a search still out reads as
  // Searching… rather than as the last search's result.
  const searchKey = `${tries}:${query}`
  const [found, setFound] = React.useState<
    { key: string; choices: TaskChoice[] } | { key: string; error: string } | null
  >(null)
  const answer = found?.key === searchKey ? found : null

  React.useEffect(() => {
    if (!picking) return
    let live = true
    const timer = setTimeout(() => {
      findTasksToWaitFor(task.id, query).then(
        (choices) => live && setFound({ key: searchKey, choices }),
        (error: unknown) => live && setFound({ key: searchKey, error: getProjectErrorMessage(error) })
      )
    }, 200)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [picking, query, searchKey, task.id])

  async function pick(choice: TaskChoice) {
    const ok = await change(() => addTaskWait(task.id, choice.id))
    if (ok) {
      setPicking(false)
      setQuery("")
    }
  }

  const waits = detail.waitingOn
  const full = waits.length >= LIMITS.waitsPerTask
  return (
    <div className="grid gap-2">
      {/* Points at the field only when there is one to type in or press. */}
      <Label htmlFor={picking || (!full && !disabled) ? "task-waiting-on" : undefined}>Waiting on</Label>
      {waits.length ? (
        <ul className="grid gap-1">
          {waits.map((wait) => (
            <li key={wait.id} className="flex items-center gap-2 text-sm">
              {wait.done ? (
                <CheckIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Done" />
              ) : (
                <HourglassIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Not done yet" />
              )}
              {wait.title && wait.projectId ? (
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: wait.projectId }}
                  search={{ task: wait.id }}
                  className={cn(
                    "min-w-0 flex-1 break-words underline-offset-4 hover:underline",
                    wait.done && "text-muted-foreground line-through"
                  )}
                >
                  {wait.title}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 text-muted-foreground">1 task in another project</span>
              )}
              {disabled ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Stop waiting on ${wait.title ?? "that task"}`}
                  onClick={() => void change(() => removeTaskWait(task.id, wait.id))}
                >
                  <XIcon className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {waits.length && task.waitingOn?.ready ? (
        <p className="text-sm text-muted-foreground">
          {waits.length === 1 ? "It's Done" : "They're all Done"}, so this one is ready to start.
        </p>
      ) : null}
      {picking ? null : full ? (
        <p className="text-xs text-muted-foreground">
          That's the most, {LIMITS.waitsPerTask}. Take one off to add another.
        </p>
      ) : disabled ? (
        waits.length ? null : <p className="text-sm text-muted-foreground">Not waiting on anything.</p>
      ) : (
        <div>
          <Button id="task-waiting-on" type="button" variant="outline" onClick={() => setPicking(true)}>
            <PlusIcon className="size-4" />
            {waits.length ? "Add another task" : "Pick a task it waits on"}
          </Button>
        </div>
      )}
      {picking ? (
        <div className="grid gap-2">
          <Input
            id="task-waiting-on"
            value={query}
            placeholder="Search tasks by title"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
          {answer === null ? (
            <LoadingRow label="Searching…" />
          ) : "error" in answer ? (
            <ErrorRow message={answer.error} className="py-4" onRetry={() => setTries((n) => n + 1)} />
          ) : answer.choices.length ? (
            <ul className="grid gap-1">
              {answer.choices.map((choice) => (
                <li key={choice.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start py-1.5 text-left"
                    onClick={() => void pick(choice)}
                  >
                    <span className="grid min-w-0">
                      <span className="truncate">{choice.title}</span>
                      <span className="truncate text-xs text-muted-foreground">{choice.projectName}</span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No tasks match.</p>
          )}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setPicking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
