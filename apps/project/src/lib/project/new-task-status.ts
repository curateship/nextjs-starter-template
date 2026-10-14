import { setStatus } from "@/lib/api/project/tasks"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * A task made from a Board column's "+" goes into that column. Every task is
 * made in To do, so this moves it with the same status change a drag makes,
 * which keeps Done's "needed before Done" fields and Stuck's notice. A move
 * that is refused leaves the task in To do and says why, and the task is not
 * made again.
 */
export async function moveNewTasks(taskIds: string[], status: TaskStatus, stuckReason: string | null) {
  if (status === "todo" || taskIds.length === 0) return
  try {
    for (const taskId of taskIds) {
      await setStatus({ taskId, status, stuckReason: status === "stuck" ? stuckReason : null })
    }
  } catch (error) {
    showErrorToast(
      `The task was made, but stays in To do instead of ${TASK_STATUS_LABEL[status]}. ${getProjectErrorMessage(error)}`
    )
  }
}
