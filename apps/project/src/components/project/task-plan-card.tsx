import * as React from "react"
import { Link } from "@tanstack/react-router"
import { HourglassIcon, XIcon } from "lucide-react"

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
import {
  findTasksToWaitFor,
  saveTask,
  setTaskRepeat,
  setTaskWaitingOn,
  type RepeatRule,
  type TaskChoice,
  type TaskDetail,
} from "@/lib/api/project/tasks"
import { dateFromKey, keyFromDate } from "@/lib/project/dates"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { WEEK_DAYS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

const NEVER = "never"

/**
 * When a task happens: whether it repeats, whether it's snoozed until a
 * later day, and what it waits on. Each saves the moment it changes.
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
  function save(next: RepeatRule | null) {
    return change(() => setTaskRepeat({ taskId, repeat: next }))
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="task-repeat">Repeat</Label>
      <Select
        value={repeat?.every ?? NEVER}
        disabled={disabled}
        onValueChange={(value) =>
          void save(
            value === NEVER
              ? null
              : value === "week"
                ? { every: "week", weekDays: [1] }
                : value === "month"
                  ? { every: "month", monthDay: 1 }
                  : { every: "workday" }
          )
        }
      >
        <SelectTrigger id="task-repeat" className="w-full sm:w-fit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NEVER}>Doesn't repeat</SelectItem>
          <SelectItem value="workday">Every work day</SelectItem>
          <SelectItem value="week">Every week</SelectItem>
          <SelectItem value="month">Every month</SelectItem>
        </SelectContent>
      </Select>
      {repeat?.every === "week" ? (
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
                    void save({ every: "week", weekDays: days })
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
      {repeat ? (
        <p className="text-xs text-muted-foreground">
          A fresh copy appears at midnight on the day, once this one is Done. Until then, no new
          copy is made.
        </p>
      ) : null}
    </div>
  )
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

  async function pick(choice: TaskChoice | null) {
    const ok = await change(() => setTaskWaitingOn(task.id, choice?.id ?? null))
    if (ok) {
      setPicking(false)
      setQuery("")
    }
  }

  return (
    <div className="grid gap-2">
      {/* Points at the field only when there is one to type in or press. */}
      <Label htmlFor={task.waitingOn && !picking ? undefined : "task-waiting-on"}>Waiting on</Label>
      {task.waitingOn && !picking ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <HourglassIcon className="size-4 text-muted-foreground" aria-hidden />
          <span className="min-w-0 break-words">
            {detail.waitingOnTitle ?? "1 task in another project"}
            {task.waitingOn.ready ? " · Done, so this one is ready to start" : ""}
          </span>
          {disabled ? null : (
            <Button type="button" variant="ghost" size="sm" onClick={() => void pick(null)}>
              <XIcon className="size-4" />
              Not waiting
            </Button>
          )}
        </div>
      ) : picking ? (
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
      ) : (
        <div>
          <Button
            id="task-waiting-on"
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => setPicking(true)}
          >
            <HourglassIcon className="size-4" />
            Pick a task it waits on
          </Button>
        </div>
      )}
    </div>
  )
}
