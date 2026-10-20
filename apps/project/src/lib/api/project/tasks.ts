import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  LIMITS,
  acceptManySchema,
  assignTaskSchema,
  needsReviewSchema,
  reviewSchema,
  answerTimeSchema,
  askForTimeSchema,
  bulkChangeSchema,
  createTasksFromLinesSchema,
  setRepeatSchema,
  updateStepSchema,
  reasonSchema,
  setTaskStatusSchema,
  updateTaskSchema,
} from "@/lib/project/rules"
import { teamScope } from "@/lib/api/project/scope"
import { newTaskSchema } from "@/lib/project/task-types"
import { userGet, userPost } from "@/server/guards"
import { findMembership, isSiteAdmin } from "@/server/project/access"
import { projectNoticeDetailsFor } from "@/server/project/notices"
import { listTeamNames } from "@/server/project/record-team"
import {
  changeManyTasks,
  createTasksFromLines as createTasksFromLinesOnServer,
  duplicateTask,
  listNewTaskProjects,
  moveTask,
  promoteStep,
} from "@/server/project/task-changes"
import {
  emptyProjectBin,
  findTasksToWaitOn,
  loadProjectBin,
  restoreTask,
  setRepeat,
} from "@/server/project/planning"
import { followTask, unfollowTask } from "@/server/project/task-followers"
import { listNoteVersions, restoreNoteVersion } from "@/server/project/task-note-versions"
import { answerMoreTime, askForMoreTime } from "@/server/project/more-time"
import { reviewTask, setNeedsReview } from "@/server/project/task-review"
import { thankForTask } from "@/server/project/task-thanks"
import { listTeamTypes } from "@/server/project/task-types"
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

export type { NoteVersion } from "@/server/project/task-note-versions"
export type { BinEntry, ProjectBin, RepeatInput, RepeatRule, TaskChoice } from "@/server/project/planning"
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
  .inputValidator(newTaskSchema)
  .handler(async ({ data, context }) => createTask(context.user, data))

const updateTaskFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateTaskSchema)
  .handler(async ({ data, context }) => updateTask(context.user, data))

const setStatusFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(setTaskStatusSchema)
  .handler(async ({ data, context }) => setTaskStatus(context.user, data))

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

/** The projects New task can make a task in, and the team's types, for the header's button. */
const loadNewTaskProjectsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object(teamScope))
  .handler(async ({ data, context }) => {
    const me = { id: context.user.id, name: context.user.name, avatarUrl: context.user.avatarUrl ?? "" }
    // The site admin is on no team. On a team's page it offers that team's
    // projects; the header's button is on every page, so it offers every team's.
    const teamIds = (await isSiteAdmin(context.user.id))
      ? data.teamId
        ? [data.teamId]
        : (await listTeamNames()).map((team) => team.id)
      : [undefined]
    const memberships = await Promise.all(
      teamIds.map((teamId) => findMembership(context.user.id, undefined, teamId))
    )
    const parts = await Promise.all(
      memberships
        .filter((membership) => membership !== null)
        .map(async (membership) => ({
          projects: await listNewTaskProjects(membership, me),
          types: await listTeamTypes(membership.teamId),
        }))
    )
    return {
      projects: parts.flatMap((part) => part.projects).sort((a, b) => a.name.localeCompare(b.name)),
      types: parts.flatMap((part) => part.types),
    }
  })

const deleteStepFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ stepId: id }))
  .handler(async ({ data, context }) => deleteStep(context.user, data.stepId))

const listNoteVersionsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ taskId: id }))
  .handler(async ({ data, context }) => listNoteVersions(context.user.id, data.taskId))

const restoreNoteVersionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ versionId: id }))
  .handler(async ({ data, context }) => restoreNoteVersion(context.user, data.versionId))

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
export function createProjectTask(data: z.input<typeof newTaskSchema>) {
  return createTaskFn({ data })
}
export function saveTask(data: z.input<typeof updateTaskSchema>) {
  return updateTaskFn({ data })
}
export function setStatus(data: z.input<typeof setTaskStatusSchema>) {
  return setStatusFn({ data })
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
export function loadNewTaskProjects(teamId?: string) {
  return loadNewTaskProjectsFn({ data: { teamId } })
}
export function deleteTaskStep(stepId: string) {
  return deleteStepFn({ data: { stepId } })
}
export function loadNoteVersions(taskId: string) {
  return listNoteVersionsFn({ data: { taskId } })
}
export function bringBackNoteVersion(versionId: string) {
  return restoreNoteVersionFn({ data: { versionId } })
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

const askForTimeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(askForTimeSchema)
  .handler(async ({ data, context }) => askForMoreTime(context.user, data))

const answerTimeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(answerTimeSchema)
  .handler(async ({ data, context }) => answerMoreTime(context.user, data))

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
/** Ask for a later due date, with why (Seven features, part 2). */
export function askForMoreTaskTime(data: z.input<typeof askForTimeSchema>) {
  return askForTimeFn({ data })
}
/** Yes moves the due date to the day asked for; No keeps it. */
export function answerMoreTaskTime(data: z.input<typeof answerTimeSchema>) {
  return answerTimeFn({ data })
}
export function thankForProjectTask(taskId: string) {
  return thankFn({ data: { taskId } })
}
