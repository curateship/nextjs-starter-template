import * as React from "react"
import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import { BellIcon, CheckIcon, ClipboardCheckIcon, HeartIcon, PlusIcon, UndoIcon } from "lucide-react"

import { ChatThread, TaskChatCard } from "@/components/project/task-chat"
import { TaskFieldsCard, TaskTypeField } from "@/components/project/task-fields-card"
import { TaskFileDrop, TaskFilesCard } from "@/components/project/task-files-card"
import { TaskHistoryCard } from "@/components/project/task-history-card"
import { TaskNotesField } from "@/components/project/task-notes"
import { AskTimeCard, MoveTaskCard, ReminderCard, TaskMoreMenu } from "@/components/project/task-more-menu"
import { PanelCardFooter } from "@/components/project/panel-card"
import { StepListActions } from "@/components/project/step-list-actions"
import { DueDayPicker } from "@/components/project/due-day-picker"
import { TaskPlanCard } from "@/components/project/task-plan-card"
import { StepMenu } from "@/components/project/step-menu"
import { TaskTagList, TaskTagsField } from "@/components/project/task-tags-field"
import { TaskLinkButton, TaskLinkField } from "@/components/project/task-link"
import { TaskClockFooter } from "@/components/project/task-clock"
import {
  DueDate,
  DayOffNote,
  DueMovesMark,
  PersonAvatar,
  PickedDaysBadge,
  ReviewBadge,
  RoomNote,
  StatusBadge,
  StatusDot,
  WaitingBadge,
} from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
  answerMoreTaskTime,
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
  type TaskCard,
  type TaskDetail,
  type TaskStep,
} from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import { plural } from "@/lib/format/plural"
import { localTimeOf, momentOnDay } from "@/lib/project/dates"
import { clockLabel, dayLabel, shortDayLabel } from "@/lib/project/days"
import { OptionCard } from "@/components/project/option-card"
import { setProjectTaskLink } from "@/lib/api/project/linked-records"
import { LINKED_APP_INFO } from "@/lib/project/linked-records"
import { dayOffNote } from "@/lib/project/days-off"
import { PROJECT_ERRORS, getProjectErrorMessage } from "@/lib/project/errors"
import {
  BIN_DAYS,
  LIMITS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskPriority,
  type TaskStatus,
  isOpenStatus,
} from "@/lib/project/rules"
import { readTaskNotes, taskNotesAreEmpty } from "@/lib/project/notes"
import { useEscapeCancels } from "@/lib/project/use-escape-cancels"
import { useDaysOff } from "@/lib/project/use-days-off"
import { usePeopleRoom } from "@/lib/project/use-people-room"
import { useProjectLive } from "@/lib/project/use-project-live"
import { showErrorToast } from "@/lib/toast/error-toast"

const authenticatedRoute = getRouteApi("/_authenticated")
const NOBODY = "nobody"

/** The one question before deleting a task, in the window and in the right panel alike. */
export const DELETE_TASK_QUESTION = "Delete this task?"
export const DELETE_TASK_DETAIL = `It moves to the project's bin with its steps, chat and files, and can be brought back for ${BIN_DAYS} days.`

/** "Task moved to the bin." with Undo, after a task is deleted from its panel or its Board card. */
export function showBinnedToast(taskId: string, router: { invalidate: () => Promise<unknown> }) {
  toast.success("Task moved to the bin.", {
    action: {
      label: "Undo",
      onClick: () =>
        void restoreProjectTask(taskId).then(
          () => router.invalidate(),
          (error: unknown) => showErrorToast(getProjectErrorMessage(error))
        ),
    },
  })
}

/**
 * What a task shows, split into the pieces its frames place differently: the
 * window on the Team dashboard (`task-dialog.tsx`) draws `body`, the whole
 * task in one column. The right panel of the project page and My dashboard
 * (`task-side-panel.tsx`) draws `side` instead. Every piece is the same field with the same saving, so the task
 * behaves the same wherever it opens.
 */
export type TaskParts = {
  title: string
  badges: React.ReactNode
  /** The project, who handed it out, and whether it's archived. */
  description: React.ReactNode
  body: React.ReactNode
  /** The pieces of the project page's panel. Null until the task has loaded. */
  side: TaskSide | null
  /** The Follow button, once the task has loaded. */
  follow: React.ReactNode
  /** Duplicate and Move to project, once the task has loaded and can change. */
  more: React.ReactNode
  /** Deletes the task and refreshes the page under it. Null when this person can't. */
  remove: { busy: boolean; run: () => Promise<boolean> } | null
}

/**
 * The project page's task panel: the status in its header, notices, Notes,
 * Steps and Chat down the panel, the files behind the paperclip and the rest
 * of the fields in the cog's dropdown.
 */
export type TaskSide = {
  /** The title in the panel's header, edited where it is written (Tyler, 20 Oct 2026). */
  title: React.ReactNode
  /** The footer pinned to the panel's bottom: the status, the clock, Start and Completed. */
  footer: React.ReactNode
  /** The tags under the title, to read; nothing while there are none. */
  tagList: React.ReactNode
  /** The tags box, in the three-dot button's Add tags (Tyler, 20 Oct 2026). */
  tags: React.ReactNode
  /** The button that opens the task's Video or Promo record, or who may open it. */
  link: React.ReactNode
  /** A hand-over to accept, a review, the Stuck reason row, and the Move and Remind me cards. */
  notices: React.ReactNode
  notes: {
    empty: boolean
    /** `adding` opens the editor at once, for "Add note". */
    field: (options: { adding: boolean; onFinished: () => void }) => React.ReactNode
  }
  /** `meta` is "0 of 2 done", or null with no steps. */
  steps: { meta: string | null; content: React.ReactNode }
  /** The chat; with no messages yet it is written in a dropdown from the header, as notes are. */
  chat: { count: number; content: React.ReactNode }
  /** Follow or stop following, at the right of the cog dropdown's tabs. */
  followButton: React.ReactNode
  files: { count: number; content: React.ReactNode }
  /**
   * The cog's Details tab as cards that fold open: Person, Dates, Priority and
   * type, Needs review, the type's own fields, and the Plan.
   */
  settings: React.ReactNode
  /** The cog's History tab, as a card. */
  history: React.ReactNode
  detail: TaskDetail
  readOnly: boolean
  /** Opens the Move to project card at the top of the panel. */
  move: () => void
  /** Opens the Remind me card at the top of the panel. */
  remind: () => void
  /** Opens the Ask for more time card at the top of the panel (Seven features, part 2). */
  askTime: () => void
}

type Loaded =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; detail: TaskDetail }

/**
 * The tasks already opened since the page loaded, so opening one again draws
 * it at once from the last copy while a fresh copy loads behind it (Tyler,
 * 26 Oct 2026: "the task panel should not load every time"). Capped so a long
 * session doesn't keep every task it ever opened.
 */
const openedTasks = new Map<string, TaskDetail>()
const OPENED_TASKS_KEPT = 50

function rememberTask(taskId: string, detail: TaskDetail) {
  openedTasks.delete(taskId)
  openedTasks.set(taskId, detail)
  if (openedTasks.size > OPENED_TASKS_KEPT) {
    const oldest = openedTasks.keys().next().value
    if (oldest !== undefined) openedTasks.delete(oldest)
  }
}

/**
 * Loads one task and hands its pieces to `children`. Every field saves on its
 * own as it is changed. Reasons for Stuck and for handing back are typed in
 * the task itself, never in a window on top of it.
 */
export function TaskView({
  taskId,
  onLoaded,
  children,
}: {
  taskId: string
  /** Once the task has first loaded, which marks its chat read. */
  onLoaded?: (taskId: string) => void
  children: (parts: TaskParts) => React.ReactNode
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const me = authenticatedRoute.useLoaderData().user
  const [loaded, setLoaded] = React.useState<Loaded>(() => {
    const kept = openedTasks.get(taskId)
    return kept ? { state: "ready", detail: kept } : { state: "loading" }
  })
  const [reloads, setReloads] = React.useState(0)
  const onLoadedRef = React.useRef(onLoaded)
  React.useEffect(() => {
    onLoadedRef.current = onLoaded
  }, [onLoaded])
  const firstLoad = React.useRef(true)

  React.useEffect(() => {
    let live = true
    loadTask(taskId).then(
      (detail) => {
        rememberTask(taskId, detail)
        if (!live) return
        setLoaded({ state: "ready", detail })
        if (firstLoad.current) {
          firstLoad.current = false
          onLoadedRef.current?.(taskId)
        }
      },
      (error: unknown) => {
        openedTasks.delete(taskId)
        if (live) setLoaded({ state: "error", message: getProjectErrorMessage(error) })
      }
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
    // A task opened for the first time shows nothing for the moment it takes
    // to arrive, with no spinner (Tyler, 26 Oct 2026).
    body:
      loaded.state === "loading" ? null : GONE.has(loaded.message) ? (
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
    side: null,
    follow: null,
    more: null,
    remove: null,
  })
}

/**
 * An open ask for more time (Seven features, part 2): who asked, for which
 * day and why. Whoever answers gets Yes, which moves the date, and No, with
 * an optional line of why; everyone else reads who will answer.
 */
function MoreTimeCard({
  ask,
  dueDate,
  busy,
  keeping,
  keepReason,
  onKeepReason,
  onYes,
  onNo,
  onKeep,
  onCancelKeep,
}: {
  ask: NonNullable<TaskDetail["moreTime"]>
  dueDate: string | null
  busy: boolean
  keeping: boolean
  keepReason: string
  onKeepReason: (reason: string) => void
  onYes: () => void
  onNo: () => void
  onKeep: () => Promise<void>
  onCancelKeep: () => void
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Asked for {shortDayLabel(ask.day)}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm break-words">
          {ask.askedByName} asks to move the due date{dueDate ? ` from ${shortDayLabel(dueDate)}` : ""} to{" "}
          {shortDayLabel(ask.day)}: {ask.reason}
        </p>
        {ask.canAnswer ? (
          keeping ? (
            <ReasonRow
              id="keep-date-reason"
              label={`Why does it stay ${dueDate ? shortDayLabel(dueDate) : "as it is"}? (optional)`}
              value={keepReason}
              onChange={onKeepReason}
              confirmLabel="Keep the date"
              busy={busy}
              optional
              onConfirm={() => void onKeep()}
              onCancel={onCancelKeep}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={onYes}>
                <CheckIcon className="size-4" />
                Yes, move it
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={onNo}>
                No, keep the date
              </Button>
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            Waiting for {ask.answererName ?? "the site admin"} to answer.
          </p>
        )}
      </CardContent>
    </Card>
  )
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
  const [reminding, setReminding] = React.useState(false)
  const [askingTime, setAskingTime] = React.useState(false)
  const [keepingDate, setKeepingDate] = React.useState(false)
  const [keepReason, setKeepReason] = React.useState("")
  // Handing to someone else asks for an optional note before it goes.
  const [handingTo, setHandingTo] = React.useState<{ id: string; name: string } | null>(null)
  const [handoverNote, setHandoverNote] = React.useState("")
  const [sendingBack, setSendingBack] = React.useState(false)
  const [sendBackReason, setSendBackReason] = React.useState("")
  const room = usePeopleRoom()
  // A due date on the person's day off or a team holiday says so (Seven features, part 1).
  const daysOff = useDaysOff()

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
    showBinnedToast(task.id, router)
    await router.invalidate()
    return true
  }

  // What a task tells whoever opens it, above everything else: a hand-over
  // to accept, a review, thanks, a reason it is stuck, and the Move and
  // Remind me cards.
  const notices = (
    <>
      {moving && !readOnly ? <MoveTaskCard detail={detail} onDone={() => setMoving(false)} /> : null}
      {askingTime && detail.canAskForTime ? (
        <AskTimeCard detail={detail} change={change} onDone={() => setAskingTime(false)} />
      ) : null}
      {detail.moreTime ? (
        <MoreTimeCard
          ask={detail.moreTime}
          dueDate={task.dueDate}
          busy={busy}
          keeping={keepingDate}
          keepReason={keepReason}
          onKeepReason={setKeepReason}
          onYes={() =>
            void change(
              () => answerMoreTaskTime({ taskId: task.id, answer: "yes" }),
              `It's now due ${shortDayLabel(detail.moreTime!.day)}.`
            )
          }
          onNo={() => setKeepingDate(true)}
          onKeep={async () => {
            const ok = await change(
              () => answerMoreTaskTime({ taskId: task.id, answer: "no", reason: keepReason.trim() || null }),
              "The due date stays."
            )
            if (ok) {
              setKeepingDate(false)
              setKeepReason("")
            }
          }}
          onCancelKeep={() => {
            setKeepingDate(false)
            setKeepReason("")
          }}
        />
      ) : null}
      {reminding && !readOnly ? (
        <ReminderCard detail={detail} change={change} onDone={() => setReminding(false)} />
      ) : null}
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
    </>
  )

  const titleField = (
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
  )

  const statusField = (
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
  )

  // The panel puts the status in its footer, a small pill with the status's
  // own dot, the same as the Board's column headings.
  const statusPill = (
    <Select
      value={pendingStuck ? "stuck" : task.status}
      onValueChange={(value) => pickStatus(value as TaskStatus)}
      disabled={readOnly || busy}
    >
      {/* No border or background, as it had in the header (Tyler, 14 Oct 2026). */}
      <SelectTrigger
        aria-label="Status"
        className="w-fit border-transparent bg-transparent shadow-none hover:bg-muted dark:bg-transparent dark:hover:bg-muted/50"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TASK_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            <StatusDot status={status} />
            {TASK_STATUS_LABEL[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const assigneeField = (
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
  )

  const handoverRow = handingTo ? (
    <>
      <DayOffNote note={dayOffNote(daysOff, task.dueDate, handingTo)} />
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
    </>
  ) : null

  const stuckRow = pendingStuck ? (
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
  ) : null

  const startField = (
    <div className="grid content-start gap-2">
      <Label htmlFor="task-start">Start day</Label>
      <DueDayPicker
        id="task-start"
        value={task.startDate}
        placeholder="No start day"
        disabled={readOnly || busy}
        clearLabel="Clear the start day"
        onChange={(startDate) => {
          if (startDate !== task.startDate) void change(() => saveTask({ taskId: task.id, startDate }))
        }}
      />
    </div>
  )

  const dueField = (
    <div className="grid content-start gap-2">
      <Label htmlFor="task-due">Due date</Label>
      <div className="flex flex-wrap items-center gap-2">
        <DueDayPicker
          id="task-due"
          value={task.dueDate}
          placeholder="No due date"
          disabled={readOnly || busy}
          clearLabel="Clear the due date"
          onChange={(dueDate) => {
            if (dueDate !== task.dueDate) void change(() => saveTask({ taskId: task.id, dueDate }))
          }}
        />
        <DueMovesMark moves={task.dueMoves} status={task.status} />
      </div>
      {!isOpenStatus(task.status) ? null : <DayOffNote note={dayOffNote(daysOff, task.dueDate, task.assignee)} />}
    </div>
  )

  const dueByField = task.dueDate ? (
    <DueByField
      task={task}
      disabled={readOnly || busy}
      onSave={(dueAt) => void change(() => saveTask({ taskId: task.id, dueAt }))}
    />
  ) : null

  const priorityField = (
    <div className="grid content-start gap-2">
      <Label htmlFor="task-priority">Priority</Label>
      <Select
        value={task.priority}
        onValueChange={(value) =>
          void change(() => saveTask({ taskId: task.id, priority: value as TaskPriority }))
        }
        disabled={readOnly || busy}
      >
        <SelectTrigger id="task-priority" className="w-full sm:w-fit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TASK_PRIORITIES.map((priority) => (
            <SelectItem key={priority} value={priority}>
              {TASK_PRIORITY_LABEL[priority]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  const datesAndPriority = (
    <div className="grid gap-4 sm:grid-cols-2">
      {startField}
      {dueField}
      {dueByField}
      {priorityField}
    </div>
  )

  const typeField = <TaskTypeField detail={detail} readOnly={readOnly} busy={busy} change={change} />
  const tagsField = <TaskTagsField detail={detail} readOnly={readOnly} busy={busy} change={change} />
  const reviewField = detail.canAskForReview ? (
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
  ) : null

  const sortingFields = (
    <>
      {typeField}
      <div className="grid gap-2">
        <Label htmlFor="task-tags">Tags</Label>
        <TaskTagsField id="task-tags" detail={detail} readOnly={readOnly} busy={busy} change={change} />
      </div>
      {reviewField}
    </>
  )

  const saveNotes = (notes: WrittenPageNode, notesSession: string) =>
    change(() => saveTask({ taskId: task.id, notes, notesSession }))
  const noteLinks = { id: task.id, links: detail.noteLinks, change }

  const handBackButton =
    canHandBack && !task.waiting && !handingBack && !readOnly ? (
      <div>
        <Button type="button" variant="outline" onClick={() => setHandingBack(true)}>
          <UndoIcon className="size-4" />
          Hand back to {task.assignedBy?.name}
        </Button>
      </div>
    ) : null

  const fieldsCard = <TaskFieldsCard detail={detail} readOnly={readOnly} change={change} refresh={refresh} />
  const linkButton = <TaskLinkButton detail={detail} />
  const linkField = detail.canSetLink ? (
    <TaskLinkField
      detail={detail}
      onSave={(address) =>
        change(
          () => setProjectTaskLink(task.id, address),
          address ? "The task now opens that record." : "The task no longer points at a record."
        )
      }
    />
  ) : null
  const planCard = <TaskPlanCard detail={detail} readOnly={readOnly} busy={busy} change={change} />
  const historyCard = <TaskHistoryCard detail={detail} />
  const stepsTitle = `Steps${detail.steps.length ? ` · ${detail.steps.filter((step) => step.done).length} of ${detail.steps.length} done` : ""}`
  const steps = <StepsContent detail={detail} myUserId={myUserId} readOnly={readOnly} change={change} busy={busy} />

  const body = (
    <>
      {notices}
      {linkButton}
      <Card size="sm">
        <CardHeader>
          <CardTitle>Task</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {titleField}
          <div className="grid gap-4 sm:grid-cols-2">
            {statusField}
            {assigneeField}
          </div>
          {handoverRow}
          {stuckRow}
          {datesAndPriority}
          {sortingFields}
          {linkField}
          <TaskNotesField key={task.id} notes={task.notes} readOnly={readOnly} onSave={saveNotes} task={noteLinks} />
          {handBackButton}
        </CardContent>
      </Card>

      {fieldsCard}
      {planCard}
      <Card size="sm">
        <CardHeader>
          <CardTitle>{stepsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">{steps}</CardContent>
      </Card>
      <TaskFilesCard detail={detail} readOnly={readOnly} refresh={refresh} change={change} />
      <TaskChatCard detail={detail} myUserId={myUserId} readOnly={readOnly} change={change} room={room} />
      {historyCard}
    </>
  )

  const side: TaskSide = {
    // In the header where the status was (Tyler, 20 Oct 2026), edited in place.
    // Enter saves rather than starting a new line, as the Title field did. A
    // long title wraps and the header grows with it.
    title: readOnly ? (
      <h2 className="text-sm font-semibold break-words">{task.title}</h2>
    ) : (
      <Textarea
        aria-label="Task title"
        rows={1}
        value={title}
        maxLength={LIMITS.taskTitle}
        onChange={(event) => setTitle(event.target.value.replace(/\n/g, " "))}
        onBlur={commitTitle}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
        className="min-h-8 resize-none border-transparent px-2 py-1 text-sm font-semibold shadow-none hover:border-input dark:bg-transparent"
      />
    ),
    footer: <TaskClockFooter detail={detail} status={statusPill} change={change} busy={busy} readOnly={readOnly} />,
    tagList: <TaskTagList tags={task.labels} />,
    tags: tagsField,
    link: linkButton,
    notices: (
      <>
        {stuckRow}
        {notices}
      </>
    ),
    notes: {
      empty: taskNotesAreEmpty(readTaskNotes(task.notes)),
      field: ({ adding, onFinished }) => (
        <TaskNotesField
          key={task.id}
          notes={task.notes}
          readOnly={readOnly}
          onSave={saveNotes}
          task={noteLinks}
          startEditing={adding}
          onFinished={onFinished}
          hideLabel
        />
      ),
    },
    steps: {
      meta: detail.steps.length
        ? `${detail.steps.filter((step) => step.done).length} of ${detail.steps.length} done`
        : null,
      content: steps,
    },
    chat: {
      // A deleted message isn't one to count, so a chat holding only those is still empty.
      count: detail.comments.filter((message) => !message.deleted).length,
      content: (
        <ChatThread
          chat={{ taskId: task.id }}
          messages={detail.comments}
          people={detail.assignable}
          myUserId={myUserId}
          readOnly={readOnly}
          change={change}
          room={room}
          fileRoom={LIMITS.filesPerTask - detail.fields.fileCount}
          emptyText={`No messages yet.${readOnly ? "" : " Type @ to ask someone on the project about this task."}`}
          listClassName="max-h-96"
        />
      ),
    },
    files: {
      count: detail.files.length,
      content: (
        <TaskFileDrop
          taskId={task.id}
          files={detail.files}
          taskFileCount={detail.fields.fileCount}
          readOnly={readOnly}
          refresh={refresh}
          change={change}
          emptyText="No files yet."
        />
      ),
    },
    // Each group a card that folds open, with its answer on the right (Tyler, 14 Oct 2026).
    settings: (
      <>
        <OptionCard
          id="task-settings-person"
          title="Person"
          description="Who does it. Handing it to someone else waits for them to accept."
          summary={task.assignee ? `${task.assignee.name}${task.waiting ? " · waiting" : ""}` : "Nobody"}
        >
          {assigneeField}
          {handoverRow}
          {handBackButton}
        </OptionCard>
        <OptionCard
          id="task-settings-dates"
          title="Dates"
          description="When it starts and when it's due. A time makes it overdue from that minute."
          summary={datesSummary(task)}
        >
          {startField}
          {dueField}
          {dueByField}
        </OptionCard>
        <OptionCard
          id="task-settings-sorting"
          title="Priority and type"
          description="How it's sorted and found: its priority and the kind of task. Its tags are under its title."
          summary={[TASK_PRIORITY_LABEL[task.priority], task.type?.name]
            .filter(Boolean)
            .join(" · ")}
        >
          {priorityField}
          {typeField}
        </OptionCard>
        {detail.canAskForReview ? (
          <OptionCard
            id="task-needs-review"
            title="Needs review"
            hint="When it's marked Done, you get a notice and check it. It still counts as Done meanwhile."
            toggle={{
              checked: task.review.needed,
              disabled: readOnly || busy,
              onChange: (on) =>
                void change(
                  () => setTaskNeedsReview(task.id, on),
                  on ? "You'll review it when it's Done." : "It no longer needs your review."
                ),
            }}
          />
        ) : task.review.needed && task.review.reviewer ? (
          <OptionCard id="task-needs-review" title="Needs review" summary={task.review.reviewer.name} />
        ) : null}
        {detail.fields.type?.fields.length ? (
          <OptionCard
            id="task-settings-fields"
            title={detail.fields.type.name}
            description="What this kind of task asks for."
            summary={`${detail.fields.type.fields.length} ${plural(detail.fields.type.fields.length, "field")}`}
          >
            <div className={INNER_CARD}>{fieldsCard}</div>
          </OptionCard>
        ) : null}
        {linkField ? (
          <OptionCard
            id="task-settings-link"
            title="Video or Promo"
            description="The one record in Video or Promo this task opens, for the person assigned."
            summary={detail.link ? LINKED_APP_INFO[detail.link.app].record : "None"}
          >
            {linkField}
          </OptionCard>
        ) : null}
        <OptionCard
          id="task-settings-plan"
          title="Plan"
          description="What happens next: its milestone, repeating, snoozing, what it waits on, and your own reminder."
          summary={planSummary(detail)}
        >
          <div className={INNER_CARD}>{planCard}</div>
        </OptionCard>
      </>
    ),
    history: historyCard,
    followButton: (
      <Button
        type="button"
        variant="outline"
        size="sm"
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
    detail,
    readOnly,
    move: () => setMoving(true),
    remind: () => setReminding(true),
    askTime: () => setAskingTime(true),
  }

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
    side,
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
    more: readOnly ? null : (
      <TaskMoreMenu
        detail={detail}
        onMove={() => setMoving(true)}
        onRemind={() => setReminding(true)}
        onAskTime={() => setAskingTime(true)}
      />
    ),
    remove: detail.canDelete && !readOnly ? { busy, run: remove } : null,
  })
}

/** A card's own frame and heading, dropped inside an OptionCard that already names it. */
const INNER_CARD =
  "[&_[data-slot=card]]:rounded-none [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:py-0 [&_[data-slot=card]]:ring-0 [&_[data-slot=card-content]]:!px-0 [&_[data-slot=card-header]]:hidden"

/** "Oct 12 to Oct 19", "Due Oct 19 by 3:06 PM", or "No dates", for the Dates card. */
function datesSummary(task: TaskDetail["task"]) {
  const due = task.dueDate ? `${dayLabel(task.dueDate)}${task.dueAt ? ` by ${clockLabel(localTimeOf(task.dueAt))}` : ""}` : null
  if (task.startDate && due) return `${dayLabel(task.startDate)} to ${due}`
  if (due) return `Due ${due}`
  if (task.startDate) return `Starts ${dayLabel(task.startDate)}`
  return "No dates"
}

/** What the Plan holds, in a few words, or "Nothing set". */
function planSummary(detail: TaskDetail) {
  const milestone = detail.milestones.find((one) => one.id === detail.milestoneId)
  const parts = [
    milestone ? milestone.name : null,
    detail.task.repeat ? "Repeats" : null,
    detail.task.snoozedUntil ? `Snoozed to ${dayLabel(detail.task.snoozedUntil)}` : null,
    detail.waitingOn.length ? `Waits on ${detail.waitingOn.length} ${plural(detail.waitingOn.length, "task")}` : null,
    detail.myReminder ? "Reminder set" : null,
  ].filter(Boolean)
  return parts.length ? parts.join(" · ") : "Nothing set"
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

function StepsContent({
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

  async function add() {
    const next = text.trim()
    if (!next) {
      showErrorToast("Type the step first.")
      return
    }
    if (await change(() => addTaskStep(taskId, next))) setText("")
  }

  return (
    <>
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
      {/* The Steps card's footer on the project page, behind its cog; a plain row in the window. */}
      {readOnly ? null : (
        <PanelCardFooter>
          <StepListActions detail={detail} change={change} busy={busy} />
        </PanelCardFooter>
      )}
    </>
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

/**
 * The optional time a task is due by on its due date, on the reader's own
 * clock. It saves when the field is left or Enter is pressed, the same as the
 * other fields here, and Clear makes the task due all day again.
 */
function DueByField({
  task,
  disabled,
  onSave,
}: {
  task: TaskCard
  disabled: boolean
  onSave: (dueAt: string | null) => void
}) {
  const saved = task.dueAt ? localTimeOf(task.dueAt) : ""
  const [time, setTime] = useSyncedDraft(saved)
  function save() {
    if (time === saved) return
    onSave(time ? momentOnDay(task.dueDate!, time) : null)
  }

  return (
    <div className="grid content-start gap-2">
      <Label htmlFor="task-due-by">Due by</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="task-due-by"
          type="time"
          className="w-32"
          value={time}
          disabled={disabled}
          onChange={(event) => setTime(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") save()
          }}
        />
        {task.dueAt && !disabled ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onSave(null)}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  )
}
