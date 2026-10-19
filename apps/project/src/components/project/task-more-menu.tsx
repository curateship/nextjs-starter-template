import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { BellRingIcon, CopyIcon, FolderInputIcon, Loader2Icon, MoreHorizontalIcon } from "lucide-react"

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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  duplicateProjectTask,
  moveProjectTask,
  type TaskDetail,
} from "@/lib/api/project/tasks"
import { setReminder } from "@/lib/api/project/planning"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { shortDayLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { useEscapeCancels } from "@/lib/project/use-escape-cancels"

export const MOVE_PICKER_ID = "move-task-project"

/**
 * Duplicate, Move to project and Remind me, behind one button beside Follow.
 * A copy opens straight away. Move and Remind me open a card inside the task,
 * never a window on top of it.
 */
export function TaskMoreMenu({
  detail,
  onMove,
  onRemind,
}: {
  detail: TaskDetail
  onMove: () => void
  onRemind: () => void
}) {
  const { duplicate, busy } = useDuplicateTask(detail)
  const cantMove = detail.moveTargets.length === 0
  // Choosing Move or Remind me hands the keyboard to its card, so the menu
  // mustn't take it back to its own button as it closes.
  const picked = React.useRef<"move" | "remind" | null>(null)

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
  onPicked,
}: {
  detail: TaskDetail
  onMove: () => void
  onRemind: () => void
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
    </>
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
