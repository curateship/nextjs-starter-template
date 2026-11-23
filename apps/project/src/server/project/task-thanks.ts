import { and, eq, gte, inArray, lt } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireTaskAccess, type ProjectDb } from "@/server/project/access"
import { taskRef, writeTaskNotices } from "@/server/project/notices"
import { projectProjects, projectTaskThanks, projectTasks } from "@/server/project/schema"
import type { Actor } from "@/server/project/tasks"
import { customShellUsers } from "@/server/schema"

/**
 * Thanks for finished work. Anyone who can see a Done task thanks whoever is
 * assigned to it, once, and that person gets "Maya thanked you for a task"
 * with its title. The Check-ins tab shows each day's thanks in one small line
 * per person. No counts and no leaderboard: it is a small touch, never a
 * score.
 */

export async function thankForTask(actor: Actor, taskId: string, database = db) {
  await database.transaction(async (tx) => {
    const { task } = await requireTaskAccess(actor.id, taskId, tx, { allowArchived: true })
    if (task.status !== "done" || !task.assigneeUserId) throw new Error(PROJECT_ERRORS.nothingToThank)
    if (task.assigneeUserId === actor.id) throw new Error(PROJECT_ERRORS.cantThankYourself)
    const added = await tx
      .insert(projectTaskThanks)
      .values({ taskId: task.id, userId: actor.id, thankedUserId: task.assigneeUserId, createdAt: now() })
      .onConflictDoNothing()
      .returning({ taskId: projectTaskThanks.taskId })
    // One thanks per person per task: a second press changes nothing.
    if (!added.length) return
    await writeTaskNotices(tx, [
      { kind: "task_thanks", recipientUserId: task.assigneeUserId, actor, task: taskRef(task) },
    ])
  })
}

/** Whether this person has thanked anyone for the task. */
export async function hasThanked(userId: string, taskId: string, database: ProjectDb = db) {
  const [row] = await database
    .select({ taskId: projectTaskThanks.taskId })
    .from(projectTaskThanks)
    .where(and(eq(projectTaskThanks.taskId, taskId), eq(projectTaskThanks.userId, userId)))
    .limit(1)
  return Boolean(row)
}

export type ThanksLine = {
  fromName: string
  /** Null when the reader can't see the task's project: it reads "a task". */
  taskTitle: string | null
}

/**
 * Thanks these people got between two moments, by who got them. A task in a
 * project the reader can't see, or a "Just me" task, is never named.
 */
export async function thanksBetween(
  userIds: string[],
  from: Date,
  to: Date,
  visibleProjects: ReadonlySet<string>,
  database: ProjectDb = db
) {
  if (userIds.length === 0) return new Map<string, (ThanksLine & { at: Date })[]>()
  const rows = await database
    .select({
      thankedUserId: projectTaskThanks.thankedUserId,
      at: projectTaskThanks.createdAt,
      fromName: customShellUsers.name,
      title: projectTasks.title,
      projectId: projectTasks.projectId,
      personal: projectProjects.personalUserId,
      deletedAt: projectTasks.deletedAt,
    })
    .from(projectTaskThanks)
    .innerJoin(projectTasks, eq(projectTasks.id, projectTaskThanks.taskId))
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTaskThanks.userId))
    .where(
      and(
        inArray(projectTaskThanks.thankedUserId, userIds),
        gte(projectTaskThanks.createdAt, from),
        lt(projectTaskThanks.createdAt, to)
      )
    )
    .orderBy(projectTaskThanks.createdAt)
  const byPerson = new Map<string, (ThanksLine & { at: Date })[]>()
  for (const row of rows) {
    const seen = !row.personal && !row.deletedAt && visibleProjects.has(row.projectId)
    const list = byPerson.get(row.thankedUserId) ?? []
    list.push({ fromName: row.fromName, taskTitle: seen ? row.title : null, at: row.at })
    byPerson.set(row.thankedUserId, list)
  }
  return byPerson
}
