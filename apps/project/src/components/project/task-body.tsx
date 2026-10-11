import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { BellIcon, CheckIcon, PlusIcon, Trash2Icon, UndoIcon } from "lucide-react"

import { TaskChatCard } from "@/components/project/task-chat"
import { TaskFilesCard } from "@/components/project/task-files-card"
import { TaskHistoryCard } from "@/components/project/task-history-card"
import { TaskNotesField } from "@/components/project/task-notes"
import {
  PersonAvatar,
  PickedDaysBadge,
  StatusBadge,
  WaitingBadge,
} from "@/components/project/task-bits"
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
  acceptProjectTask,
  addTaskStep,
  assignProjectTask,
  deleteProjectTask,
  deleteTaskStep,
  followProjectTask,
  handBackProjectTask,
  loadTask,
  saveTask,
  setStatus,
  updateTaskStep,
  type TaskDetail,
  type TaskStep,
} from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { dateFromKey, keyFromDate } from "@/lib/project/dates"
import { getProjectErrorMessage } from "@/lib/project/errors"
import {
  LIMITS,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskStatus,
} from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

const authenticatedRoute = getRouteApi("/_authenticated")
const NOBODY = "nobody"

/**
 * What a task shows, split into the pieces its two frames place differently:
 * the window on the Team dashboard (`task-dialog.tsx`), and the middle panel
 * of the project page and My dashboard (`task-in-place.tsx`). Both draw the
 * same body, so the task reads the same wherever it opens.
 */
export type TaskParts = {
  title: string
  badges: React.ReactNode
  /** The project, who handed it out, and whether it's archived. */
  description: React.ReactNode
  body: React.ReactNode
  /** The Follow button, once the task has loaded. */
  follow: React.ReactNode
  /** Deletes the task and refreshes the page under it. Null when this person can't. */
  remove: { busy: boolean; run: () => Promise<boolean> } | null
}

type Loaded =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; detail: TaskDetail }

/**
 * Loads one task and hands its pieces to `children`. Every field saves on its
 * own as it is changed. Reasons for Stuck and for handing back are typed in
 * the task itself, never in a window on top of it.
 */
export function TaskView({
  taskId,
  children,
}: {
  taskId: string
  children: (parts: TaskParts) => React.ReactNode
}) {
  const router = useRouter()
  const me = authenticatedRoute.useLoaderData().user
  const [loaded, setLoaded] = React.useState<Loaded>({ state: "loading" })
  const [reloads, setReloads] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadTask(taskId).then(
      (detail) => live && setLoaded({ state: "ready", detail }),
      (error: unknown) =>
        live && setLoaded({ state: "error", message: getProjectErrorMessage(error) })
    )
    return () => {
      live = false
    }
  }, [taskId, reloads])

  /** After a change: this task's copy and the page under it both refresh. */
  const refresh = React.useCallback(async () => {
    setReloads((n) => n + 1)
    await router.invalidate()
  }, [router])

  if (loaded.state === "ready") {
    return (
      <TaskForm detail={loaded.detail} myUserId={me.id} refresh={refresh}>
        {children}
      </TaskForm>
    )
  }
  return children({
    title: "Task",
    badges: null,
    description: null,
    body:
      loaded.state === "loading" ? (
        <LoadingRow label="Loading the task…" />
      ) : (
        <ErrorRow message={loaded.message} onRetry={() => setReloads((n) => n + 1)} />
      ),
    follow: null,
    remove: null,
  })
}

export type Change = (work: () => Promise<unknown>, successText?: string) => Promise<boolean>

function TaskForm({
  detail,
  myUserId,
  refresh,
  children,
}: {
  detail: TaskDetail
  myUserId: string
  refresh: () => Promise<void>
  children: (parts: TaskParts) => React.ReactNode
}) {
  const router = useRouter()
  const { task } = detail
  const readOnly = detail.archived
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [title, setTitle] = useSyncedDraft(task.title)
  const [pendingStuck, setPendingStuck] = React.useState(false)
  const [stuckReason, setStuckReason] = React.useState("")
  const [handingBack, setHandingBack] = React.useState(false)
  const [handBackReason, setHandBackReason] = React.useState("")

  const isMine = task.assignee?.id === myUserId
  const canHandBack = isMine && Boolean(task.assignedBy) && task.assignedBy?.id !== myUserId

  const change: Change = async (work, successText) => {
    const ok = await run(work, successText)
    if (ok) await refresh()
    return ok
  }

  function commitTitle() {
    const next = title.trim()
    if (next === task.title) return
    if (!next) {
      setTitle(task.title)
      showErrorToast("The task title can't be empty.")
      return
    }
    void change(() => saveTask({ taskId: task.id, title: next }))
  }

  function pickStatus(status: TaskStatus) {
    if (status === task.status) return
    if (status === "stuck") {
      setPendingStuck(true)
      return
    }
    setPendingStuck(false)
    void change(() => setStatus({ taskId: task.id, status, stuckReason: null }))
  }

  async function markStuck() {
    if (!stuckReason.trim()) {
      showErrorToast("Say in a line why the task is stuck.")
      return
    }
    const ok = await change(
      () => setStatus({ taskId: task.id, status: "stuck", stuckReason: stuckReason.trim() }),
      "Marked Stuck."
    )
    if (ok) {
      setPendingStuck(false)
      setStuckReason("")
    }
  }

  async function handBack() {
    if (!handBackReason.trim()) {
      showErrorToast("Say in a line why you're handing it back.")
      return
    }
    const ok = await change(
      () => handBackProjectTask(task.id, handBackReason.trim()),
      task.assignedBy ? `Handed back to ${task.assignedBy.name}.` : "Handed back."
    )
    if (ok) {
      setHandingBack(false)
      setHandBackReason("")
    }
  }

  async function remove() {
    const ok = await run(() => deleteProjectTask(task.id), "Task deleted.")
    if (ok) await router.invalidate()
    return ok
  }

  const body = (
    <>
      {task.waiting && isMine && !readOnly ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{task.assignedBy?.name ?? "Someone"} handed you this task</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Accept it to take it on, or hand it back with a reason.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy}
                onClick={() => void change(() => acceptProjectTask(task.id), "Task accepted.")}
              >
                Accept task
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setHandingBack(true)}>
                <UndoIcon className="size-4" />
                Hand back
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {handingBack ? (
        <ReasonRow
          id="hand-back-reason"
          label={`Why are you handing it back to ${task.assignedBy?.name ?? "them"}?`}
          value={handBackReason}
          onChange={setHandBackReason}
          confirmLabel="Hand back"
          busy={busy}
          onConfirm={() => void handBack()}
          onCancel={() => {
            setHandingBack(false)
            setHandBackReason("")
          }}
        />
      ) : null}

      {task.handedBack ? (
        <p className="rounded-lg border px-3 py-2 text-sm">
          <UndoIcon className="mr-1 inline size-4 align-text-bottom" aria-hidden />
          {task.handedBack.byName} handed this back: {task.handedBack.reason}
        </p>
      ) : null}
      {task.status === "stuck" && task.stuckReason ? (
        <p className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
          Stuck: {task.stuckReason}
        </p>
      ) : null}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Task</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              maxLength={LIMITS.taskTitle}
              disabled={readOnly}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
              }}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="task-status">Status</Label>
              <Select
                value={pendingStuck ? "stuck" : task.status}
                onValueChange={(value) => pickStatus(value as TaskStatus)}
                disabled={readOnly || busy}
              >
                <SelectTrigger id="task-status" className="w-full sm:w-fit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {TASK_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="task-assignee">Assigned to</Label>
              <Select
                value={task.assignee?.id ?? NOBODY}
                onValueChange={(value) =>
                  void change(() =>
                    assignProjectTask({
                      taskId: task.id,
                      assigneeUserId: value === NOBODY ? null : value,
                    })
                  )
                }
                disabled={readOnly || busy}
              >
                <SelectTrigger id="task-assignee" className="w-full sm:w-fit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOBODY}>Nobody</SelectItem>
                  {detail.assignable.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      <PersonAvatar name={person.name} avatarUrl={person.avatarUrl} />
                      {person.id === myUserId ? `${person.name} (you)` : person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!task.assignee && task.formerAssigneeName ? (
                <p className="text-xs text-muted-foreground">
                  Was assigned to {task.formerAssigneeName}, who is no longer on the project.
                </p>
              ) : null}
            </div>
          </div>
          {pendingStuck ? (
            <ReasonRow
              id="stuck-reason"
              label="Why is it stuck?"
              value={stuckReason}
              onChange={setStuckReason}
              confirmLabel="Mark Stuck"
              busy={busy}
              onConfirm={() => void markStuck()}
              onCancel={() => {
                setPendingStuck(false)
                setStuckReason("")
              }}
            />
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="task-due">Due date</Label>
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker
                id="task-due"
                value={dateFromKey(task.dueDate)}
                placeholder="No due date"
                disabled={readOnly || busy}
                onChange={(date) =>
                  void change(() => saveTask({ taskId: task.id, dueDate: keyFromDate(date) }))
                }
              />
              {task.dueDate && !readOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void change(() => saveTask({ taskId: task.id, dueDate: null }))}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
          <TaskNotesField
            key={task.id}
            notes={task.notes}
            readOnly={readOnly}
            onSave={(notes) => change(() => saveTask({ taskId: task.id, notes }))}
          />
          {canHandBack && !task.waiting && !handingBack && !readOnly ? (
            <div>
              <Button type="button" variant="outline" onClick={() => setHandingBack(true)}>
                <UndoIcon className="size-4" />
                Hand back to {task.assignedBy?.name}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <StepsCard taskId={task.id} steps={detail.steps} readOnly={readOnly} change={change} busy={busy} />
      <TaskFilesCard detail={detail} readOnly={readOnly} refresh={refresh} change={change} />
      <TaskChatCard detail={detail} myUserId={myUserId} readOnly={readOnly} change={change} />
      <TaskHistoryCard detail={detail} />
    </>
  )

  return children({
    title: task.title,
    badges: (
      <>
        <StatusBadge status={task.status} />
        {task.waiting ? <WaitingBadge /> : null}
        <PickedDaysBadge pickedDays={task.pickedDays} status={task.status} />
      </>
    ),
    description: (
      <>
        {task.projectName}
        {task.assignedBy ? ` · Handed out by ${task.assignedBy.name}` : ""}
        {readOnly ? " · The project is archived, so this task can't change." : ""}
      </>
    ),
    body,
    follow: (
      <Button
        type="button"
        variant="outline"
        aria-pressed={detail.following}
        disabled={busy}
        onClick={() =>
          void change(
            () => followProjectTask(task.id, !detail.following),
            detail.following ? "You stopped following this task." : "You're following this task."
          )
        }
      >
        {detail.following ? <CheckIcon className="size-4" /> : <BellIcon className="size-4" />}
        {detail.following ? "Following" : "Follow"}
      </Button>
    ),
    remove: detail.canDelete && !readOnly ? { busy, run: remove } : null,
  })
}

function ReasonRow({
  id,
  label,
  value,
  onChange,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  confirmLabel: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={id}
          value={value}
          maxLength={LIMITS.reason}
          autoFocus
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              onConfirm()
            }
          }}
        />
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function StepsCard({
  taskId,
  steps,
  readOnly,
  change,
  busy,
}: {
  taskId: string
  steps: TaskStep[]
  readOnly: boolean
  change: Change
  busy: boolean
}) {
  const [text, setText] = React.useState("")
  const done = steps.filter((step) => step.done).length

  async function add() {
    const next = text.trim()
    if (!next) {
      showErrorToast("Type the step first.")
      return
    }
    if (await change(() => addTaskStep(taskId, next))) setText("")
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          Steps{steps.length ? ` · ${done} of ${steps.length} done` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No steps. Add some to show progress as "3 of 5 steps done".
          </p>
        ) : (
          <ul className="grid gap-2">
            {steps.map((step) => (
              <StepRow key={step.id} step={step} readOnly={readOnly} change={change} />
            ))}
          </ul>
        )}
        {readOnly ? null : (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void add()
            }}
          >
            <Input
              aria-label="New step"
              placeholder="Add a step"
              value={text}
              maxLength={LIMITS.stepText}
              onChange={(event) => setText(event.target.value)}
            />
            <Button type="submit" variant="outline" disabled={busy}>
              <PlusIcon className="size-4" />
              Add
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function StepRow({
  step,
  readOnly,
  change,
}: {
  step: TaskStep
  readOnly: boolean
  change: Change
}) {
  const [text, setText] = useSyncedDraft(step.text)
  const checkboxId = `step-${step.id}`
  return (
    <li className="flex items-center gap-2">
      <Checkbox
        id={checkboxId}
        checked={step.done}
        disabled={readOnly}
        aria-label={`${step.text}, ${step.done ? "done" : "not done"}`}
        onCheckedChange={(checked) =>
          void change(() => updateTaskStep({ stepId: step.id, done: checked === true }))
        }
      />
      <Input
        aria-label="Step"
        value={text}
        maxLength={LIMITS.stepText}
        disabled={readOnly}
        className={step.done ? "text-muted-foreground line-through" : undefined}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const next = text.trim()
          if (next === step.text) return
          if (!next) {
            setText(step.text)
            return
          }
          void change(() => updateTaskStep({ stepId: step.id, text: next }))
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
      {readOnly ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete the step "${step.text}"`}
          onClick={() => void change(() => deleteTaskStep(step.id))}
        >
          <Trash2Icon className="size-4" />
        </Button>
      )}
    </li>
  )
}
