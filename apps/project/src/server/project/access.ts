import { and, eq } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { runsTheTeam, type TeamRole } from "@/lib/project/rules"
import { db, type CustomShellDb } from "@/server/db"
import {
  projectProjectMembers,
  projectProjects,
  projectTasks,
  projectTeamMembers,
} from "@/server/project/schema"

/**
 * Who may see what. Every Project endpoint goes through one of these before it
 * reads or writes, so a person in one team can never reach another team's
 * records by guessing an id.
 *
 * - A person belongs to at most one team.
 * - Only a project's members see it. The team's owner and admins see every
 *   project in their team, so no project can be left with nobody able to open
 *   it.
 * - A record someone can't see answers exactly like one that doesn't exist.
 */

/** The database a check runs on: the shared handle or an open transaction. */
export type ProjectDb =
  | CustomShellDb
  | Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]

export type Membership = { teamId: string; userId: string; role: TeamRole }

export async function findMembership(
  userId: string,
  database: ProjectDb = db
): Promise<Membership | null> {
  const [row] = await database
    .select({
      teamId: projectTeamMembers.teamId,
      userId: projectTeamMembers.userId,
      role: projectTeamMembers.role,
    })
    .from(projectTeamMembers)
    .where(eq(projectTeamMembers.userId, userId))
    .limit(1)
  return row ?? null
}

export async function requireMembership(
  userId: string,
  database: ProjectDb = db
): Promise<Membership> {
  const membership = await findMembership(userId, database)
  if (!membership) throw new Error(PROJECT_ERRORS.noTeam)
  return membership
}

export async function requireTeamRunner(
  userId: string,
  database: ProjectDb = db
): Promise<Membership> {
  const membership = await requireMembership(userId, database)
  if (!runsTheTeam(membership.role)) {
    throw new Error(PROJECT_ERRORS.notRunningTeam)
  }
  return membership
}

export type ProjectRow = typeof projectProjects.$inferSelect

export async function isProjectMember(
  projectId: string,
  userId: string,
  database: ProjectDb = db
) {
  const [row] = await database
    .select({ userId: projectProjectMembers.userId })
    .from(projectProjectMembers)
    .where(
      and(
        eq(projectProjectMembers.projectId, projectId),
        eq(projectProjectMembers.userId, userId)
      )
    )
    .limit(1)
  return Boolean(row)
}

/** The project, when this person may see it. Refuses otherwise. */
export async function requireProjectAccess(
  userId: string,
  projectId: string,
  database: ProjectDb = db
): Promise<{ membership: Membership; project: ProjectRow }> {
  const membership = await requireMembership(userId, database)
  const [project] = await database
    .select()
    .from(projectProjects)
    .where(
      and(
        eq(projectProjects.id, projectId),
        eq(projectProjects.teamId, membership.teamId)
      )
    )
    .limit(1)
  if (!project) throw new Error(PROJECT_ERRORS.projectNotFound)
  if (
    !runsTheTeam(membership.role) &&
    !(await isProjectMember(projectId, userId, database))
  ) {
    throw new Error(PROJECT_ERRORS.projectNotFound)
  }
  return { membership, project }
}

/** As above, and the project must not be archived: archived means read-only. */
export async function requireOpenProject(
  userId: string,
  projectId: string,
  database: ProjectDb = db
) {
  const access = await requireProjectAccess(userId, projectId, database)
  if (access.project.archivedAt) throw new Error(PROJECT_ERRORS.projectArchived)
  return access
}

export type TaskRow = typeof projectTasks.$inferSelect

/** The task and its project, when this person may change it. */
export async function requireTaskAccess(
  userId: string,
  taskId: string,
  database: ProjectDb = db,
  { allowArchived = false }: { allowArchived?: boolean } = {}
): Promise<{ membership: Membership; project: ProjectRow; task: TaskRow }> {
  const [task] = await database
    .select()
    .from(projectTasks)
    .where(eq(projectTasks.id, taskId))
    .limit(1)
  if (!task) throw new Error(PROJECT_ERRORS.taskNotFound)
  try {
    const access = allowArchived
      ? await requireProjectAccess(userId, task.projectId, database)
      : await requireOpenProject(userId, task.projectId, database)
    return { ...access, task }
  } catch (error) {
    // Someone who can't see the project can't learn the task exists either.
    if (error instanceof Error && error.message === PROJECT_ERRORS.projectNotFound) {
      throw new Error(PROJECT_ERRORS.taskNotFound)
    }
    throw error
  }
}
