import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { CopyIcon, FolderInputIcon, Loader2Icon, MoreHorizontalIcon } from "lucide-react"

import { ProjectDot } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

/**
 * Duplicate and Move to project, behind one button beside Follow. A copy
 * opens straight away; a moved task follows its project when the page was
 * that project's.
 */
export function TaskMoreMenu({ detail }: { detail: TaskDetail }) {
  const router = useRouter()
  const navigate = useNavigate()
  const [moving, setMoving] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const { task } = detail

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
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="More for this task" disabled={busy}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <MoreHorizontalIcon className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void duplicate()}>
            <CopyIcon className="size-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={detail.moveTargets.length === 0}
            onSelect={() => setMoving(true)}
          >
            <FolderInputIcon className="size-4" />
            Move to project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MoveTaskDialog detail={detail} open={moving} onClose={() => setMoving(false)} />
    </>
  )
}

function MoveTaskDialog({
  detail,
  open,
  onClose,
}: {
  detail: TaskDetail
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const { task, moveTargets } = detail
  const [target, setTarget] = React.useState(moveTargets[0]?.id ?? "")
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const chosen = moveTargets.find((project) => project.id === target)

  async function move() {
    if (!chosen) return
    const ok = await run(() => moveProjectTask(task.id, chosen.id), `Moved to ${chosen.name}.`)
    if (!ok) return
    onClose()
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
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to project</DialogTitle>
          <DialogDescription>
            Its steps, chat, files, labels and history go with it. It leaves its section behind.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-2">
            <Label htmlFor="move-task-project">Project</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="move-task-project" className="w-full sm:w-fit">
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
            {chosen && !chosen.keepsAssignee && task.assignee ? (
              <p className="text-sm text-muted-foreground">
                {task.assignee.name} isn't on {chosen.name}, so the task moves with nobody
                assigned.
              </p>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || !chosen} onClick={() => void move()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Move task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
