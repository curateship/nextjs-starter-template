import { and, desc, eq, ilike, isNotNull, isNull, ne } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { runsTheTeam, type RepeatEvery } from "@/lib/project/rules"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  requireOpenProject,
  requireTaskAccess,
  requireTeamRunner,
  visibleProjectsWhere,
  whoCanStillSee,
  type ProjectDb,
} from "@/server/project/access"
import { taskRef, writeTaskNotices, type TaskNotice } from "@/server/project/notices"
import { projectProjects, projectTasks } from "@/server/project/schema"
import {
  removeTaskFilesFromStorage,
  type FileStorage,
} from "@/server/project/task-files"
import { recordTaskEvent } from "@/server/project/task-history"
import type { Actor } from "@/server/project/tasks"
import { customShellUsers } from "@/server/schema"

/**
 * Planning a task ahead: repeating it, snoozing it, waiting on another task,
 * and the bin. The repeat copies and emptying old bins run as background jobs
 * in `planning-jobs.ts`.
 */

export type RepeatRule =
  | { every: "workday" }
  | { every: "week"; weekDays: number[] }
  | { every: "month"; monthDay: number }

export function repeatRuleOf(task: {
  repeatEvery: RepeatEvery | null
  repeatWeekDays: number[] | null
  repeatMonthDay: number | null
}): RepeatRule | null {
  if (task.repeatEvery === "workday") return { every: "workday" }
  if (task.repeatEvery === "week" && task.repeatWeekDays?.length) {
    return { every: "week", weekDays: [...task.repeatWeekDays] }
  }
  if (task.repeatEvery === "month" && task.repeatMonthDay) {
    return { every: "month", monthDay: task.repeatMonthDay }
  }
  return null
}

/**
 * Sets or clears how a task repeats. The rule lives on the newest copy, so
 * setting it here starts a series with this task as its first.
 */
export async function setRepeat(
  actor: Actor,
  input: { taskId: string; repeat: RepeatRule | null },
  database = db
) {
  const { task } = await requireTaskAccess(actor.id, input.taskId, database)
  const rule = input.repeat
  await database
    .update(projectTasks)
    .set({
      repeatEvery: rule?.every ?? null,
      repeatWeekDays: rule?.every === "week" ? rule.weekDays : null,
      repeatMonthDay: rule?.every === "month" ? rule.monthDay : null,
      repeatSeriesId: rule ? (task.repeatSeriesId ?? task.id) : task.repeatSeriesId,
      updatedAt: now(),
    })
    .where(eq(projectTasks.id, task.id))
}

/**
 * "Waiting on" another task in the team that this person can see. A task
 * can't wait on itself, nor on anything that is already waiting on it, however
 * far down the line.
 */
export async function setWaitingOn(
  actor: Actor,
  input: { taskId: string; waitingOnTaskId: string | null },
  database = db
) {
  const { task } = await requireTaskAccess(actor.id, input.taskId, database)
  const blockerId = input.waitingOnTaskId
  if (blockerId) {
    if (blockerId === task.id) throw new Error(PROJECT_ERRORS.cantWaitOnItself)
    await requireTaskAccess(actor.id, blockerId, database, { allowArchived: true })
    let next: string | null = blockerId
    for (let hops = 0; next && hops < 100; hops++) {
      const [row] = await database
        .select({ waitingOn: projectTasks.waitingOnTaskId })
        .from(projectTasks)
        .where(eq(projectTasks.id, next))
      next = row?.waitingOn ?? null
      if (next === task.id) throw new Error(PROJECT_ERRORS.waitingLoop)
    }
  }
  await database
    .update(projectTasks)
    .set({ waitingOnTaskId: blockerId, updatedAt: now() })
    .where(eq(projectTasks.id, task.id))
}

/**
 * When a task becomes Done, each task waiting on it is ready to start, and
 * its person hears so once. Called from the status change, in its transaction.
 */
export async function tellWaitingTasks(actor: Actor, doneTaskId: string, tx: ProjectDb) {
  const waiting = await tx
    .select({ task: projectTasks, project: projectProjects })
    .from(projectTasks)
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .where(
      and(
        eq(projectTasks.waitingOnTaskId, doneTaskId),
        isNull(projectTasks.deletedAt),
        ne(projectTasks.status, "done")
      )
    )
  const notices: TaskNotice[] = []
  for (const { task, project } of waiting) {
    const [recipient] = await whoCanStillSee(project, [task.assigneeUserId], tx)
    if (recipient) {
      notices.push({ kind: "task_ready", recipientUserId: recipient, actor, task: taskRef(task) })
    }
  }
  await writeTaskNotices(tx, notices)
}

export type BinEntry = {
  id: string
  title: string
  deletedAt: string
  deletedByName: string | null
  /** Whoever could delete it may bring it back (Tyler's choice). */
  canRestore: boolean
}

export type ProjectBin = {
  entries: BinEntry[]
  /** Emptying the bin early is for the owner and admins. */
  canEmpty: boolean
}

export async function loadProjectBin(
  userId: string,
  projectId: string,
  database = db
): Promise<ProjectBin> {
  const { membership } = await requireOpenProject(userId, projectId, database)
  const deleter = alias(customShellUsers, "deleter")
  const rows = await database
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      deletedAt: projectTasks.deletedAt,
      createdBy: projectTasks.createdByUserId,
      deletedByName: deleter.name,
    })
    .from(projectTasks)
    .leftJoin(deleter, eq(deleter.id, projectTasks.deletedByUserId))
    .where(and(eq(projectTasks.projectId, projectId), isNotNull(projectTasks.deletedAt)))
    .orderBy(desc(projectTasks.deletedAt))
  const runs = runsTheTeam(membership.role)
  return {
    entries: rows.map((row) => ({
      id: row.id,
      title: row.title,
      deletedAt: row.deletedAt!.toISOString(),
      deletedByName: row.deletedByName,
      canRestore: runs || row.createdBy === userId,
    })),
    canEmpty: runs,
  }
}

/** Takes a task out of the bin, whole, as it was. */
export async function restoreTask(actor: Actor, taskId: string, database = db) {
  await database.transaction(async (tx) => {
    const { membership, task } = await requireTaskAccess(actor.id, taskId, tx, {
      allowDeleted: true,
    })
    if (!task.deletedAt) return
    if (task.createdByUserId !== actor.id && !runsTheTeam(membership.role)) {
      throw new Error(PROJECT_ERRORS.cantDeleteTask)
    }
    await tx
      .update(projectTasks)
      .set({ deletedAt: null, deletedByUserId: null, updatedAt: now() })
      .where(eq(projectTasks.id, task.id))
    await recordTaskEvent(tx, { taskId: task.id, kind: "restored", actorUserId: actor.id })
  })
}

/**
 * Deletes a binned task for good: its files leave storage first, so none is
 * left behind without its task. If storage can't remove them, the task stays
 * in the bin and the next try goes again.
 */
export async function purgeTask(taskId: string, database: ProjectDb, storage?: FileStorage) {
  await removeTaskFilesFromStorage(taskId, database, storage)
  await database
    .delete(projectTasks)
    .where(and(eq(projectTasks.id, taskId), isNotNull(projectTasks.deletedAt)))
}

/** Empties one project's bin now. Owners and admins only. */
export async function emptyProjectBin(
  userId: string,
  projectId: string,
  database = db,
  storage?: FileStorage
) {
  await requireTeamRunner(userId, database)
  await requireOpenProject(userId, projectId, database)
  const binned = await database
    .select({ id: projectTasks.id })
    .from(projectTasks)
    .where(and(eq(projectTasks.projectId, projectId), isNotNull(projectTasks.deletedAt)))
  for (const { id } of binned) await purgeTask(id, database, storage)
}

/** The tasks waiting on this one, for its "Holding up" line. */
export async function waitingOnThis(
  taskId: string,
  visibleProjects: ReadonlySet<string>,
  database: ProjectDb
) {
  const rows = await database
    .select({ id: projectTasks.id, title: projectTasks.title, projectId: projectTasks.projectId })
    .from(projectTasks)
    .where(and(eq(projectTasks.waitingOnTaskId, taskId), isNull(projectTasks.deletedAt)))
  const seen = rows.filter((row) => visibleProjects.has(row.projectId))
  return {
    tasks: seen.map(({ id, title, projectId }) => ({ id, title, projectId })),
    elsewhere: rows.length - seen.length,
  }
}

export type TaskChoice = { id: string; title: string; projectName: string }

/** Tasks this person can see whose title holds the words, for the Waiting on picker. */
export async function findTasksToWaitOn(
  userId: string,
  input: { taskId: string; q: string },
  database = db
): Promise<TaskChoice[]> {
  const { membership } = await requireTaskAccess(userId, input.taskId, database, { allowArchived: true })
  const words = input.q.trim()
  const rows = await database
    .select({ id: projectTasks.id, title: projectTasks.title, projectName: projectProjects.name })
    .from(projectTasks)
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .where(
      and(
        visibleProjectsWhere(membership),
        isNull(projectTasks.deletedAt),
        ne(projectTasks.id, input.taskId),
        words ? ilike(projectTasks.title, `%${escapeLike(words)}%`) : undefined
      )
    )
    .orderBy(desc(projectTasks.updatedAt))
    .limit(20)
  return rows
}

function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`)
}
