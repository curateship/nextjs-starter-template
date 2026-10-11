import { and, asc, count, countDistinct, eq, inArray, isNull, max, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { TaskNoticeKind } from "@/lib/project/notices"
import { taskNotesText } from "@/lib/project/notes"
import { LIMITS, runsTheTeam, type TaskStatus } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  findMembership,
  isProjectMember,
  requireOpenProject,
  requireTaskAccess,
  visibleProjectIds,
  whoCanStillSee,
  type ProjectDb,
  type TaskRow,
} from "@/server/project/access"
import { taskRef, writeTaskNotices, type TaskNotice } from "@/server/project/notices"
import { labelsForTasks, listTeamLabels, type Label } from "@/server/project/labels"
import {
  listSections,
  nextTaskPosition,
  requireSectionOf,
  type Section,
} from "@/server/project/sections"
import { loadTaskComments, type TaskComment } from "@/server/project/task-chat"
import { listTaskFiles, type TaskFile } from "@/server/project/task-files"
import { resolveProjectId } from "@/server/project/personal"
import { repeatRuleOf, tellWaitingTasks, waitingOnThis, type RepeatRule } from "@/server/project/planning"
import { listMoveTargets, type MoveTarget } from "@/server/project/task-changes"
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
  projectSections,
  projectTaskComments,
  projectTaskFollowers,
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

export type Person = {
  id: string
  name: string
  avatarUrl: string
  /** A job title, where one is shown beside the name (the hand-to picker). */
  title?: string | null
}

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
  labels: Label[]
  section: { id: string; name: string } | null
  /** The task's place in its project's own order. */
  position: number
  /** When it last became Done. */
  completedAt: string | null
  /** The notes' words, so a search can find them. */
  notesText: string
  /** Out of the check-in and My tasks until this day. */
  snoozedUntil: string | null
  /**
   * The task that has to happen first. Its title shows only when it is in the
   * same project; one elsewhere reads "1 task in another project".
   */
  waitingOn: { taskId: string; title: string | null; ready: boolean } | null
  repeat: RepeatRule | null
}

const assignee = alias(customShellUsers, "assignee")
const blocker = alias(projectTasks, "blocker")
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
      sectionName: projectSections.name,
      blockerTitle: blocker.title,
      blockerProjectId: blocker.projectId,
      blockerStatus: blocker.status,
      blockerDeletedAt: blocker.deletedAt,
    })
    .from(projectTasks)
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .leftJoin(assignee, eq(assignee.id, projectTasks.assigneeUserId))
    .leftJoin(assigner, eq(assigner.id, projectTasks.assignedByUserId))
    .leftJoin(returner, eq(returner.id, projectTasks.handedBackByUserId))
    .leftJoin(projectSections, eq(projectSections.id, projectTasks.sectionId))
    .leftJoin(blocker, eq(blocker.id, projectTasks.waitingOnTaskId))
    // A task in the bin is gone from every list until it is brought back.
    .where(and(isNull(projectTasks.deletedAt), where))
    // Each project's own order, which the team sets by dragging.
    .orderBy(asc(projectTasks.position), asc(projectTasks.createdAt))

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
  const labels = await labelsForTasks(ids, database)

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
      labels: labels.get(task.id) ?? [],
      section:
        task.sectionId && row.sectionName !== null
          ? { id: task.sectionId, name: row.sectionName }
          : null,
      position: task.position,
      completedAt: task.completedAt?.toISOString() ?? null,
      notesText: taskNotesText(task.notes),
      snoozedUntil: task.snoozedUntil,
      // A task waiting on one in the bin isn't held up by anything.
      waitingOn:
        task.waitingOnTaskId && row.blockerStatus && !row.blockerDeletedAt
          ? {
              taskId: task.waitingOnTaskId,
              title: row.blockerProjectId === task.projectId ? row.blockerTitle : null,
              ready: row.blockerStatus === "done",
            }
          : null,
      repeat: repeatRuleOf(task),
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

export type TaskStep = {
  id: string
  text: string
  done: boolean
  /** Someone on the project doing this step. It shows only inside the task. */
  assignee: Person | null
  dueDate: string | null
}

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
  /** The project's sections, for the task's Section field. */
  sections: Section[]
  /** The team's labels, for the task's Labels field. */
  labels: Label[]
  /** Other open projects this person can move the task to. */
  moveTargets: MoveTarget[]
  /** The task this one waits on, named when this person can see it. */
  waitingOnTitle: string | null
  /** Tasks waiting on this one: those this person can see, and how many elsewhere. */
  holdingUp: { tasks: { id: string; title: string; projectId: string }[]; elsewhere: number }
}

export async function loadTaskDetail(
  userId: string,
  taskId: string,
  database = db
): Promise<TaskDetail> {
  const { membership, project, task } = await requireTaskAccess(userId, taskId, database, {
    allowArchived: true,
  }).catch(async (error: unknown) => {
    // Someone who can see the project is told a binned task is in its bin,
    // so a bell link to it explains itself. Anyone else still learns nothing.
    if (error instanceof Error && error.message === PROJECT_ERRORS.taskNotFound) {
      const binned = await requireTaskAccess(userId, taskId, database, {
        allowArchived: true,
        allowDeleted: true,
      }).catch(() => null)
      if (binned?.task.deletedAt) throw new Error(PROJECT_ERRORS.taskInBin)
    }
    throw error
  })
  const [card] = await listTaskCards(eq(projectTasks.id, taskId), database)
  const stepRows = await database
    .select({
      id: projectTaskSteps.id,
      text: projectTaskSteps.text,
      done: projectTaskSteps.done,
      dueDate: projectTaskSteps.dueDate,
      assigneeId: projectTaskSteps.assigneeUserId,
      assigneeName: assignee.name,
      assigneeAvatar: assignee.avatarUrl,
    })
    .from(projectTaskSteps)
    .leftJoin(assignee, eq(assignee.id, projectTaskSteps.assigneeUserId))
    .where(eq(projectTaskSteps.taskId, taskId))
    .orderBy(asc(projectTaskSteps.position))
  const steps: TaskStep[] = stepRows.map((row) => ({
    id: row.id,
    text: row.text,
    done: row.done,
    dueDate: row.dueDate,
    assignee:
      row.assigneeId && row.assigneeName !== null
        ? { id: row.assigneeId, name: row.assigneeName, avatarUrl: row.assigneeAvatar ?? "" }
        : null,
  }))
  const archived = Boolean(project.archivedAt)
  const viewer = { userId, role: membership.role }
  const visible = await visibleProjectIds(membership, database)
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
      title: projectTeamMembers.title,
    })
    .from(projectProjectMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectProjectMembers.userId))
    .leftJoin(
      projectTeamMembers,
      and(
        eq(projectTeamMembers.userId, projectProjectMembers.userId),
        eq(projectTeamMembers.teamId, project.teamId)
      )
    )
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
    history: await loadTaskHistory(taskId, database, visible),
    sections: await listSections(project.id, database),
    labels: await listTeamLabels(membership.teamId, database),
    moveTargets: await listMoveTargets(membership, task, database),
    waitingOnTitle: await waitingOnTitleFor(task.waitingOnTaskId, visible, database),
    holdingUp: await waitingOnThis(taskId, visible, database),
  }
}

async function waitingOnTitleFor(
  blockerId: string | null,
  visible: ReadonlySet<string>,
  database: ProjectDb
) {
  if (!blockerId) return null
  const [row] = await database
    .select({ title: projectTasks.title, projectId: projectTasks.projectId })
    .from(projectTasks)
    .where(eq(projectTasks.id, blockerId))
  return row && visible.has(row.projectId) ? row.title : null
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

export async function requireAssignable(projectId: string, userId: string, database: ProjectDb) {
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
  database: ProjectDb = db
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    const projectId = await resolveProjectId(actor.id, input.projectId, tx)
    input = { ...input, projectId }
    await requireOpenProject(actor.id, input.projectId, tx)
    if (input.assigneeUserId) await requireAssignable(input.projectId, input.assigneeUserId, tx)
    const at = now()
    const handedToSomeoneElse =
      input.assigneeUserId !== null && input.assigneeUserId !== actor.id
    const position = await nextTaskPosition(input.projectId, tx)
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
      position,
    }
    await tx.insert(projectTasks).values(task)
    await recordTaskEvent(tx, { taskId: task.id, kind: "created", actorUserId: actor.id })
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
  patch: {
    taskId: string
    title?: string
    notes?: string
    dueDate?: string | null
    sectionId?: string | null
    snoozedUntil?: string | null
  },
  database = db
) {
  const { taskId, ...fields } = patch
  const { task } = await requireTaskAccess(actor.id, taskId, database)
  if (fields.sectionId) await requireSectionOf(task.projectId, fields.sectionId, database)
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
        // When it became Done, kept while it stays Done and cleared when it leaves.
        completedAt: input.status === "done" ? (task.status === "done" ? task.completedAt : now()) : null,
        updatedAt: now(),
      })
      .where(eq(projectTasks.id, task.id))
    if (input.status !== task.status) {
      await recordTaskEvent(tx, {
        taskId: task.id,
        kind: "status_changed",
        actorUserId: actor.id,
        reason: input.status,
      })
    }

    // Stuck, Done and leaving Stuck each tell whoever handed the task out (or
    // made it, when nobody did) and its followers, once per change.
    const kind = statusNoticeKind(task.status, input.status)
    if (kind === "task_done") await tellWaitingTasks(actor, task.id, tx)
    if (!kind) return
    const handedOutBy = task.assignedByUserId ?? task.createdByUserId
    const recipients = await whoCanStillSee(
      project,
      [handedOutBy, ...(await followerIds(task.id, tx))],
      tx
    )
    await writeTaskNotices(
      tx,
      recipients.map(
        (recipientUserId): TaskNotice => ({
          kind,
          recipientUserId,
          actor,
          task: taskRef(task),
          extra: kind === "task_stuck" ? input.stuckReason : null,
        })
      )
    )
  })
}

/** Which notice a status change sends: Stuck, Done, or unblocked when it leaves Stuck. */
function statusNoticeKind(from: TaskStatus, to: TaskStatus): TaskNoticeKind | null {
  if (to === "stuck") return "task_stuck"
  if (to === "done") return from === "done" ? null : "task_done"
  if (from === "stuck") return "task_unblocked"
  return null
}

export async function assignTask(
  actor: Actor,
  input: { taskId: string; assigneeUserId: string | null },
  database: ProjectDb = db,
  /** Off when the caller sends one notice for many hand-overs. */
  { notify = true }: { notify?: boolean } = {}
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
      if (notify) {
        await writeTaskNotices(tx, [
          {
            kind: "task_assigned",
            recipientUserId: input.assigneeUserId,
            actor,
            task: taskRef(task),
          },
        ])
      }
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

/**
 * Puts the task in its project's bin. It leaves every list at once and can
 * be brought back whole for 30 days, after which the daily job deletes it
 * and its files for good (`planning-jobs.ts`).
 */
export async function deleteTask(actor: Actor, taskId: string, database = db) {
  await database.transaction(async (tx) => {
    const { membership, task } = await requireTaskAccess(actor.id, taskId, tx)
    if (task.createdByUserId !== actor.id && !runsTheTeam(membership.role)) {
      throw new Error(PROJECT_ERRORS.cantDeleteTask)
    }
    await tx
      .update(projectTasks)
      .set({ deletedAt: now(), deletedByUserId: actor.id })
      .where(eq(projectTasks.id, task.id))
    await recordTaskEvent(tx, { taskId: task.id, kind: "deleted", actorUserId: actor.id })
  })
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
    return { id: step.id, text: step.text, done: step.done, assignee: null, dueDate: null }
  })
}

export async function updateStep(
  actor: Actor,
  input: {
    stepId: string
    text?: string
    done?: boolean
    assigneeUserId?: string | null
    dueDate?: string | null
  },
  database = db
) {
  await database.transaction(async (tx) => {
    const { stepId, ...fields } = input
    const step = await requireStep(actor.id, stepId, tx)
    const { task } = await requireTaskAccess(actor.id, step.taskId, tx)
    if (fields.assigneeUserId) await requireAssignable(task.projectId, fields.assigneeUserId, tx)
    await tx.update(projectTaskSteps).set(fields).where(eq(projectTaskSteps.id, step.id))
    await touchTask(step.taskId, tx)
    // A step given to someone else tells them, once, when it is given.
    const given = fields.assigneeUserId
    if (given && given !== step.assigneeUserId) {
      await writeTaskNotices(tx, [
        {
          kind: "task_step",
          recipientUserId: given,
          actor,
          task: taskRef(task),
          extra: fields.text ?? step.text,
        },
      ])
    }
  })
}

export async function deleteStep(actor: Actor, stepId: string, database = db) {
  const step = await requireStep(actor.id, stepId, database)
  await database.delete(projectTaskSteps).where(eq(projectTaskSteps.id, step.id))
  await touchTask(step.taskId, database)
}

export async function requireStep(userId: string, stepId: string, database: ProjectDb) {
  const [step] = await database
    .select({
      id: projectTaskSteps.id,
      taskId: projectTaskSteps.taskId,
      text: projectTaskSteps.text,
      assigneeUserId: projectTaskSteps.assigneeUserId,
    })
    .from(projectTaskSteps)
    .where(eq(projectTaskSteps.id, stepId))
    .limit(1)
  if (!step) throw new Error(PROJECT_ERRORS.stepNotFound)
  await requireTaskAccess(userId, step.taskId, database)
  return step
}

export async function touchTask(taskId: string, database: ProjectDb) {
  await database
    .update(projectTasks)
    .set({ updatedAt: now() })
    .where(eq(projectTasks.id, taskId))
}
