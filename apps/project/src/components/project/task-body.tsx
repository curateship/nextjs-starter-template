import * as React from "react"
import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import { BellIcon, CheckIcon, ClipboardCheckIcon, HeartIcon, PlusIcon, UndoIcon } from "lucide-react"

import { TaskChatCard } from "@/components/project/task-chat"
import { TaskFieldsCard, TaskTypeField } from "@/components/project/task-fields-card"
import { TaskFilesCard } from "@/components/project/task-files-card"
import { TaskHistoryCard } from "@/components/project/task-history-card"
import { TaskNotesField } from "@/components/project/task-notes"
import { MoveTaskCard, TaskMoreMenu } from "@/components/project/task-more-menu"
import { TaskPlanCard } from "@/components/project/task-plan-card"
import { StepMenu } from "@/components/project/step-menu"
import { TaskLabelsField, TaskSectionField } from "@/components/project/task-sorting-fields"
import {
  DueDate,
  PersonAvatar,
  PickedDaysBadge,
  ReviewBadge,
  RoomNote,
  StatusBadge,
  WaitingBadge,
} from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
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
import { Switch } from "@/components/ui/switch"
import {
  acceptProjectTask,
  addTaskStep,
  assignProjectTask,
  deleteProjectTask,
  followProjectTask,
  handBackProjectTask,
  loadTask,
  restoreProjectTask,
  reviewProjectTask,
  saveTask,
  setStatus,
  setTaskNeedsReview,
  thankForProjectTask,
  updateTaskStep,
  type TaskDetail,
  type TaskStep,
} from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { dateFromKey, keyFromDate } from "@/lib/project/dates"
import { PROJECT_ERRORS, getProjectErrorMessage } from "@/lib/project/errors"
import {
  BIN_DAYS,
  LIMITS,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskStatus,
} from "@/lib/project/rules"
import { useEscapeCancels } from "@/lib/project/use-escape-cancels"
import { usePeopleRoom } from "@/lib/project/use-people-room"
import { useProjectLive } from "@/lib/project/use-project-live"
import { showErrorToast } from "@/lib/toast/error-toast"

const authenticatedRoute = getRouteApi("/_authenticated")
const NOBODY = "nobody"

/** The one question before deleting a task, in the window and in the middle panel alike. */
export const DELETE_TASK_QUESTION = "Delete this task?"
export const DELETE_TASK_DETAIL = `It moves to the project's bin with its steps, chat and files, and can be brought back for ${BIN_DAYS} days.`

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
  /** Duplicate and Move to project, once the task has loaded and can change. */
  more: React.ReactNode
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
  const navigate = useNavigate()
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

  // Someone else's message, reaction or change to this task shows as it happens.
  useProjectLive(
    loaded.state === "ready" ? loaded.detail.task.projectId : undefined,
    (change) => change === `task:${taskId}`,
    () => setReloads((n) => n + 1)
  )

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
      ) : GONE.has(loaded.message) ? (
        // Trying again can't bring it back, so this offers the way out instead.
        <div className="grid justify-items-center gap-3 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {loaded.message === PROJECT_ERRORS.taskInBin
              ? loaded.message
              : "That task is gone or you can't see it."}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void navigate({
                to: ".",
                search: (previous: Record<string, unknown>) => ({ ...previous, task: undefined }),
              })
            }
          >
            Close
          </Button>
        </div>
      ) : (
        <ErrorRow message={loaded.message} onRetry={() => setReloads((n) => n + 1)} />
      ),
    follow: null,
    more: null,
    remove: null,
  })
}

/** Answers that no retry can change. */
const GONE = new Set<string>([PROJECT_ERRORS.taskNotFound, PROJECT_ERRORS.taskInBin])

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
  const [moving, setMoving] = React.useState(false)
  // Handing to someone else asks for an optional note before it goes.
  const [handingTo, setHandingTo] = React.useState<{ id: string; name: string } | null>(null)
  const [handoverNote, setHandoverNote] = React.useState("")
  const [sendingBack, setSendingBack] = React.useState(false)
  const [sendBackReason, setSendBackReason] = React.useState("")
  const room = usePeopleRoom()

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

  function pickAssignee(value: string) {
    if (value === (task.assignee?.id ?? NOBODY)) return
    const person = detail.assignable.find((p) => p.id === value)
    if (value !== NOBODY && value !== myUserId && person) {
      setHandingTo({ id: person.id, name: person.name })
      return
    }
    void change(() => assignProjectTask({ taskId: task.id, assigneeUserId: value === NOBODY ? null : value }))
  }

  async function handOver() {
    if (!handingTo) return
    const ok = await change(
      () =>
        assignProjectTask({
          taskId: task.id,
          assigneeUserId: handingTo.id,
          note: handoverNote.trim() || null,
        }),
      `Handed to ${handingTo.name}.`
    )
    if (ok) {
      setHandingTo(null)
      setHandoverNote("")
    }
  }

  async function sendBack() {
    if (!sendBackReason.trim()) {
      showErrorToast("Say in a line what still needs doing.")
      return
    }
    const ok = await change(
      () => reviewProjectTask({ taskId: task.id, action: "send_back", reason: sendBackReason.trim() }),
      task.assignee ? `Sent back to ${task.assignee.name}.` : "Sent back to Doing."
    )
    if (ok) {
      setSendingBack(false)
      setSendBackReason("")
    }
  }

  async function remove() {
    const ok = await run(() => deleteProjectTask(task.id))
    if (!ok) return false
    toast.success("Task moved to the bin.", {
      action: {
        label: "Undo",
        onClick: () =>
          void restoreProjectTask(task.id).then(
            () => router.invalidate(),
            (error: unknown) => showErrorToast(getProjectErrorMessage(error))
          ),
      },
    })
    await router.invalidate()
    return true
  }

  const body = (
    <>
      {moving && !readOnly ? <MoveTaskCard detail={detail} onDone={() => setMoving(false)} /> : null}
      {task.waiting && isMine && !readOnly ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{task.assignedBy?.name ?? "Someone"} handed you this task</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {task.handoverNote ? (
              <p className="text-sm break-words">
                <span className="text-muted-foreground">Note: </span>
                {task.handoverNote}
              </p>
            ) : null}
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

      {task.waiting && !isMine && task.handoverNote ? (
        <p className="rounded-lg border px-3 py-2 text-sm break-words">
          Note from {task.assignedBy?.name ?? "whoever handed it out"}: {task.handoverNote}
        </p>
      ) : null}

      {task.review.waiting ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Waiting for review</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              {detail.canReview
                ? "It's Done and counts as Done. Confirm it, or send it back to Doing with what still needs doing."
                : `It's Done. ${task.review.reviewer?.name ?? "The reviewer"} checks it before it's confirmed.`}
            </p>
            {detail.canReview && !readOnly && !sendingBack ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void change(() => reviewProjectTask({ taskId: task.id, action: "confirm" }), "Confirmed.")
                  }
                >
                  <ClipboardCheckIcon className="size-4" />
                  Confirm
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setSendingBack(true)}>
                  <UndoIcon className="size-4" />
                  Send back
                </Button>
              </div>
            ) : null}
            {sendingBack ? (
              <ReasonRow
                id="send-back-reason"
                label="What still needs doing?"
                value={sendBackReason}
                onChange={setSendBackReason}
                confirmLabel="Send back"
                busy={busy}
                onConfirm={() => void sendBack()}
                onCancel={() => {
                  setSendingBack(false)
                  setSendBackReason("")
                }}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {task.status === "done" && task.assignee && task.assignee.id !== myUserId ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
          <span>
            {detail.thanked
              ? `You thanked ${task.assignee.name}.`
              : `${task.assignee.name} finished this.`}
          </span>
          {detail.thanked ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void change(() => thankForProjectTask(task.id), `${task.assignee?.name ?? "They"} will see your thanks.`)
              }
            >
              <HeartIcon className="size-4" />
              Thanks
            </Button>
          )}
        </div>
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
                value={handingTo?.id ?? task.assignee?.id ?? NOBODY}
                onValueChange={pickAssignee}
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
                      {person.title ? (
                        <span className="text-muted-foreground"> · {person.title}</span>
                      ) : null}
                      <RoomNote room={room[person.id]} />
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
          {handingTo ? (
            <ReasonRow
              id="handover-note"
              label={`Note for ${handingTo.name} (optional)`}
              value={handoverNote}
              onChange={setHandoverNote}
              confirmLabel="Hand over"
              busy={busy}
              optional
              maxLength={LIMITS.handoverNote}
              placeholder="Client wants it by Thursday"
              onConfirm={() => void handOver()}
              onCancel={() => {
                setHandingTo(null)
                setHandoverNote("")
              }}
            />
          ) : null}
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
          <TaskTypeField detail={detail} readOnly={readOnly} busy={busy} change={change} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TaskSectionField detail={detail} readOnly={readOnly} busy={busy} change={change} />
            <TaskLabelsField detail={detail} readOnly={readOnly} busy={busy} change={change} />
          </div>
          {detail.canAskForReview ? (
            <div className="flex items-center justify-between gap-4">
              <FieldLabel
                htmlFor="task-needs-review"
                hint="When it's marked Done, you get a notice and check it. It still counts as Done meanwhile."
              >
                Needs review
              </FieldLabel>
              <Switch
                id="task-needs-review"
                checked={task.review.needed}
                disabled={readOnly || busy}
                onCheckedChange={(on) =>
                  void change(
                    () => setTaskNeedsReview(task.id, on),
                    on ? "You'll review it when it's Done." : "It no longer needs your review."
                  )
                }
              />
            </div>
          ) : task.review.needed && task.review.reviewer ? (
            <p className="text-sm text-muted-foreground">
              Needs review: {task.review.reviewer.name} checks it once it's Done.
            </p>
          ) : null}
          <TaskNotesField
            key={task.id}
            notes={task.notes}
            readOnly={readOnly}
            onSave={(notes, notesSession) => change(() => saveTask({ taskId: task.id, notes, notesSession }))}
            task={{ id: task.id, links: detail.noteLinks, change }}
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

      <TaskFieldsCard detail={detail} readOnly={readOnly} change={change} refresh={refresh} />
      <TaskPlanCard detail={detail} readOnly={readOnly} busy={busy} change={change} />
      <StepsCard detail={detail} myUserId={myUserId} readOnly={readOnly} change={change} busy={busy} />
      <TaskFilesCard detail={detail} readOnly={readOnly} refresh={refresh} change={change} />
      <TaskChatCard detail={detail} myUserId={myUserId} readOnly={readOnly} change={change} room={room} />
      <TaskHistoryCard detail={detail} />
    </>
  )

  return children({
    title: task.title,
    badges: (
      <>
        <StatusBadge status={task.status} />
        {task.waiting ? <WaitingBadge /> : null}
        <ReviewBadge review={task.review} />
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
    more: readOnly ? null : <TaskMoreMenu detail={detail} onMove={() => setMoving(true)} />,
    remove: detail.canDelete && !readOnly ? { busy, run: remove } : null,
  })
}

/**
 * One line typed in the task itself, never in a window over it: a reason, or
 * with `optional` a hand-over's note that may stay empty.
 */
function ReasonRow({
  id,
  label,
  value,
  onChange,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
  optional = false,
  maxLength = LIMITS.reason,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  confirmLabel: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
  optional?: boolean
  maxLength?: number
  placeholder?: string
}) {
  const frame = React.useRef<HTMLDivElement>(null)
  useEscapeCancels(frame, onCancel)
  return (
    <div ref={frame} className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={id}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-required={!optional || undefined}
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
  detail,
  myUserId,
  readOnly,
  change,
  busy,
}: {
  detail: TaskDetail
  myUserId: string
  readOnly: boolean
  change: Change
  busy: boolean
}) {
  const taskId = detail.task.id
  const steps = detail.steps
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
              <StepRow
                key={step.id}
                step={step}
                people={detail.assignable}
                myUserId={myUserId}
                readOnly={readOnly}
                change={change}
                busy={busy}
              />
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
  people,
  myUserId,
  readOnly,
  change,
  busy,
}: {
  step: TaskStep
  people: TaskDetail["assignable"]
  myUserId: string
  readOnly: boolean
  change: Change
  busy: boolean
}) {
  const [text, setText] = useSyncedDraft(step.text)
  const checkboxId = `step-${step.id}`
  return (
    <li className="grid gap-1">
      <div className="flex items-center gap-2">
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
          <StepMenu step={step} people={people} myUserId={myUserId} change={change} saving={busy} />
        )}
      </div>
      {step.assignee || step.dueDate ? (
        <p className="flex flex-wrap items-center gap-2 pl-6 text-xs text-muted-foreground">
          {step.assignee ? (
            <span className="flex items-center gap-1">
              <PersonAvatar name={step.assignee.name} avatarUrl={step.assignee.avatarUrl} />
              {step.assignee.id === myUserId ? "You" : step.assignee.name}
            </span>
          ) : null}
          {step.dueDate ? <DueDate dueDate={step.dueDate} status={step.done ? "done" : "todo"} /> : null}
        </p>
      ) : null}
    </li>
  )
}
