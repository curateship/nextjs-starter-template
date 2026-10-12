import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, ne, notExists } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { localNow } from "@/lib/project/days"
import { LIMITS, runsTheTeam, type RepeatEvery, type TaskStatus } from "@/lib/project/rules"
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
import {
  projectProjects,
  projectTaskWaits,
  projectTasks,
  projectTeams,
} from "@/server/project/schema"
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
  /** `from` is a day in the first week it counts; that week and every other one after it. */
  | { every: "two_weeks"; weekDays: number[]; from: string }
  /** `from` is the first date; the same day every 3 months after it. */
  | { every: "quarter"; from: string }
  | { every: "last_workday" }

/** What the Plan card sends: an every-2-weeks rule counts from the week it is set in. */
export type RepeatInput =
  | Exclude<RepeatRule, { every: "two_weeks" }>
  | { every: "two_weeks"; weekDays: number[] }

export function repeatRuleOf(task: {
  repeatEvery: RepeatEvery | null
  repeatWeekDays: number[] | null
  repeatMonthDay: number | null
  repeatFrom: string | null
}): RepeatRule | null {
  switch (task.repeatEvery) {
    case "workday":
    case "last_workday":
      return { every: task.repeatEvery }
    case "week":
      return task.repeatWeekDays?.length ? { every: "week", weekDays: [...task.repeatWeekDays] } : null
    case "month":
      return task.repeatMonthDay ? { every: "month", monthDay: task.repeatMonthDay } : null
    case "two_weeks":
      return task.repeatWeekDays?.length && task.repeatFrom
        ? { every: "two_weeks", weekDays: [...task.repeatWeekDays], from: task.repeatFrom }
        : null
    case "quarter":
      return task.repeatFrom ? { every: "quarter", from: task.repeatFrom } : null
    default:
      return null
  }
}

/**
 * Sets or clears how a task repeats. The rule lives on the newest copy, so
 * setting it here starts a series with this task as its first.
 *
 * Every 2 weeks counts from the week it is first set in, on the team's own
 * calendar, and keeps that week when only its days change, so ticking a day
 * never moves which weeks are on.
 */
export async function setRepeat(
  actor: Actor,
  input: { taskId: string; repeat: RepeatInput | null },
  database = db
) {
  const { project, task } = await requireTaskAccess(actor.id, input.taskId, database)
  const rule = input.repeat
  let from: string | null = null
  if (rule?.every === "quarter") from = rule.from
  if (rule?.every === "two_weeks") {
    if (task.repeatEvery === "two_weeks" && task.repeatFrom) from = task.repeatFrom
    else {
      const [team] = await database
        .select({ zone: projectTeams.timeZone })
        .from(projectTeams)
        .where(eq(projectTeams.id, project.teamId))
      from = localNow(now(), team.zone).day
    }
  }
  await database
    .update(projectTasks)
    .set({
      repeatEvery: rule?.every ?? null,
      repeatWeekDays: rule?.every === "week" || rule?.every === "two_weeks" ? rule.weekDays : null,
      repeatMonthDay: rule?.every === "month" ? rule.monthDay : null,
      repeatFrom: from,
      repeatSeriesId: rule ? (task.repeatSeriesId ?? task.id) : task.repeatSeriesId,
      updatedAt: now(),
    })
    .where(eq(projectTasks.id, task.id))
}

/** One task another waits on, as the waiting task's lists read it. */
export type WaitRow = { id: string; title: string; projectId: string; status: TaskStatus }

/**
 * What each of these tasks waits on, leaving out tasks in the bin: a task
 * waiting on one in the bin isn't held up by it.
 */
export async function waitsFor(taskIds: string[], database: ProjectDb) {
  const waits = new Map<string, WaitRow[]>()
  if (taskIds.length === 0) return waits
  const rows = await database
    .select({
      taskId: projectTaskWaits.taskId,
      id: projectTasks.id,
      title: projectTasks.title,
      projectId: projectTasks.projectId,
      status: projectTasks.status,
    })
    .from(projectTaskWaits)
    .innerJoin(projectTasks, eq(projectTasks.id, projectTaskWaits.waitingOnTaskId))
    .where(and(inArray(projectTaskWaits.taskId, taskIds), isNull(projectTasks.deletedAt)))
    .orderBy(projectTaskWaits.createdAt)
  for (const { taskId, ...wait } of rows) waits.set(taskId, [...(waits.get(taskId) ?? []), wait])
  return waits
}

/**
 * Adds a task this one waits on: any task in the team this person can see,
 * up to 10. A task can't wait on itself, nor on anything already waiting on
 * it, however far down the line.
 */
export async function addWait(
  actor: Actor,
  input: { taskId: string; waitingOnTaskId: string },
  database = db
) {
  await database.transaction(async (tx) => {
    const { task } = await requireTaskAccess(actor.id, input.taskId, tx)
    const blockerId = input.waitingOnTaskId
    if (blockerId === task.id) throw new Error(PROJECT_ERRORS.cantWaitOnItself)
    await requireTaskAccess(actor.id, blockerId, tx, { allowArchived: true })
    // Counted as the Plan card lists them: one in the bin isn't shown, so it
    // doesn't take a place either.
    const [{ total }] = await tx
      .select({ total: count() })
      .from(projectTaskWaits)
      .innerJoin(projectTasks, eq(projectTasks.id, projectTaskWaits.waitingOnTaskId))
      .where(and(eq(projectTaskWaits.taskId, task.id), isNull(projectTasks.deletedAt)))
    if (total >= LIMITS.waitsPerTask) throw new Error(PROJECT_ERRORS.tooManyWaits)
    if (await waitsOnSomehow(blockerId, task.id, tx)) throw new Error(PROJECT_ERRORS.waitingLoop)
    await tx
      .insert(projectTaskWaits)
      .values({ taskId: task.id, waitingOnTaskId: blockerId, createdAt: now() })
      .onConflictDoNothing()
    await tx.update(projectTasks).set({ updatedAt: now() }).where(eq(projectTasks.id, task.id))
  })
}

/** Takes one task off what this one waits on. */
export async function removeWait(
  actor: Actor,
  input: { taskId: string; waitingOnTaskId: string },
  database = db
) {
  const { task } = await requireTaskAccess(actor.id, input.taskId, database)
  await database
    .delete(projectTaskWaits)
    .where(
      and(eq(projectTaskWaits.taskId, task.id), eq(projectTaskWaits.waitingOnTaskId, input.waitingOnTaskId))
    )
  await database.update(projectTasks).set({ updatedAt: now() }).where(eq(projectTasks.id, task.id))
}

/** True when `from` already waits on `target`, directly or down a line of waits. */
async function waitsOnSomehow(from: string, target: string, database: ProjectDb) {
  const seen = new Set([from])
  let edge = [from]
  // A team's tasks are finite, but a cap keeps one bad chain from running long.
  while (edge.length && seen.size < 5000) {
    const next = await database
      .select({ id: projectTaskWaits.waitingOnTaskId })
      .from(projectTaskWaits)
      .where(inArray(projectTaskWaits.taskId, edge))
    edge = []
    for (const { id } of next) {
      if (id === target) return true
      if (!seen.has(id)) {
        seen.add(id)
        edge.push(id)
      }
    }
  }
  return false
}

/**
 * When a task becomes Done, each task waiting on it whose every other wait is
 * Done too is ready to start, and its person hears so once, as the last one
 * is finished. Called from the status change, in its transaction, after the
 * new status is written.
 */
export async function tellWaitingTasks(actor: Actor, doneTaskId: string, tx: ProjectDb) {
  const waiting = await tx
    .select({ task: projectTasks, project: projectProjects })
    .from(projectTaskWaits)
    .innerJoin(projectTasks, eq(projectTasks.id, projectTaskWaits.taskId))
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .where(
      and(
        eq(projectTaskWaits.waitingOnTaskId, doneTaskId),
        isNull(projectTasks.deletedAt),
        ne(projectTasks.status, "done")
      )
    )
  const waits = await waitsFor(
    waiting.map(({ task }) => task.id),
    tx
  )
  const notices: TaskNotice[] = []
  for (const { task, project } of waiting) {
    if ((waits.get(task.id) ?? []).some((wait) => wait.status !== "done")) continue
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
    .from(projectTaskWaits)
    .innerJoin(projectTasks, eq(projectTasks.id, projectTaskWaits.taskId))
    .where(and(eq(projectTaskWaits.waitingOnTaskId, taskId), isNull(projectTasks.deletedAt)))
  const seen = rows.filter((row) => visibleProjects.has(row.projectId))
  return {
    tasks: seen.map(({ id, title, projectId }) => ({ id, title, projectId })),
    elsewhere: rows.length - seen.length,
  }
}

export type TaskChoice = { id: string; title: string; projectName: string }

/**
 * Tasks this person can see whose title holds the words, for the Waiting on
 * picker, leaving out the ones it already waits on.
 */
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
        notExists(
          database
            .select({ one: projectTaskWaits.taskId })
            .from(projectTaskWaits)
            .where(
              and(
                eq(projectTaskWaits.taskId, input.taskId),
                eq(projectTaskWaits.waitingOnTaskId, projectTasks.id)
              )
            )
        ),
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
