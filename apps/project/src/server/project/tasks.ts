import { and, asc, count, eq, inArray, max, type SQL } from "drizzle-orm"
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
  type ProjectDb,
  type TaskRow,
} from "@/server/project/access"
import { writeTaskNotices, type TaskNotice } from "@/server/project/notices"
import {
  projectProjectMembers,
  projectProjects,
  projectTaskComments,
  projectTaskSteps,
  projectTasks,
  projectTeamMembers,
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

type Person = { id: string; name: string; avatarUrl: string }

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
        .where(inArray(projectTaskComments.taskId, ids))
        .groupBy(projectTaskComments.taskId)
    : []

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
    }
  })
}

function isWaiting(task: Pick<TaskRow, "assigneeUserId" | "acceptedAt">) {
  return Boolean(task.assigneeUserId) && !task.acceptedAt
}

export type TaskStep = { id: string; text: string; done: boolean }
export type TaskComment = {
  id: string
  body: string
  createdAt: string
  author: Person | null
}

export type TaskDetail = {
  task: TaskCard & { notes: string }
  steps: TaskStep[]
  comments: TaskComment[]
  /** Who the task can be handed to: the project's members. */
  assignable: Person[]
  archived: boolean
  canDelete: boolean
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
  const commentRows = await database
    .select({
      id: projectTaskComments.id,
      body: projectTaskComments.body,
      createdAt: projectTaskComments.createdAt,
      authorId: customShellUsers.id,
      authorName: customShellUsers.name,
      authorAvatar: customShellUsers.avatarUrl,
    })
    .from(projectTaskComments)
    .leftJoin(customShellUsers, eq(customShellUsers.id, projectTaskComments.authorUserId))
    .where(eq(projectTaskComments.taskId, taskId))
    .orderBy(asc(projectTaskComments.createdAt))
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
    comments: commentRows.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      author:
        row.authorId && row.authorName !== null
          ? { id: row.authorId, name: row.authorName, avatarUrl: row.authorAvatar ?? "" }
          : null,
    })),
    assignable: assignable.map((row) => ({ ...row, avatarUrl: row.avatarUrl ?? "" })),
    archived: Boolean(project.archivedAt),
    canDelete: task.createdByUserId === userId || runsTheTeam(membership.role),
  }
}

/** My work: every task assigned to me, across every project I can see. */
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

/**
 * Of these people, the ones who can still see the project: its members, and
 * the team's owner and admins. Someone who has left keeps their name on old
 * tasks but must never be sent a notice that shows a task's title.
 */
async function whoCanStillSee(
  project: { id: string; teamId: string },
  userIds: readonly (string | null)[],
  database: ProjectDb
): Promise<string[]> {
  const wanted = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
  if (wanted.length === 0) return []
  const members = await database
    .select({ userId: projectProjectMembers.userId })
    .from(projectProjectMembers)
    .where(
      and(
        eq(projectProjectMembers.projectId, project.id),
        inArray(projectProjectMembers.userId, wanted)
      )
    )
  const runners = await database
    .select({ userId: projectTeamMembers.userId })
    .from(projectTeamMembers)
    .where(
      and(
        eq(projectTeamMembers.teamId, project.teamId),
        inArray(projectTeamMembers.userId, wanted),
        inArray(projectTeamMembers.role, ["owner", "admin"])
      )
    )
  const allowed = new Set([...members, ...runners].map((row) => row.userId))
  return wanted.filter((id) => allowed.has(id))
}

function taskRef(task: Pick<TaskRow, "id" | "projectId" | "title">) {
  return { id: task.id, projectId: task.projectId, title: task.title }
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

    const handedOutBy = task.assignedByUserId ?? task.createdByUserId
    if (input.status === "stuck") {
      const [recipient] = await whoCanStillSee(project, [handedOutBy], tx)
      if (recipient) {
        await writeTaskNotices(tx, [
          {
            kind: "task_stuck",
            recipientUserId: recipient,
            actor,
            task: taskRef(task),
            extra: input.stuckReason,
          },
        ])
      }
    }
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
  const { task } = await requireTaskAccess(actor.id, taskId, database)
  if (task.assigneeUserId !== actor.id) throw new Error(PROJECT_ERRORS.notAssignee)
  if (task.acceptedAt) return
  await database
    .update(projectTasks)
    .set({ acceptedAt: now(), updatedAt: now() })
    .where(eq(projectTasks.id, task.id))
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

export async function deleteTask(actor: Actor, taskId: string, database = db) {
  const { membership, task } = await requireTaskAccess(actor.id, taskId, database)
  if (task.createdByUserId !== actor.id && !runsTheTeam(membership.role)) {
    throw new Error(PROJECT_ERRORS.cantDeleteTask)
  }
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

/** Tells the people on the task: who it's assigned to, who handed it out, who made it. */
export async function addComment(
  actor: Actor,
  input: { taskId: string; body: string },
  database = db
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    const { project, task } = await requireTaskAccess(actor.id, input.taskId, tx)
    const id = uuid()
    await tx.insert(projectTaskComments).values({
      id,
      taskId: task.id,
      authorUserId: actor.id,
      body: input.body,
      createdAt: now(),
    })
    const recipients = await whoCanStillSee(
      project,
      [task.assigneeUserId, task.assignedByUserId, task.createdByUserId],
      tx
    )
    const line = input.body.length > 80 ? `${input.body.slice(0, 79)}…` : input.body
    await writeTaskNotices(
      tx,
      recipients.map(
          (recipientUserId): TaskNotice => ({
            kind: "task_comment",
            recipientUserId,
            actor,
            task: taskRef(task),
            extra: line,
          })
        )
    )
    return { id }
  })
}
