import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { reminderSchema, stepListNameSchema, waitSchema } from "@/lib/project/rules"
import { userGet, userPost } from "@/server/guards"
import { addWait, removeWait } from "@/server/project/planning"
import {
  addStepListToTask,
  deleteStepList,
  renameStepList,
  saveStepList,
} from "@/server/project/step-lists"
import { loadMyDays, setTaskReminder } from "@/server/project/task-reminders"

export type { StepList } from "@/server/project/step-lists"

/**
 * Planning a task (More features task 05): what it waits on, my own
 * reminder, the team's saved step lists, and the days the quick due-date
 * buttons land on.
 */

const id = z.string().min(1).max(36)

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

const saveStepListFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskId: id, name: stepListNameSchema }))
  .handler(async ({ data, context }) => saveStepList(context.user, data))

const addStepListFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskId: id, listId: id }))
  .handler(async ({ data, context }) => addStepListToTask(context.user, data))

const renameStepListFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ listId: id, name: stepListNameSchema }))
  .handler(async ({ data, context }) => renameStepList(context.user.id, data))

const deleteStepListFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ listId: id }))
  .handler(async ({ data, context }) => deleteStepList(context.user.id, data.listId))

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
export function saveTaskStepsAsList(taskId: string, name: string) {
  return saveStepListFn({ data: { taskId, name } })
}
export function addStepListTo(taskId: string, listId: string) {
  return addStepListFn({ data: { taskId, listId } })
}
export function renameTeamStepList(listId: string, name: string) {
  return renameStepListFn({ data: { listId, name } })
}
export function deleteTeamStepList(listId: string) {
  return deleteStepListFn({ data: { listId } })
}
export function loadMyQuickDays() {
  return loadMyDaysFn()
}
