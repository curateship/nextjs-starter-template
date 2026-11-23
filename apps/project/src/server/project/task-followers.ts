import { and, eq } from "drizzle-orm"

import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireTaskAccess, type ProjectDb } from "@/server/project/access"
import { projectTaskFollowers } from "@/server/project/schema"

/**
 * Following a task: anyone who can see it can follow it, and gets its chat,
 * Stuck and Done notices without being assigned. A follower who later loses
 * sight of the project stops being told, because every notice goes through
 * `whoCanStillSee` first. Their row stays, so being added back resumes it.
 */

export async function followTask(userId: string, taskId: string, database = db) {
  await requireTaskAccess(userId, taskId, database, { allowArchived: true })
  await database
    .insert(projectTaskFollowers)
    .values({ taskId, userId, createdAt: now() })
    .onConflictDoNothing()
}

export async function unfollowTask(userId: string, taskId: string, database = db) {
  await requireTaskAccess(userId, taskId, database, { allowArchived: true })
  await database
    .delete(projectTaskFollowers)
    .where(and(eq(projectTaskFollowers.taskId, taskId), eq(projectTaskFollowers.userId, userId)))
}

export async function followerIds(taskId: string, database: ProjectDb): Promise<string[]> {
  const rows = await database
    .select({ userId: projectTaskFollowers.userId })
    .from(projectTaskFollowers)
    .where(eq(projectTaskFollowers.taskId, taskId))
  return rows.map((row) => row.userId)
}
