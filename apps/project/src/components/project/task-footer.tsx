import * as React from "react"
import { CheckIcon } from "lucide-react"

import type { Change } from "@/components/project/task-body"
import { Button } from "@/components/ui/button"
import { setStatus, type TaskDetail } from "@/lib/api/project/tasks"
import { PANEL_FOOTER_PADDING } from "@/lib/layout/panel-gutter"
import { cn } from "@/lib/utils"

/**
 * The open task's footer, pinned to the side panel's bottom with a line above
 * it, so the status and the one way to finish the task stay in reach while the
 * rest scrolls. Left to right: the status dropdown, then Completed, which
 * moves the task to Done through the usual checks. Completed is hidden while
 * the task is read only or already Done, so no button sits there greyed out.
 */
export function TaskFooter({
  detail,
  status,
  change,
  busy,
  readOnly,
}: {
  detail: TaskDetail
  /** The status dropdown, the same one the task used to have in its header. */
  status: React.ReactNode
  change: Change
  busy: boolean
  readOnly: boolean
}) {
  const { task } = detail

  return (
    <div className={cn("flex shrink-0 flex-wrap items-center gap-2 border-t", PANEL_FOOTER_PADDING)}>
      {status}
      {readOnly || task.status === "done" ? null : (
        <Button
          type="button"
          className="ml-auto"
          disabled={busy}
          onClick={() => void change(() => setStatus({ taskId: task.id, status: "done", stuckReason: null }))}
        >
          <CheckIcon className="size-4" />
          Completed
        </Button>
      )}
    </div>
  )
}
