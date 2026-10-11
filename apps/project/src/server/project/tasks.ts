import { and, asc, count, countDistinct, eq, inArray, isNull, max, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { LIMITS, runsTheTeam, type TaskStatus } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  findMembership,
  isProjectMember,
  requireOpenProject,
  requireTaskAccess,
  whoCanStillSee,
  type ProjectDb,
  type TaskRow,
} from "@/server/project/access"
import { taskRef, writeTaskNotices, type TaskNotice } from "@/server/project/notices"
import { loadTaskComments, type TaskComment } from "@/server/project/task-chat"
import {
  listTaskFiles,
  removeTaskFilesFromStorage,
  type FileStorage,
  type TaskFile,
} from "@/server/project/task-files"
import { followerIds } from "@/server/project/task-followers"
import {
  loadTaskHistory,
  recordTaskEvent,
  type TaskHistoryEntry,
} from "@/server/project/task-history"
import {
  projectCheckinItems,
  projectCheckins,
  projectProjectMembers,
  projectProjects,
  projectTaskComments,
  projectTaskFollowers,
  projectTaskSteps,
  projectTasks,
} from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

/**
 * Tasks. The rules Tyler set, in `workspace/docs/what-this-app-is.md`:
 *
 * - Anyone can hand a task to anyone on the project, and the task records who
 *   handed it out.
 * - A task handed to someone else is Waiting until they accept it. They can
 *   accept it or hand it back with a reason.
 * - Stuck needs a one-line reason, and tells the person who handed it out.
 */

export type Actor = { id: string; name: string }

export type Person = { id: string; name: string; avatarUrl: string }

export type TaskCard = {
  id: string
  projectId: string
  projectName: string
  title: string
  status: TaskStatus
  stuckReason: string | null
  dueDate: string | null
  assignee: Person | null
  assignedBy: { id: string; name: string } | null
  /** Handed to someone who hasn't accepted it yet. */
  waiting: boolean
  formerAssigneeName: string | null
  handedBack: { byName: string; reason: string } | null
  steps: { done: number; total: number }
  commentCount: number
  /** How many days anyone picked this task on a check-in. */
  pickedDays: number
}

const assignee = alias(customShellUsers, "assignee")
const assigner = alias(customShellUsers, "assigner")
const returner = alias(customShellUsers, "returner")

export async function listTaskCards(
  where: SQL | undefined,
  database: ProjectDb = db
): Promise<TaskCard[]> {
  const rows = await database
    .select({
      task: projectTasks,
      projectName: projectProjects.name,
      assigneeName: assignee.name,
      assigneeAvatar: assignee.avatarUrl,
      assignerName: assigner.name,
      returnerName: returner.name,
    })
    .from(projectTasks)
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .leftJoin(assignee, eq(assignee.id, projectTasks.assigneeUserId))
    .leftJoin(assigner, eq(assigner.id, projectTasks.assignedByUserId))
    .leftJoin(returner, eq(returner.id, projectTasks.handedBackByUserId))
    .where(where)
    .orderBy(asc(projectTasks.dueDate), asc(projectTasks.createdAt))

  const ids = rows.map((row) => row.task.id)
  const stepRows = ids.length
    ? await database
        .select({
          taskId: projectTaskSteps.taskId,
          done: projectTaskSteps.done,
          total: count(),
        })
        .from(projectTaskSteps)
        .where(inArray(projectTaskSteps.taskId, ids))
        .groupBy(projectTaskSteps.taskId, projectTaskSteps.done)
    : []
  const commentRows = ids.length
    ? await database
        .select({ taskId: projectTaskComments.taskId, total: count() })
        .from(projectTaskComments)
        .where(and(inArray(projectTaskComments.taskId, ids), isNull(projectTaskComments.deletedAt)))
        .groupBy(projectTaskComments.taskId)
    : []
  const pickedRows = ids.length ? await pickedDaysFor(ids, database) : []

  return rows.map(({ task, ...row }) => {
    const steps = stepRows.filter((step) => step.taskId === task.id)
    return {
      id: task.id,
      projectId: task.projectId,
      projectName: row.projectName,
      title: task.title,
      status: task.status,
      stuckReason: task.stuckReason,
      dueDate: task.dueDate,
      assignee:
        task.assigneeUserId && row.assigneeName !== null
          ? {
              id: task.assigneeUserId,
              name: row.assigneeName,
              avatarUrl: row.assigneeAvatar ?? "",
            }
          : null,
      assignedBy:
        task.assignedByUserId && row.assignerName !== null
          ? { id: task.assignedByUserId, name: row.assignerName }
          : null,
      waiting: isWaiting(task),
      formerAssigneeName: task.formerAssigneeName,
      handedBack:
        task.handedBackReason && row.returnerName !== null
          ? { byName: row.returnerName, reason: task.handedBackReason }
          : null,
      steps: {
        done: steps.find((step) => step.done)?.total ?? 0,
        total: steps.reduce((sum, step) => sum + step.total, 0),
      },
      commentCount: commentRows.find((c) => c.taskId === task.id)?.total ?? 0,
      pickedDays: pickedRows.find((p) => p.taskId === task.id)?.days ?? 0,
    }
  })
}

/** Distinct days each task was picked, by anyone, read from the saved check-ins. */
function pickedDaysFor(taskIds: string[], database: ProjectDb) {
  return database
    .select({ taskId: projectCheckinItems.taskId, days: countDistinct(projectCheckins.day) })
    .from(projectCheckinItems)
    .innerJoin(projectCheckins, eq(projectCheckins.id, projectCheckinItems.checkinId))
    .where(and(inArray(projectCheckinItems.taskId, taskIds), eq(projectCheckinItems.kind, "pick")))
    .groupBy(projectCheckinItems.taskId)
}

function isWaiting(task: Pick<TaskRow, "assigneeUserId" | "acceptedAt">) {
  return Boolean(task.assigneeUserId) && !task.acceptedAt
}

export type TaskStep = { id: string; text: string; done: boolean }

export type TaskDetail = {
  task: TaskCard & { notes: string }
  steps: TaskStep[]
  comments: TaskComment[]
  files: TaskFile[]
  /** Who the task can be handed to, and who the chat can tag: the project's members. */
  assignable: Person[]
  /** I get this task's chat, Stuck and Done notices without being assigned. */
  following: boolean
  archived: boolean
  canDelete: boolean
  /** Every day it was picked or dropped, and every hand-over, oldest first. */
  history: TaskHistoryEntry[]
}

export async function loadTaskDetail(
  userId: string,
  taskId: string,
  database = db
): Promise<TaskDetail> {
  const { membership, project, task } = await requireTaskAccess(
    userId,
    taskId,
    database,
    { allowArchived: true }
  )
  const [card] = await listTaskCards(eq(projectTasks.id, taskId), database)
  const steps = await database
    .select({
      id: projectTaskSteps.id,
      text: projectTaskSteps.text,
      done: projectTaskSteps.done,
    })
    .from(projectTaskSteps)
    .where(eq(projectTaskSteps.taskId, taskId))
    .orderBy(asc(projectTaskSteps.position))
  const archived = Boolean(project.archivedAt)
  const viewer = { userId, role: membership.role }
  const [follow] = await database
    .select({ userId: projectTaskFollowers.userId })
    .from(projectTaskFollowers)
    .where(and(eq(projectTaskFollowers.taskId, taskId), eq(projectTaskFollowers.userId, userId)))
    .limit(1)
  const assignable = await database
    .select({
      id: customShellUsers.id,
      name: customShellUsers.name,
      avatarUrl: customShellUsers.avatarUrl,
    })
    .from(projectProjectMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectProjectMembers.userId))
    .where(eq(projectProjectMembers.projectId, project.id))
    .orderBy(asc(customShellUsers.name))

  return {
    task: { ...card, notes: task.notes },
    steps,
    comments: await loadTaskComments(viewer, taskId, archived, database),
    files: await listTaskFiles(viewer, taskId, archived, database),
    assignable: assignable.map((row) => ({ ...row, avatarUrl: row.avatarUrl ?? "" })),
    following: Boolean(follow),
    archived,
    canDelete: task.createdByUserId === userId || runsTheTeam(membership.role),
    history: await loadTaskHistory(taskId, database),
  }
}

/** My tasks on My dashboard: every task assigned to me, across every project I can see. */
export async function loadMyWork(userId: string, database = db): Promise<TaskCard[]> {
  const membership = await findMembership(userId, database)
  if (!membership) return []
  const cards = await listTaskCards(
    and(
      eq(projectTasks.assigneeUserId, userId),
      eq(projectProjects.teamId, membership.teamId)
    ),
    database
  )
  // Waiting first, because those need an answer before anything else.
  return [...cards.filter((card) => card.waiting), ...cards.filter((card) => !card.waiting)]
}

async function requireAssignable(projectId: string, userId: string, database: ProjectDb) {
  if (!(await isProjectMember(projectId, userId, database))) {
    throw new Error(PROJECT_ERRORS.notProjectMember)
  }
}

export async function createTask(
  actor: Actor,
  input: {
    projectId: string
    title: string
    notes: string
    assigneeUserId: string | null
    dueDate: string | null
    steps: string[]
  },
  database = db
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    await requireOpenProject(actor.id, input.projectId, tx)
    if (input.assigneeUserId) await requireAssignable(input.projectId, input.assigneeUserId, tx)
    const at = now()
    const handedToSomeoneElse =
      input.assigneeUserId !== null && input.assigneeUserId !== actor.id
    const task = {
      id: uuid(),
      projectId: input.projectId,
      title: input.title,
      notes: input.notes,
      status: "todo" as const,
      assigneeUserId: input.assigneeUserId,
      assignedByUserId: input.assigneeUserId ? actor.id : null,
      // Taking a task yourself skips Waiting.
      acceptedAt: input.assigneeUserId && !handedToSomeoneElse ? at : null,
      dueDate: input.dueDate,
      createdByUserId: actor.id,
      createdAt: at,
      updatedAt: at,
    }
    await tx.insert(projectTasks).values(task)
    if (input.steps.length) {
      await tx.insert(projectTaskSteps).values(
        input.steps.map((text, position) => ({
          id: uuid(),
          taskId: task.id,
          text,
          done: false,
          position,
          createdAt: at,
        }))
      )
    }
    if (handedToSomeoneElse && input.assigneeUserId) {
      await recordTaskEvent(tx, {
        taskId: task.id,
        kind: "handed_over",
        actorUserId: actor.id,
        targetUserId: input.assigneeUserId,
      })
      await writeTaskNotices(tx, [
        {
          kind: "task_assigned",
          recipientUserId: input.assigneeUserId,
          actor,
          task: taskRef(task),
        },
      ])
    }
    return { id: task.id }
  })
}

export async function updateTask(
  actor: Actor,
  patch: { taskId: string; title?: string; notes?: string; dueDate?: string | null },
  database = db
) {
  const { taskId, ...fields } = patch
  await requireTaskAccess(actor.id, taskId, database)
  await database
    .update(projectTasks)
    .set({ ...fields, updatedAt: now() })
    .where(eq(projectTasks.id, taskId))
}

export async function setTaskStatus(
  actor: Actor,
  input: { taskId: string; status: TaskStatus; stuckReason: string | null },
  database = db
) {
  await database.transaction(async (tx) => {
    const { project, task } = await requireTaskAccess(actor.id, input.taskId, tx)
    if (input.status === "stuck" && !input.stuckReason) {
      throw new Error(PROJECT_ERRORS.stuckNeedsReason)
    }
    await tx
      .update(projectTasks)
      .set({
        status: input.status,
        // The reason shows on the task until it leaves Stuck.
        stuckReason: input.status === "stuck" ? input.stuckReason : null,
        updatedAt: now(),
      })
      .where(eq(projectTasks.id, task.id))

    // Stuck tells whoever handed it out and the followers; Done tells the
    // followers, once, when it becomes Done.
    const becameDone = input.status === "done" && task.status !== "done"
    if (input.status !== "stuck" && !becameDone) return
    const handedOutBy = task.assignedByUserId ?? task.createdByUserId
    const followers = await followerIds(task.id, tx)
    const recipients = await whoCanStillSee(
      project,
      input.status === "stuck" ? [handedOutBy, ...followers] : followers,
      tx
    )
    await writeTaskNotices(
      tx,
      recipients.map(
        (recipientUserId): TaskNotice => ({
          kind: input.status === "stuck" ? "task_stuck" : "task_done",
          recipientUserId,
          actor,
          task: taskRef(task),
          extra: input.status === "stuck" ? input.stuckReason : null,
        })
      )
    )
  })
}

export async function assignTask(
  actor: Actor,
  input: { taskId: string; assigneeUserId: string | null },
  database = db
) {
  await database.transaction(async (tx) => {
    const { task } = await requireTaskAccess(actor.id, input.taskId, tx)
    if (input.assigneeUserId === task.assigneeUserId) return
    if (input.assigneeUserId) await requireAssignable(task.projectId, input.assigneeUserId, tx)
    const at = now()
    await tx
      .update(projectTasks)
      .set({
        assigneeUserId: input.assigneeUserId,
        assignedByUserId: input.assigneeUserId ? actor.id : null,
        acceptedAt: input.assigneeUserId === actor.id ? at : null,
        handedBackReason: null,
        handedBackByUserId: null,
        formerAssigneeName: null,
        updatedAt: at,
      })
      .where(eq(projectTasks.id, task.id))
    if (input.assigneeUserId && input.assigneeUserId !== actor.id) {
      await recordTaskEvent(tx, {
        taskId: task.id,
        kind: "handed_over",
        actorUserId: actor.id,
        targetUserId: input.assigneeUserId,
      })
      await writeTaskNotices(tx, [
        {
          kind: "task_assigned",
          recipientUserId: input.assigneeUserId,
          actor,
          task: taskRef(task),
        },
      ])
    }
  })
}

export async function acceptTask(actor: Actor, taskId: string, database = db) {
  await database.transaction(async (tx) => {
    const { task } = await requireTaskAccess(actor.id, taskId, tx)
    if (task.assigneeUserId !== actor.id) throw new Error(PROJECT_ERRORS.notAssignee)
    if (task.acceptedAt) return
    await tx
      .update(projectTasks)
      .set({ acceptedAt: now(), updatedAt: now() })
      .where(eq(projectTasks.id, task.id))
    await recordTaskEvent(tx, { taskId: task.id, kind: "accepted", actorUserId: actor.id })
  })
}

/**
 * Hands the task back to whoever handed it out, with the reason. If that
 * person has since left the project, the task is left with nobody assigned.
 */
export async function handBackTask(
  actor: Actor,
  input: { taskId: string; reason: string },
  database = db
) {
  await database.transaction(async (tx) => {
    const { task } = await requireTaskAccess(actor.id, input.taskId, tx)
    if (task.assigneeUserId !== actor.id) throw new Error(PROJECT_ERRORS.notAssignee)
    const giver = task.assignedByUserId
    if (!giver || giver === actor.id) throw new Error(PROJECT_ERRORS.nothingToHandBack)
    const giverStillHere = await isProjectMember(task.projectId, giver, tx)
    const at = now()
    await tx
      .update(projectTasks)
      .set({
        assigneeUserId: giverStillHere ? giver : null,
        assignedByUserId: giverStillHere ? actor.id : null,
        // It's back with the person who handed it out, so it isn't Waiting.
        acceptedAt: giverStillHere ? at : null,
        handedBackReason: input.reason,
        handedBackByUserId: actor.id,
        updatedAt: at,
      })
      .where(eq(projectTasks.id, task.id))
    await recordTaskEvent(tx, {
      taskId: task.id,
      kind: "handed_back",
      actorUserId: actor.id,
      targetUserId: giverStillHere ? giver : null,
      reason: input.reason,
    })
    if (giverStillHere) {
      await writeTaskNotices(tx, [
        {
          kind: "task_handed_back",
          recipientUserId: giver,
          actor,
          task: taskRef(task),
          extra: input.reason,
        },
      ])
    }
  })
}

export async function deleteTask(
  actor: Actor,
  taskId: string,
  database = db,
  storage?: FileStorage
) {
  const { membership, task } = await requireTaskAccess(actor.id, taskId, database)
  if (task.createdByUserId !== actor.id && !runsTheTeam(membership.role)) {
    throw new Error(PROJECT_ERRORS.cantDeleteTask)
  }
  await removeTaskFilesFromStorage(task.id, database, storage)
  await database.delete(projectTasks).where(eq(projectTasks.id, task.id))
}

export async function addStep(
  actor: Actor,
  input: { taskId: string; text: string },
  database = db
): Promise<TaskStep> {
  return database.transaction(async (tx) => {
    const { task } = await requireTaskAccess(actor.id, input.taskId, tx)
    const [{ total, last }] = await tx
      .select({ total: count(), last: max(projectTaskSteps.position) })
      .from(projectTaskSteps)
      .where(eq(projectTaskSteps.taskId, task.id))
    if (total >= LIMITS.stepsPerTask) throw new Error(PROJECT_ERRORS.tooManySteps)
    const step = {
      id: uuid(),
      taskId: task.id,
      text: input.text,
      done: false,
      position: (last ?? -1) + 1,
      createdAt: now(),
    }
    await tx.insert(projectTaskSteps).values(step)
    await touchTask(task.id, tx)
    return { id: step.id, text: step.text, done: step.done }
  })
}

export async function updateStep(
  actor: Actor,
  input: { stepId: string; text?: string; done?: boolean },
  database = db
) {
  const { stepId, ...fields } = input
  const step = await requireStep(actor.id, stepId, database)
  await database.update(projectTaskSteps).set(fields).where(eq(projectTaskSteps.id, step.id))
  await touchTask(step.taskId, database)
}

export async function deleteStep(actor: Actor, stepId: string, database = db) {
  const step = await requireStep(actor.id, stepId, database)
  await database.delete(projectTaskSteps).where(eq(projectTaskSteps.id, step.id))
  await touchTask(step.taskId, database)
}

async function requireStep(userId: string, stepId: string, database: ProjectDb) {
  const [step] = await database
    .select({ id: projectTaskSteps.id, taskId: projectTaskSteps.taskId })
    .from(projectTaskSteps)
    .where(eq(projectTaskSteps.id, stepId))
    .limit(1)
  if (!step) throw new Error(PROJECT_ERRORS.stepNotFound)
  await requireTaskAccess(userId, step.taskId, database)
  return step
}

async function touchTask(taskId: string, database: ProjectDb) {
  await database
    .update(projectTasks)
    .set({ updatedAt: now() })
    .where(eq(projectTasks.id, taskId))
}
