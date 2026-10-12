import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  LIMITS,
  acceptManySchema,
  assignTaskSchema,
  needsReviewSchema,
  reviewSchema,
  bulkChangeSchema,
  createTasksFromLinesSchema,
  setRepeatSchema,
  setWaitingOnSchema,
  updateStepSchema,
  commentSchema,
  createTaskSchema,
  editCommentSchema,
  reasonSchema,
  setTaskStatusSchema,
  updateTaskSchema,
} from "@/lib/project/rules"
import { userGet, userPost } from "@/server/guards"
import { findMembership } from "@/server/project/access"
import { projectNoticeDetailsFor } from "@/server/project/notices"
import {
  changeManyTasks,
  createTasksFromLines as createTasksFromLinesOnServer,
  duplicateTask,
  listNewTaskProjects,
  moveTask,
  promoteStep,
} from "@/server/project/task-changes"
import { addComment, deleteComment, editComment } from "@/server/project/task-chat"
import {
  emptyProjectBin,
  findTasksToWaitOn,
  loadProjectBin,
  restoreTask,
  setRepeat,
  setWaitingOn,
} from "@/server/project/planning"
import { followTask, unfollowTask } from "@/server/project/task-followers"
import { reviewTask, setNeedsReview } from "@/server/project/task-review"
import { thankForTask } from "@/server/project/task-thanks"
import { eachOf } from "@/server/project/teams"
import {
  acceptManyTasks,
  acceptTask,
  addStep,
  assignTask,
  createTask,
  deleteStep,
  deleteTask,
  handBackTask,
  loadTaskDetail,
  setTaskStatus,
  updateStep,
  updateTask,
} from "@/server/project/tasks"

export type { TaskComment } from "@/server/project/task-chat"
export type { BinEntry, ProjectBin, RepeatRule, TaskChoice } from "@/server/project/planning"
export type {
  BulkChange,
  BulkOutcome,
  MoveTarget,
  NewTaskProject,
} from "@/server/project/task-changes"
export type { TaskFile } from "@/server/project/task-files"
export type { AcceptOutcome, TaskCard, TaskDetail, TaskStep } from "@/server/project/tasks"

const id = z.string().min(1).max(36)
const stepText = z.string().trim().min(1, "A step can't be empty.").max(LIMITS.stepText)

const loadTaskFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ taskId: id }))
  .handler(async ({ data, context }) => loadTaskDetail(context.user.id, data.taskId))

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
  .inputValidator(updateStepSchema)
  .handler(async ({ data, context }) => updateStep(context.user, data))

const createManyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createTasksFromLinesSchema)
  .handler(async ({ data, context }) => createTasksFromLinesOnServer(context.user, data))

const duplicateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskId: id }))
  .handler(async ({ data, context }) => duplicateTask(context.user, data.taskId))

const moveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskId: id, projectId: id }))
  .handler(async ({ data, context }) => moveTask(context.user, data))

const promoteStepFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ stepId: id }))
  .handler(async ({ data, context }) => promoteStep(context.user, data.stepId))

const changeManyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(bulkChangeSchema)
  .handler(async ({ data, context }) => changeManyTasks(context.user, data))

const setRepeatFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(setRepeatSchema)
  .handler(async ({ data, context }) => setRepeat(context.user, data))

const setWaitingOnFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(setWaitingOnSchema)
  .handler(async ({ data, context }) => setWaitingOn(context.user, data))

const findTasksFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ taskId: id, q: z.string().max(200) }))
  .handler(async ({ data, context }) => findTasksToWaitOn(context.user.id, data))

const restoreFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskId: id }))
  .handler(async ({ data, context }) => restoreTask(context.user, data.taskId))

const loadBinFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ data, context }) => loadProjectBin(context.user.id, data.projectId))

const emptyBinFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ data, context }) => emptyProjectBin(context.user.id, data.projectId))

/** The projects New task can make a task in, for the header's button. */
const loadNewTaskProjectsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    const membership = await findMembership(context.user.id)
    return membership
      ? listNewTaskProjects(membership, {
          id: context.user.id,
          name: context.user.name,
          avatarUrl: context.user.avatarUrl ?? "",
        })
      : []
  })

const deleteStepFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ stepId: id }))
  .handler(async ({ data, context }) => deleteStep(context.user, data.stepId))

const addCommentFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(commentSchema)
  .handler(async ({ data, context }) => addComment(context.user, data))

const editCommentFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(editCommentSchema)
  .handler(async ({ data, context }) => editComment(context.user, data))

const deleteCommentFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ commentId: id }))
  .handler(async ({ data, context }) => deleteComment(context.user, data.commentId))

const followFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskId: id, follow: z.boolean() }))
  .handler(async ({ data, context }) =>
    data.follow
      ? followTask(context.user.id, data.taskId)
      : unfollowTask(context.user.id, data.taskId)
  )

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
export function updateTaskStep(data: z.input<typeof updateStepSchema>) {
  return updateStepFn({ data })
}
export function createTasksFromLines(data: z.input<typeof createTasksFromLinesSchema>) {
  return createManyFn({ data })
}
export function duplicateProjectTask(taskId: string) {
  return duplicateFn({ data: { taskId } })
}
export function moveProjectTask(taskId: string, projectId: string) {
  return moveFn({ data: { taskId, projectId } })
}
export function turnStepIntoTask(stepId: string) {
  return promoteStepFn({ data: { stepId } })
}
export function changeTasks(data: z.input<typeof bulkChangeSchema>) {
  return changeManyFn({ data })
}
export function setTaskRepeat(data: z.input<typeof setRepeatSchema>) {
  return setRepeatFn({ data })
}
export function setTaskWaitingOn(taskId: string, waitingOnTaskId: string | null) {
  return setWaitingOnFn({ data: { taskId, waitingOnTaskId } })
}
export function findTasksToWaitFor(taskId: string, q: string) {
  return findTasksFn({ data: { taskId, q } })
}
export function restoreProjectTask(taskId: string) {
  return restoreFn({ data: { taskId } })
}
export function loadBin(projectId: string) {
  return loadBinFn({ data: { projectId } })
}
export function emptyBin(projectId: string) {
  return emptyBinFn({ data: { projectId } })
}
export function loadNewTaskProjects() {
  return loadNewTaskProjectsFn()
}
export function deleteTaskStep(stepId: string) {
  return deleteStepFn({ data: { stepId } })
}
export function addTaskComment(data: z.input<typeof commentSchema>) {
  return addCommentFn({ data })
}
export function editTaskComment(data: z.input<typeof editCommentSchema>) {
  return editCommentFn({ data })
}
export function deleteTaskComment(commentId: string) {
  return deleteCommentFn({ data: { commentId } })
}
export function followProjectTask(taskId: string, follow: boolean) {
  return followFn({ data: { taskId, follow } })
}
export function loadProjectNoticeDetails(notificationIds: readonly string[]) {
  return loadNoticeDetailsFn({ data: { notificationIds: [...notificationIds] } })
}

const acceptManyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(acceptManySchema)
  .handler(async ({ data, context }) => acceptManyTasks(context.user, data.taskIds))

const needsReviewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(needsReviewSchema)
  .handler(async ({ data, context }) => setNeedsReview(context.user, data))

const reviewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(reviewSchema)
  .handler(async ({ data, context }) => reviewTask(context.user, data))

const thankFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskId: id }))
  .handler(async ({ data, context }) => thankForTask(context.user, data.taskId))

export function acceptTasks(taskIds: string[]) {
  return acceptManyFn({ data: { taskIds } })
}
export function setTaskNeedsReview(taskId: string, on: boolean) {
  return needsReviewFn({ data: { taskId, on } })
}
export function reviewProjectTask(data: z.input<typeof reviewSchema>) {
  return reviewFn({ data })
}
export function thankForProjectTask(taskId: string) {
  return thankFn({ data: { taskId } })
}
