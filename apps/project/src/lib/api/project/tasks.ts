import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  LIMITS,
  assignTaskSchema,
  commentSchema,
  createTaskSchema,
  reasonSchema,
  setTaskStatusSchema,
  updateTaskSchema,
} from "@/lib/project/rules"
import { userGet, userPost } from "@/server/guards"
import { findMembership } from "@/server/project/access"
import { listInvitesForMe } from "@/server/project/invites"
import { projectNoticeDetailsFor } from "@/server/project/notices"
import { eachOf } from "@/server/project/teams"
import {
  acceptTask,
  addComment,
  addStep,
  assignTask,
  createTask,
  deleteStep,
  deleteTask,
  handBackTask,
  loadMyWork,
  loadTaskDetail,
  setTaskStatus,
  updateStep,
  updateTask,
} from "@/server/project/tasks"

export type { TaskCard, TaskComment, TaskDetail, TaskStep } from "@/server/project/tasks"

const id = z.string().min(1).max(36)
const stepText = z.string().trim().min(1, "A step can't be empty.").max(LIMITS.stepText)

const loadTaskFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ taskId: id }))
  .handler(async ({ data, context }) => loadTaskDetail(context.user.id, data.taskId))

/** My work, plus what the page needs when there is no team yet. */
const loadMyWorkFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    const membership = await findMembership(context.user.id)
    if (!membership) {
      return { onTeam: false, tasks: [], invites: await listInvitesForMe(context.user) }
    }
    return { onTeam: true, tasks: await loadMyWork(context.user.id), invites: [] }
  })

const createTaskFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createTaskSchema)
  .handler(async ({ data, context }) => createTask(context.user, data))

const updateTaskFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateTaskSchema)
  .handler(async ({ data, context }) => updateTask(context.user, data))

const setStatusFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(setTaskStatusSchema)
  .handler(async ({ data, context }) => setTaskStatus(context.user, data))

const markManyDoneFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskIds: z.array(id).min(1).max(200) }))
  .handler(async ({ data, context }) =>
    eachOf(data.taskIds, (taskId) =>
      setTaskStatus(context.user, { taskId, status: "done", stuckReason: null })
    )
  )

const assignFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(assignTaskSchema)
  .handler(async ({ data, context }) => assignTask(context.user, data))

const acceptFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskId: id }))
  .handler(async ({ data, context }) => acceptTask(context.user, data.taskId))

const handBackFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskId: id, reason: reasonSchema }))
  .handler(async ({ data, context }) => handBackTask(context.user, data))

const deleteTaskFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskId: id }))
  .handler(async ({ data, context }) => deleteTask(context.user, data.taskId))

const addStepFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskId: id, text: stepText }))
  .handler(async ({ data, context }) => addStep(context.user, data))

const updateStepFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ stepId: id, text: stepText.optional(), done: z.boolean().optional() })
  )
  .handler(async ({ data, context }) => updateStep(context.user, data))

const deleteStepFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ stepId: id }))
  .handler(async ({ data, context }) => deleteStep(context.user, data.stepId))

const addCommentFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(commentSchema)
  .handler(async ({ data, context }) => addComment(context.user, data))

/**
 * Where the bell's Project notices open. The cap leaves room over the tray's
 * page of twenty and keeps one request from becoming an unbounded lookup.
 */
const loadNoticeDetailsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ notificationIds: z.array(id).max(100) }))
  .handler(async ({ data, context }) =>
    projectNoticeDetailsFor(context.user.id, data.notificationIds)
  )

export function loadTask(taskId: string) {
  return loadTaskFn({ data: { taskId } })
}
export function loadMyWorkPage() {
  return loadMyWorkFn()
}
export function createProjectTask(data: z.input<typeof createTaskSchema>) {
  return createTaskFn({ data })
}
export function saveTask(data: z.input<typeof updateTaskSchema>) {
  return updateTaskFn({ data })
}
export function setStatus(data: z.input<typeof setTaskStatusSchema>) {
  return setStatusFn({ data })
}
export function markTasksDone(taskIds: string[]) {
  return markManyDoneFn({ data: { taskIds } })
}
export function assignProjectTask(data: z.input<typeof assignTaskSchema>) {
  return assignFn({ data })
}
export function acceptProjectTask(taskId: string) {
  return acceptFn({ data: { taskId } })
}
export function handBackProjectTask(taskId: string, reason: string) {
  return handBackFn({ data: { taskId, reason } })
}
export function deleteProjectTask(taskId: string) {
  return deleteTaskFn({ data: { taskId } })
}
export function addTaskStep(taskId: string, text: string) {
  return addStepFn({ data: { taskId, text } })
}
export function updateTaskStep(data: { stepId: string; text?: string; done?: boolean }) {
  return updateStepFn({ data })
}
export function deleteTaskStep(stepId: string) {
  return deleteStepFn({ data: { stepId } })
}
export function addTaskComment(data: z.input<typeof commentSchema>) {
  return addCommentFn({ data })
}
export function loadProjectNoticeDetails(notificationIds: readonly string[]) {
  return loadNoticeDetailsFn({ data: { notificationIds: [...notificationIds] } })
}
