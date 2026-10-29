import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  BellRingIcon,
  CalendarClockIcon,
  CopyIcon,
  FolderInputIcon,
  LayoutTemplateIcon,
  Loader2Icon,
  MoreHorizontalIcon,
} from "lucide-react"

import { DueDayPicker } from "@/components/project/due-day-picker"
import type { Change } from "@/components/project/task-body"
import { ProjectDot } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  askForMoreTaskTime,
  duplicateProjectTask,
  moveProjectTask,
  type TaskDetail,
} from "@/lib/api/project/tasks"
import { setReminder } from "@/lib/api/project/planning"
import { saveTaskAsTemplate } from "@/lib/api/project/task-types"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { shortDayLabel } from "@/lib/project/days"
import { PROJECT_ERRORS, getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useEscapeCancels } from "@/lib/project/use-escape-cancels"

export const MOVE_PICKER_ID = "move-task-project"
export const ASK_TIME_DAY_ID = "ask-time-day"

/**
 * Duplicate, Move to project, Remind me and Ask for more time, behind one
 * button beside Follow. A copy opens straight away. The others open a card
 * inside the task, never a window on top of it.
 */
export function TaskMoreMenu({
  detail,
  onMove,
  onRemind,
  onAskTime,
}: {
  detail: TaskDetail
  onMove: () => void
  onRemind: () => void
  onAskTime: () => void
}) {
  const { duplicate, busy } = useDuplicateTask(detail)
  const cantMove = detail.moveTargets.length === 0
  // Choosing Move or Remind me hands the keyboard to its card, so the menu
  // mustn't take it back to its own button as it closes.
  const picked = React.useRef<"move" | "remind" | "ask" | null>(null)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="More for this task" disabled={busy}>
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <MoreHorizontalIcon className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          const card = picked.current
          if (!card) return
          picked.current = null
          event.preventDefault()
          // The reminder's calendar is already open and holds the keyboard.
          if (card === "move") document.getElementById(MOVE_PICKER_ID)?.focus()
          if (card === "ask") document.getElementById(ASK_TIME_DAY_ID)?.focus()
        }}
      >
        <DropdownMenuItem onSelect={() => void duplicate()}>
          <CopyIcon className="size-4" />
          Duplicate
        </DropdownMenuItem>
        <DisabledReason reason="You're not on any other project." disabled={cantMove} className="flex w-full">
          <DropdownMenuItem
            className="w-full"
            disabled={cantMove}
            onSelect={() => {
              picked.current = "move"
              onMove()
            }}
          >
            <FolderInputIcon className="size-4" />
            Move to project
          </DropdownMenuItem>
        </DisabledReason>
        <DropdownMenuItem
          onSelect={() => {
            picked.current = "remind"
            onRemind()
          }}
        >
          <BellRingIcon className="size-4" />
          {detail.myReminder ? "Change my reminder" : "Remind me"}
        </DropdownMenuItem>
        {detail.canAskForTime ? (
          <DropdownMenuItem
            onSelect={() => {
              picked.current = "ask"
              onAskTime()
            }}
          >
            <CalendarClockIcon className="size-4" />
            Ask for more time
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Duplicate: the copy opens straight away, in the same place the task was open. */
function useDuplicateTask(detail: TaskDetail) {
  const router = useRouter()
  const navigate = useNavigate()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  async function duplicate() {
    let copyId = ""
    const ok = await run(async () => {
      copyId = (await duplicateProjectTask(detail.task.id)).id
    }, "Task copied. This is the copy.")
    if (!ok) return
    await router.invalidate()
    void navigate({
      to: ".",
      search: (previous: Record<string, unknown>) => ({ ...previous, task: copyId }),
    })
  }

  return { duplicate, busy }
}

/**
 * The same three as the menu, as rows at the foot of the task's cog dropdown
 * on the project page. Each closes the dropdown first (`onPicked`): Move and
 * Remind me open their card at the top of the task's panel.
 */
export function TaskMoreRows({
  detail,
  onMove,
  onRemind,
  onAskTime,
  onPicked,
}: {
  detail: TaskDetail
  onMove: () => void
  onRemind: () => void
  onAskTime: () => void
  onPicked: () => void
}) {
  const { duplicate, busy } = useDuplicateTask(detail)
  const cantMove = detail.moveTargets.length === 0
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="justify-start"
        disabled={busy}
        onClick={() => {
          onPicked()
          void duplicate()
        }}
      >
        {busy ? <Loader2Icon className="size-4 animate-spin" /> : <CopyIcon className="size-4" />}
        Duplicate task
      </Button>
      <DisabledReason reason="You're not on any other project." disabled={cantMove} className="flex w-full">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start"
          disabled={cantMove}
          onClick={() => {
            onPicked()
            onMove()
          }}
        >
          <FolderInputIcon className="size-4" />
          Move to project
        </Button>
      </DisabledReason>
      <Button
        type="button"
        variant="ghost"
        className="justify-start"
        onClick={() => {
          onPicked()
          onRemind()
        }}
      >
        <BellRingIcon className="size-4" />
        {detail.myReminder ? "Change my reminder" : "Remind me"}
      </Button>
      {detail.canAskForTime ? (
        <Button
          type="button"
          variant="ghost"
          className="justify-start"
          onClick={() => {
            onPicked()
            onAskTime()
          }}
        >
          <CalendarClockIcon className="size-4" />
          Ask for more time
        </Button>
      ) : null}
      {detail.canSaveTemplate ? <SaveAsTemplateRow detail={detail} onSaved={onPicked} /> : null}
    </>
  )
}

/**
 * "Save as task template" (Tyler, 28 Oct 2026, Misc 4). The row opens in
 * place into a name box, started on the task's title and selected, with Save
 * and Cancel. The new template holds the task's steps with their fields, its
 * notes, and its template's fields, and New task offers it at once.
 */
function SaveAsTemplateRow({ detail, onSaved }: { detail: TaskDetail; onSaved: () => void }) {
  const [naming, setNaming] = React.useState(false)
  const [name, setName] = React.useState("")
  const [run, saving] = useAsyncAction(getProjectErrorMessage)
  const router = useRouter()

  async function save() {
    const next = name.trim()
    if (!next) {
      showErrorToast("Give the template a name.")
      return
    }
    const ok = await run(
      () => saveTaskAsTemplate(detail.task.id, next),
      `Saved "${next}". Pick it as the template in New task.`
    )
    if (!ok) return
    setNaming(false)
    onSaved()
    await router.invalidate()
  }

  if (!naming) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="justify-start"
        onClick={() => {
          setName(detail.task.title.slice(0, LIMITS.typeName))
          setNaming(true)
        }}
      >
        <LayoutTemplateIcon className="size-4" />
        Save as task template
      </Button>
    )
  }
  return (
    <form
      className="grid gap-2 rounded-md p-2"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <Label htmlFor="save-task-template-name">Template name</Label>
      <Input
        id="save-task-template-name"
        value={name}
        maxLength={LIMITS.typeName}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation()
            setNaming(false)
          }
        }}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setNaming(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </form>
  )
}

/**
 * Move to project, inside the task like the Stuck reason row: a project
 * picker with Move task and Cancel. Escape cancels it before it closes the
 * window. A moved task follows its project when the page was that project's.
 */
export function MoveTaskCard({ detail, onDone }: { detail: TaskDetail; onDone: () => void }) {
  const router = useRouter()
  const navigate = useNavigate()
  const { task, moveTargets } = detail
  const [target, setTarget] = React.useState(moveTargets[0]?.id ?? "")
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const chosen = moveTargets.find((project) => project.id === target)
  const frame = React.useRef<HTMLDivElement>(null)
  useEscapeCancels(frame, onDone)

  // It opens from the menu at the top, so it scrolls into sight. The menu
  // puts the keyboard on its picker once the menu has closed.
  React.useEffect(() => {
    frame.current?.scrollIntoView({ block: "nearest" })
  }, [])

  async function move() {
    if (!chosen) return
    const ok = await run(() => moveProjectTask(task.id, chosen.id), `Moved to ${chosen.name}.`)
    if (!ok) return
    onDone()
    // On the old project's page the task has left; follow it to its new one.
    if (router.state.location.pathname.startsWith(`/projects/${task.projectId}`)) {
      void navigate({
        to: "/projects/$projectId",
        params: { projectId: chosen.id },
        search: { task: task.id },
      })
      return
    }
    await router.invalidate()
  }

  return (
    <Card size="sm" ref={frame}>
      <CardHeader>
        <CardTitle>Move to project</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Its steps, chat, files, tags and history go with it.
        </p>
        <div className="grid gap-2">
          <Label htmlFor={MOVE_PICKER_ID}>Project</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id={MOVE_PICKER_ID} className="w-full sm:w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {moveTargets.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <ProjectDot color={project.color} />
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" disabled={busy || !chosen} onClick={() => void move()}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Move task
              </Button>
            </div>
          </div>
          {chosen && !chosen.keepsAssignee && task.assignee ? (
            <p className="text-sm text-muted-foreground">
              {task.assignee.name} isn't on {chosen.name}, so the task moves with nobody assigned.
            </p>
          ) : null}
          {chosen && !chosen.offersType && task.type ? (
            <p className="text-sm text-muted-foreground">
              {chosen.name} doesn't offer {task.type.name}. The task keeps its type and its fields.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * "Remind me", inside the task like Move: pick a day, and on it, at my own
 * check-in time, the bell says "Reminder: <title>". It is mine alone. The
 * calendar opens at once with the quick days above it.
 */
export function ReminderCard({
  detail,
  change,
  onDone,
}: {
  detail: TaskDetail
  change: Change
  onDone: () => void
}) {
  const frame = React.useRef<HTMLDivElement>(null)
  useEscapeCancels(frame, onDone)
  React.useEffect(() => {
    frame.current?.scrollIntoView({ block: "nearest" })
  }, [])

  async function pick(day: string | null) {
    if (!day) return
    const ok = await change(
      () => setReminder(detail.task.id, day),
      `You'll get a reminder on ${shortDayLabel(day)}, at your check-in time.`
    )
    if (ok) onDone()
  }

  return (
    <Card size="sm" ref={frame}>
      <CardHeader>
        <CardTitle>Remind me</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          On the day you pick, at your check-in time, you get a notice in the bell. Only you see it.
        </p>
        <div className="grid gap-2">
          <Label htmlFor="task-reminder-day">Day</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <DueDayPicker
              id="task-reminder-day"
              value={detail.myReminder}
              placeholder="Pick a day"
              defaultOpen
              className="sm:w-fit"
              onChange={(day) => void pick(day)}
            />
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" onClick={onDone}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Ask for more time, inside the task like Remind me (Seven features, part 2):
 * a later day and one line of why, sent to whoever handed the task out, or
 * the site admin when nobody did. Nothing changes until they answer.
 */
export function AskTimeCard({
  detail,
  change,
  onDone,
}: {
  detail: TaskDetail
  change: Change
  onDone: () => void
}) {
  const { task } = detail
  const frame = React.useRef<HTMLDivElement>(null)
  const [day, setDay] = React.useState<string | null>(detail.moreTime?.day ?? null)
  const [reason, setReason] = React.useState("")
  const [invalid, setInvalid] = React.useState<"day" | "reason" | null>(null)
  useEscapeCancels(frame, onDone)
  React.useEffect(() => {
    frame.current?.scrollIntoView({ block: "nearest" })
  }, [])
  const answerer =
    task.assignedBy && task.assignedBy.id !== task.assignee?.id ? task.assignedBy.name : "the site admin"

  async function ask() {
    if (!day || (task.dueDate && day <= task.dueDate)) {
      setInvalid("day")
      showErrorToast(PROJECT_ERRORS.askForLaterDay)
      return
    }
    if (!reason.trim()) {
      setInvalid("reason")
      showErrorToast("Say in a line why it needs more time.")
      return
    }
    const ok = await change(
      () => askForMoreTaskTime({ taskId: task.id, day, reason: reason.trim() }),
      `Asked ${answerer} for ${shortDayLabel(day)}.`
    )
    if (ok) onDone()
  }

  return (
    <Card size="sm" ref={frame}>
      <CardHeader>
        <CardTitle>Ask for more time</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {task.dueDate ? `It's due ${shortDayLabel(task.dueDate)}. ` : ""}
          {answerer === "the site admin" ? "The site admin" : answerer} gets a notice and says yes or no. The date
          only moves on a yes.
        </p>
        <div className="grid gap-2">
          <Label htmlFor={ASK_TIME_DAY_ID}>New due date</Label>
          <DueDayPicker
            id={ASK_TIME_DAY_ID}
            value={day}
            placeholder="Pick a later day"
            className="sm:w-fit"
            aria-invalid={invalid === "day"}
            onChange={(next) => {
              setDay(next)
              setInvalid(null)
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ask-time-reason">Why</Label>
          <Input
            id="ask-time-reason"
            value={reason}
            maxLength={LIMITS.reason}
            placeholder="Waiting on the client's photos"
            aria-invalid={invalid === "reason" || undefined}
            onChange={(event) => {
              setReason(event.target.value)
              setInvalid(null)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void ask()
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void ask()}>
            Ask for more time
          </Button>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
