import * as React from "react"
import { Trash2Icon } from "lucide-react"

import { TaskView, type TaskParts } from "@/components/project/task-body"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * A task opened in the middle panel, in the task list's place. Tyler asked for
 * this on 10 Oct 2026 for the project page and My dashboard, so a task opens
 * without leaving the page. It is the one exception to the shell's rule that
 * a record opens as a window over its list (see
 * `workspace/docs/projects-and-tasks.md`).
 *
 * The list stays mounted underneath, hidden and out of reach of the keyboard,
 * so Back finds it on the same tab and scrolled to the same spot.
 */
export function TaskInPlace({
  taskId,
  onBack,
  children,
}: {
  taskId: string | undefined
  onBack: () => void
  /** The task list the task takes the place of. */
  children: React.ReactNode
}) {
  const lastFocus = React.useRef<HTMLElement | null>(null)

  // Back puts the keyboard where it was in the list, usually the row clicked.
  React.useEffect(() => {
    if (!taskId && lastFocus.current?.isConnected) {
      lastFocus.current.focus({ preventScroll: true })
    }
  }, [taskId])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        className={cn("flex min-h-0 flex-1 flex-col", taskId && "invisible")}
        inert={Boolean(taskId)}
        onFocusCapture={(event) => {
          lastFocus.current = event.target as HTMLElement
        }}
      >
        {children}
      </div>
      {taskId ? (
        <div className="absolute inset-0 flex flex-col">
          <TaskView key={taskId} taskId={taskId}>
            {(parts) => <TaskPanel parts={parts} onBack={onBack} />}
          </TaskView>
        </div>
      ) : null}
    </div>
  )
}

function TaskPanel({ parts, onBack }: { parts: TaskParts; onBack: () => void }) {
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const frame = React.useRef<HTMLDivElement>(null)
  const { remove } = parts

  // Opening a task moves the keyboard into it, so Tab starts from Back.
  React.useEffect(() => {
    frame.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div
      ref={frame}
      tabIndex={-1}
      className="flex min-h-0 flex-1 flex-col outline-none"
      aria-label={parts.title}
      role="region"
    >
      <DashboardCardTitleHeader
        icon={null}
        back={{ label: "Back to the tasks", onClick: onBack }}
        title={parts.title}
        action={
          <div className="flex items-center gap-2">
            {parts.follow}
            {remove ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Delete task"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete task</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-4 p-3">
          {parts.description ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {parts.badges}
              <span>{parts.description}</span>
            </div>
          ) : null}
          {parts.body}
        </div>
      </ScrollArea>
      {remove ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete this task?"
          description={`"${parts.title}" and its steps, chat and files are deleted for everyone.`}
          confirmLabel="Delete task"
          destructive
          loading={remove.busy}
          onConfirm={() =>
            void remove.run().then((ok) => {
              if (!ok) return
              setConfirmDelete(false)
              onBack()
            })
          }
        />
      ) : null}
    </div>
  )
}
