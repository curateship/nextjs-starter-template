import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { CheckCheckIcon, CircleAlertIcon, ClockIcon, Loader2Icon, PlusIcon } from "lucide-react"

import {
  DueDate,
  PickedDaysBadge,
  ProjectDot,
  StatusBadge,
  StepsCount,
  WaitingBadge,
} from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  checkIn,
  pickTask,
  unpickTask,
  type CheckinPage,
} from "@/lib/api/project/checkins"
import { createProjectTask, setStatus, type TaskCard } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { clockIn, clockLabel, longDayLabel, shortDayLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const authenticatedRoute = getRouteApi("/_authenticated")

type Answer = { action: "carry" | "drop"; reason: string }

/**
 * The morning check-in, a window opened from My dashboard. Tasks left over
 * from the last check-in come first and each must be carried over or dropped
 * with a reason. Below them, the person ticks what they'll work on today.
 * Once checked in, ticking and unticking changes today's picks straight away,
 * so the window then ends with Done.
 */
export function CheckinDialog({
  page,
  open,
  onClose,
}: {
  page: CheckinPage
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const me = authenticatedRoute.useLoaderData().user
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const checkedIn = Boolean(page.checkin)
  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set())
  const [answers, setAnswers] = React.useState<Record<string, Answer>>({})
  const [missing, setMissing] = React.useState<Set<string>>(() => new Set())

  // Each opening starts clean, so a closed check-in leaves nothing behind.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setTicked(new Set())
      setAnswers({})
      setMissing(new Set())
    }
  }

  const leftovers = page.leftovers?.tasks ?? []
  // Before checking in the ticks are this window's own; after, they are the saved picks.
  const picked = checkedIn ? new Set(page.pickedTaskIds) : ticked
  const dirty = !checkedIn && (ticked.size > 0 || Object.keys(answers).length > 0)

  async function toggle(task: TaskCard, on: boolean) {
    if (!checkedIn) {
      setTicked((current) => {
        const next = new Set(current)
        if (on) next.add(task.id)
        else next.delete(task.id)
        return next
      })
      return
    }
    const ok = await run(() => (on ? pickTask(task.id) : unpickTask(task.id)))
    if (ok) await router.invalidate()
  }

  function answer(taskId: string, next: Answer) {
    setAnswers((current) => ({ ...current, [taskId]: next }))
    setMissing((current) => {
      if (!current.has(taskId)) return current
      const rest = new Set(current)
      rest.delete(taskId)
      return rest
    })
  }

  async function submit() {
    const unanswered = leftovers.filter((task) => {
      const given = answers[task.id]
      return !given || (given.action === "drop" && !given.reason.trim())
    })
    if (unanswered.length) {
      setMissing(new Set(unanswered.map((task) => task.id)))
      showErrorToast(
        unanswered.length === 1
          ? "One task from your last check-in still needs an answer: carry it over, or drop it with a reason."
          : `${unanswered.length} tasks from your last check-in still need an answer: carry each over, or drop it with a reason.`
      )
      return
    }
    const ok = await run(
      () =>
        checkIn({
          answers: leftovers.map((task) => {
            const given = answers[task.id]
            return given.action === "drop"
              ? { taskId: task.id, action: "drop" as const, reason: given.reason.trim() }
              : { taskId: task.id, action: "carry" as const }
          }),
          picks: [...ticked],
        }),
      "Checked in."
    )
    if (!ok) return
    await router.invalidate()
    onClose()
  }

  const carrying = leftovers.filter((task) => answers[task.id]?.action === "carry").length
  const total = ticked.size + carrying

  return (
    <FormDialog open={open} dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Check in · {longDayLabel(page.today.day)}</DialogTitle>
            <DialogDescription>
              <StatusLine page={page} />
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {page.leftovers && !checkedIn ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>From your last check-in · {shortDayLabel(page.leftovers.day)}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      These weren't finished. Carry each one over to today, or drop it and say why.
                    </p>
                    {/* Answers every one still open; drops already given stay as they are. */}
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={() =>
                        setAnswers((current) => {
                          const next = { ...current }
                          for (const task of leftovers) {
                            if (!next[task.id]) next[task.id] = { action: "carry", reason: "" }
                          }
                          return next
                        })
                      }
                    >
                      <CheckCheckIcon className="size-4" />
                      Carry all over
                    </Button>
                  </div>
                  <ul className="grid gap-3">
                    {leftovers.map((task) => (
                      <LeftoverRow
                        key={task.id}
                        task={task}
                        value={answers[task.id]}
                        invalid={missing.has(task.id)}
                        onChange={(next) => answer(task.id, next)}
                      />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            {checkedIn && page.answers.length ? <MorningAnswers answers={page.answers} /> : null}

            <Card size="sm">
              <CardHeader>
                <CardTitle>
                  {checkedIn
                    ? `Today's tasks · ${page.pickedTaskIds.length} picked`
                    : "Pick today's tasks"}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5">
                {page.groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing is assigned to you right now. Add a task for yourself below, or check in
                    with nothing picked.
                  </p>
                ) : (
                  page.groups.map((group) => (
                    <section key={group.project.id} className="grid gap-2" aria-label={group.project.name}>
                      <h3 className="flex items-center gap-2 text-sm font-medium">
                        <ProjectDot color={group.project.color} />
                        {group.project.name}
                      </h3>
                      <ul className="grid gap-2">
                        {group.tasks.map((task) => (
                          <PickRow
                            key={task.id}
                            task={task}
                            checked={picked.has(task.id)}
                            busy={busy}
                            onToggle={(on) => void toggle(task, on)}
                          />
                        ))}
                      </ul>
                    </section>
                  ))
                )}
                <AddTaskRow
                  projects={page.projects}
                  myUserId={me.id}
                  onAdded={async (taskId) => {
                    if (checkedIn) await run(() => pickTask(taskId))
                    else setTicked((current) => new Set(current).add(taskId))
                    await router.invalidate()
                  }}
                />
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            {checkedIn ? (
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            ) : (
              <>
                <span className="mr-auto self-center text-sm text-muted-foreground">
                  {total === 0
                    ? "Nothing picked yet"
                    : `${total} ${total === 1 ? "task" : "tasks"} for today`}
                </span>
                <Button type="button" variant="outline" onClick={requestClose}>
                  Cancel
                </Button>
                <Button type="button" disabled={busy} onClick={() => void submit()}>
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Check in
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** Where today's check-in stands, in one sentence. */
export function StatusLine({ page }: { page: CheckinPage }) {
  const { clock, today, checkin } = page
  const time = clockLabel(clock.time)
  if (checkin) {
    return (
      <span>
        You checked in at {clockIn(checkin.checkedInAt, clock.zone)}.
        {checkin.late ? ` That was late: your check-in time is ${time}.` : ""} You can still
        change today's picks.
      </span>
    )
  }
  if (today.away) {
    return <span>You're away today. You can still check in if you're working.</span>
  }
  if (!today.workDay) {
    return <span>Today is a day off for your team. You can still check in if you're working.</span>
  }
  return (
    <span>
      Your check-in time today is {time}.
      {today.pastDue ? " It's past that, so this check-in will show as late." : ""}
    </span>
  )
}

function LeftoverRow({
  task,
  value,
  invalid,
  onChange,
}: {
  task: TaskCard
  value: Answer | undefined
  invalid: boolean
  onChange: (next: Answer) => void
}) {
  const reasonId = `drop-reason-${task.id}`
  return (
    <li
      className={cn(
        "grid gap-3 rounded-lg border p-3",
        invalid && "border-destructive"
      )}
      data-invalid={invalid || undefined}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <span className="font-medium break-words">{task.title}</span>
          <TaskMeta task={task} showProject />
        </div>
        <div className="flex shrink-0 gap-2" role="group" aria-label={`What to do with ${task.title}`}>
          <Button
            type="button"
            variant={value?.action === "carry" ? "default" : "outline"}
            aria-pressed={value?.action === "carry"}
            onClick={() => onChange({ action: "carry", reason: "" })}
          >
            Carry over
          </Button>
          <Button
            type="button"
            variant={value?.action === "drop" ? "default" : "outline"}
            aria-pressed={value?.action === "drop"}
            onClick={() => onChange({ action: "drop", reason: value?.reason ?? "" })}
          >
            Drop
          </Button>
        </div>
      </div>
      {value?.action === "drop" ? (
        <div className="grid gap-2">
          <Label htmlFor={reasonId}>Why are you dropping it?</Label>
          <Input
            id={reasonId}
            value={value.reason}
            maxLength={LIMITS.reason}
            autoFocus
            aria-invalid={(invalid && !value.reason.trim()) || undefined}
            placeholder="Anna is redoing the brief"
            onChange={(event) => onChange({ action: "drop", reason: event.target.value })}
          />
        </div>
      ) : null}
      {invalid ? (
        <p className="text-sm text-destructive">
          {value?.action === "drop" ? "Say in a line why you're dropping it." : "Carry it over or drop it."}
        </p>
      ) : null}
    </li>
  )
}

function MorningAnswers({ answers }: { answers: CheckinPage["answers"] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>From your last check-in</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 text-sm">
          {answers.map((answer, index) => (
            <li key={answer.taskId ?? index} className="break-words">
              <span className="font-medium">{answer.title}</span>
              {answer.action === "carry" ? " · carried over" : ` · dropped: ${answer.reason}`}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function TaskMeta({ task, showProject = false }: { task: TaskCard; showProject?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {showProject ? <span className="text-muted-foreground">{task.projectName}</span> : null}
      <StatusBadge status={task.status} />
      {task.waiting ? <WaitingBadge /> : null}
      <PickedDaysBadge pickedDays={task.pickedDays} status={task.status} />
      <DueDate dueDate={task.dueDate} status={task.status} />
      <StepsCount steps={task.steps} />
    </span>
  )
}

/** One task to tick, with a way to mark it Stuck without leaving the page. */
function PickRow({
  task,
  checked,
  busy,
  onToggle,
}: {
  task: TaskCard
  checked: boolean
  busy: boolean
  onToggle: (on: boolean) => void
}) {
  const router = useRouter()
  const [run, saving] = useAsyncAction(getProjectErrorMessage)
  const [stuckOpen, setStuckOpen] = React.useState(false)
  const [reason, setReason] = React.useState("")
  const boxId = `pick-${task.id}`
  const reasonId = `stuck-${task.id}`

  async function markStuck() {
    if (!reason.trim()) {
      showErrorToast("Say in a line why the task is stuck.")
      return
    }
    const ok = await run(
      () => setStatus({ taskId: task.id, status: "stuck", stuckReason: reason.trim() }),
      task.assignedBy ? `Marked Stuck. ${task.assignedBy.name} has been told.` : "Marked Stuck."
    )
    if (!ok) return
    setStuckOpen(false)
    setReason("")
    await router.invalidate()
  }

  return (
    <li className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <Checkbox
          id={boxId}
          className="mt-0.5"
          checked={checked}
          disabled={busy}
          onCheckedChange={(value) => onToggle(value === true)}
        />
        <div className="grid min-w-0 flex-1 gap-1">
          <Label htmlFor={boxId} className="font-medium break-words">
            {task.title}
          </Label>
          <TaskMeta task={task} />
          {task.status === "stuck" && task.stuckReason ? (
            <span className="text-xs text-destructive">Stuck: {task.stuckReason}</span>
          ) : null}
        </div>
        {task.status === "stuck" || stuckOpen ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => setStuckOpen(true)}
          >
            <CircleAlertIcon className="size-4" />
            Stuck
          </Button>
        )}
      </div>
      {stuckOpen ? (
        <div className="grid gap-2 sm:pl-7">
          <Label htmlFor={reasonId}>Why is it stuck?</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={reasonId}
              value={reason}
              maxLength={LIMITS.reason}
              autoFocus
              onChange={(event) => setReason(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void markStuck()
                }
              }}
            />
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStuckOpen(false)
                  setReason("")
                }}
              >
                Cancel
              </Button>
              <Button type="button" disabled={saving} onClick={() => void markStuck()}>
                Mark Stuck
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  )
}

/** A new task for myself, made without leaving the page and ticked straight away. */
function AddTaskRow({
  projects,
  myUserId,
  onAdded,
}: {
  projects: CheckinPage["projects"]
  myUserId: string
  onAdded: (taskId: string) => Promise<void>
}) {
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [title, setTitle] = React.useState("")
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "")
  const [titleInvalid, setTitleInvalid] = React.useState(false)

  if (projects.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ClockIcon className="size-4" aria-hidden />
        Join a project to add tasks of your own.
      </p>
    )
  }

  async function add() {
    const next = title.trim()
    if (!next) {
      setTitleInvalid(true)
      showErrorToast("Type the task's title first.")
      return
    }
    const created = { id: "" }
    const ok = await run(async () => {
      const task = await createProjectTask({
        projectId: projectId || projects[0].id,
        title: next,
        assigneeUserId: myUserId,
      })
      created.id = task.id
    }, "Task added and picked.")
    if (!ok) return
    setTitle("")
    await onAdded(created.id)
  }

  return (
    <form
      className="grid gap-2 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        void add()
      }}
    >
      <h3 className="text-sm font-medium">Add a task for yourself</h3>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-2">
        <div className="grid flex-1 gap-2">
          <Label htmlFor="checkin-new-task">Title</Label>
          <Input
            id="checkin-new-task"
            value={title}
            maxLength={LIMITS.taskTitle}
            placeholder="What else will you work on?"
            aria-invalid={titleInvalid || undefined}
            onChange={(event) => {
              setTitle(event.target.value)
              setTitleInvalid(false)
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="checkin-new-task-project">Project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger id="checkin-new-task-project" className="w-full sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  <ProjectDot color={project.color} />
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" variant="outline" disabled={busy} className="shrink-0">
          <PlusIcon className="size-4" />
          Add task
        </Button>
      </div>
    </form>
  )
}
