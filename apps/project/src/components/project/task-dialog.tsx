import * as React from "react"
import { Loader2Icon, Trash2Icon } from "lucide-react"

import { TaskView, type TaskParts } from "@/components/project/task-body"
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

/**
 * One task as a window over the page, which is how the Team dashboard opens a
 * task, because its middle panel is a calendar rather than a task list. The
 * project page and My dashboard open a task in their middle panel instead
 * (`task-in-place.tsx`). Both draw the same `TaskView`.
 */
export function TaskDialog({
  taskId,
  onClose,
}: {
  taskId: string | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(taskId)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-2xl">
        {taskId ? (
          <TaskView key={taskId} taskId={taskId}>
            {(parts) => <TaskWindow parts={parts} onClose={onClose} />}
          </TaskView>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function TaskWindow({ parts, onClose }: { parts: TaskParts; onClose: () => void }) {
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const { remove } = parts

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex min-w-0 items-center gap-2 pr-8">
          <span className="truncate">{parts.title}</span>
          {parts.badges}
        </DialogTitle>
        <DialogDescription className={parts.description ? undefined : "sr-only"}>
          {parts.description ?? "Loading the task."}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>{parts.body}</DialogBody>
      <DialogFooter>
        {remove ? (
          confirmDelete ? (
            <div className="mr-auto flex flex-wrap items-center gap-2">
              <span className="text-sm">Delete this task for everyone?</span>
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={remove.busy}
                onClick={() =>
                  void remove.run().then((ok) => {
                    if (ok) onClose()
                  })
                }
              >
                {remove.busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Delete task
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2Icon className="size-4" />
              Delete
            </Button>
          )
        ) : null}
        {parts.follow}
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  )
}
