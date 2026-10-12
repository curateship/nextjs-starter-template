import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { CopyIcon, FolderInputIcon, Loader2Icon, MoreHorizontalIcon } from "lucide-react"

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
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { useEscapeCancels } from "@/lib/project/use-escape-cancels"

const MOVE_PICKER_ID = "move-task-project"

/**
 * Duplicate and Move to project, behind one button beside Follow. A copy
 * opens straight away. Move opens `MoveTaskCard` inside the task, never a
 * window on top of it.
 */
export function TaskMoreMenu({ detail, onMove }: { detail: TaskDetail; onMove: () => void }) {
  const router = useRouter()
  const navigate = useNavigate()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const { task } = detail
  const cantMove = detail.moveTargets.length === 0
  // Choosing Move hands the keyboard to the Move card, so the menu mustn't
  // take it back to its own button as it closes.
  const movePicked = React.useRef(false)

  async function duplicate() {
    let copyId = ""
    const ok = await run(async () => {
      copyId = (await duplicateProjectTask(task.id)).id
    }, "Task copied. This is the copy.")
    if (!ok) return
    await router.invalidate()
    void navigate({
      to: ".",
      search: (previous: Record<string, unknown>) => ({ ...previous, task: copyId }),
    })
  }

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
          if (!movePicked.current) return
          movePicked.current = false
          event.preventDefault()
          document.getElementById(MOVE_PICKER_ID)?.focus()
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
              movePicked.current = true
              onMove()
            }}
          >
            <FolderInputIcon className="size-4" />
            Move to project
          </DropdownMenuItem>
        </DisabledReason>
      </DropdownMenuContent>
    </DropdownMenu>
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
          Its steps, chat, files, labels and history go with it. It leaves its section behind.
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
