import { createServerFn } from "@tanstack/react-start"

import { reminderSchema, waitSchema } from "@/lib/project/rules"
import { userGet, userPost } from "@/server/guards"
import { addWait, removeWait } from "@/server/project/planning"
import { loadMyDays, setTaskReminder } from "@/server/project/task-reminders"

/**
 * Planning a task (More features task 05): what it waits on, my own
 * reminder, and the days the quick due-date buttons land on.
 */

const addWaitFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(waitSchema)
  .handler(async ({ data, context }) => addWait(context.user, data))

const removeWaitFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(waitSchema)
  .handler(async ({ data, context }) => removeWait(context.user, data))

const setReminderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(reminderSchema)
  .handler(async ({ data, context }) => setTaskReminder(context.user, data))

const loadMyDaysFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadMyDays(context.user.id))

export function addTaskWait(taskId: string, waitingOnTaskId: string) {
  return addWaitFn({ data: { taskId, waitingOnTaskId } })
}
export function removeTaskWait(taskId: string, waitingOnTaskId: string) {
  return removeWaitFn({ data: { taskId, waitingOnTaskId } })
}
export function setReminder(taskId: string, day: string | null) {
  return setReminderFn({ data: { taskId, day } })
}
export function loadMyQuickDays() {
  return loadMyDaysFn()
}
