import { and, count, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm"

import { now } from "@/server/auth/security"
import type { Membership, ProjectDb } from "@/server/project/access"
import {
  projectChatReads,
  projectProjectMembers,
  projectTaskComments,
  projectTaskReads,
  projectTasks,
  projectTeamMembers,
} from "@/server/project/schema"

/**
 * Unread marks: "3 new" on a task's row and on a project's Chat tab. Only
 * messages count, never status moves or hand-overs (Tyler, 13 Oct 2026),
 * and never my own or a deleted one.
 *
 * Each person has one "read up to" time per task chat and per project chat,
 * moved to now whenever they load that chat. With none yet, the day they were
 * added to the project counts, or the day they joined the team for an owner
 * or admin who isn't on it, so someone added to a project later starts with
 * nothing new rather than every old message.
 */

/** Messages someone else wrote that are still showing. */
function fromOthers(userId: string) {
  return and(
    isNull(projectTaskComments.deletedAt),
    or(isNull(projectTaskComments.authorUserId), ne(projectTaskComments.authorUserId, userId))
  )
}

/** How many new messages each task's chat holds for this person; tasks with none are left out. */
export async function unreadByTask(
  viewer: Membership,
  taskIds: string[],
  database: ProjectDb
): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map()
  const rows = await database
    .select({ taskId: projectTaskComments.taskId, total: count() })
    .from(projectTaskComments)
    .innerJoin(projectTasks, eq(projectTasks.id, projectTaskComments.taskId))
    .innerJoin(
      projectTeamMembers,
      and(eq(projectTeamMembers.userId, viewer.userId), eq(projectTeamMembers.teamId, viewer.teamId))
    )
    .leftJoin(
      projectTaskReads,
      and(eq(projectTaskReads.taskId, projectTaskComments.taskId), eq(projectTaskReads.userId, viewer.userId))
    )
    .leftJoin(
      projectProjectMembers,
      and(
        eq(projectProjectMembers.projectId, projectTasks.projectId),
        eq(projectProjectMembers.userId, viewer.userId)
      )
    )
    .where(
      and(
        inArray(projectTaskComments.taskId, taskIds),
        fromOthers(viewer.userId),
        gt(
          projectTaskComments.createdAt,
          sql`coalesce(${projectTaskReads.readAt}, ${projectProjectMembers.addedAt}, ${projectTeamMembers.joinedAt})`
        )
      )
    )
    .groupBy(projectTaskComments.taskId)
  return new Map(rows.flatMap((row) => (row.taskId ? [[row.taskId, row.total]] : [])))
}

/** How many new messages a project's own chat holds for this person. */
export async function unreadInProjectChat(
  viewer: Membership,
  projectId: string,
  database: ProjectDb
): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(projectTaskComments)
    .innerJoin(
      projectTeamMembers,
      and(eq(projectTeamMembers.userId, viewer.userId), eq(projectTeamMembers.teamId, viewer.teamId))
    )
    .leftJoin(
      projectChatReads,
      and(eq(projectChatReads.projectId, projectTaskComments.projectId), eq(projectChatReads.userId, viewer.userId))
    )
    .leftJoin(
      projectProjectMembers,
      and(
        eq(projectProjectMembers.projectId, projectTaskComments.projectId),
        eq(projectProjectMembers.userId, viewer.userId)
      )
    )
    .where(
      and(
        eq(projectTaskComments.projectId, projectId),
        fromOthers(viewer.userId),
        gt(
          projectTaskComments.createdAt,
          sql`coalesce(${projectChatReads.readAt}, ${projectProjectMembers.addedAt}, ${projectTeamMembers.joinedAt})`
        )
      )
    )
  return row?.total ?? 0
}

/** Everything in this task's chat so far is read. */
export async function markTaskRead(userId: string, taskId: string, database: ProjectDb) {
  const at = now()
  await database
    .insert(projectTaskReads)
    .values({ taskId, userId, readAt: at })
    .onConflictDoUpdate({ target: [projectTaskReads.taskId, projectTaskReads.userId], set: { readAt: at } })
}

/** Everything in this project's chat so far is read. */
export async function markProjectChatRead(userId: string, projectId: string, database: ProjectDb) {
  const at = now()
  await database
    .insert(projectChatReads)
    .values({ projectId, userId, readAt: at })
    .onConflictDoUpdate({
      target: [projectChatReads.projectId, projectChatReads.userId],
      set: { readAt: at },
    })
}
