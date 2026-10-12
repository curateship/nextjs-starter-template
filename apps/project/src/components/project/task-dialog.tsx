import * as React from "react"
import { Loader2Icon, Trash2Icon } from "lucide-react"

import {
  DELETE_TASK_DETAIL,
  DELETE_TASK_QUESTION,
  TaskView,
  type TaskParts,
} from "@/components/project/task-body"
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
import { useEscapeCancels } from "@/lib/project/use-escape-cancels"

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
  // The question stays in the footer, never a second window; Escape keeps the task.
  const footer = React.useRef<HTMLDivElement>(null)
  useEscapeCancels(footer, () => setConfirmDelete(false))

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
      <DialogFooter ref={confirmDelete ? footer : undefined} className="flex-wrap">
        {remove && confirmDelete ? (
          <>
            <p className="mr-auto basis-full text-sm sm:basis-auto sm:flex-1">
              <span className="font-medium">{DELETE_TASK_QUESTION}</span> {DELETE_TASK_DETAIL}
            </p>
            <Button type="button" variant="outline" disabled={remove.busy} onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              autoFocus
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
          </>
        ) : (
          <>
            {remove ? (
              <Button
                type="button"
                variant="outline"
                className="mr-auto"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2Icon className="size-4" />
                Delete task
              </Button>
            ) : null}
            {parts.follow}
            {parts.more}
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  )
}
