import { and, asc, count, eq, isNull, sql } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireOpenProject, requireTaskAccess, type ProjectDb } from "@/server/project/access"
import { requireSharedProject } from "@/server/project/personal"
import { projectMilestones, projectTasks } from "@/server/project/schema"

/**
 * Milestones: when a set of a project's tasks must be finished, such as
 * "Design signed off, Nov 15". A section is where a task sits; a milestone is
 * when it must be done by, so a task has one of each and they never clash.
 * A task counts toward at most one milestone. Anyone who can change the
 * project adds, changes and deletes them; deleting one frees its tasks.
 */

export type Milestone = {
  id: string
  name: string
  /** Null after Copy project or a template, until someone picks one. */
  dueDate: string | null
  done: number
  total: number
}

/** Soonest first, then the ones with no date in the order they were made. */
export async function listMilestones(projectId: string, database: ProjectDb = db): Promise<Milestone[]> {
  const rows = await database
    .select({
      id: projectMilestones.id,
      name: projectMilestones.name,
      dueDate: projectMilestones.dueDate,
      total: sql<number>`count(${projectTasks.id})`.mapWith(Number),
      done: sql<number>`count(${projectTasks.id}) filter (where ${projectTasks.status} = 'done')`.mapWith(Number),
    })
    .from(projectMilestones)
    .leftJoin(
      projectTasks,
      and(eq(projectTasks.milestoneId, projectMilestones.id), isNull(projectTasks.deletedAt))
    )
    .where(eq(projectMilestones.projectId, projectId))
    .groupBy(projectMilestones.id)
    .orderBy(sql`${projectMilestones.dueDate} asc nulls last`, asc(projectMilestones.createdAt))
  return rows
}

export async function createMilestone(
  userId: string,
  input: { projectId: string; name: string; dueDate: string | null },
  database = db
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    const { project } = await requireOpenProject(userId, input.projectId, tx)
    requireSharedProject(project)
    const [{ total }] = await tx
      .select({ total: count() })
      .from(projectMilestones)
      .where(eq(projectMilestones.projectId, project.id))
    if (total >= LIMITS.milestonesPerProject) throw new Error(PROJECT_ERRORS.tooManyMilestones)
    const id = uuid()
    await tx.insert(projectMilestones).values({
      id,
      projectId: project.id,
      name: input.name,
      dueDate: input.dueDate,
      createdAt: now(),
    })
    return { id }
  })
}

export async function updateMilestone(
  userId: string,
  input: { milestoneId: string; name: string; dueDate: string | null },
  database = db
) {
  const milestone = await requireMilestone(userId, input.milestoneId, database)
  await database
    .update(projectMilestones)
    .set({ name: input.name, dueDate: input.dueDate })
    .where(eq(projectMilestones.id, milestone.id))
}

/** Its tasks stay where they are, counting toward no milestone. */
export async function deleteMilestone(userId: string, milestoneId: string, database = db) {
  const milestone = await requireMilestone(userId, milestoneId, database)
  await database.delete(projectMilestones).where(eq(projectMilestones.id, milestone.id))
}

/** From the task's Plan card. The milestone must be in the task's own project. */
export async function setTaskMilestone(
  userId: string,
  input: { taskId: string; milestoneId: string | null },
  database = db
) {
  const { task } = await requireTaskAccess(userId, input.taskId, database)
  if (input.milestoneId) {
    const [milestone] = await database
      .select({ id: projectMilestones.id })
      .from(projectMilestones)
      .where(and(eq(projectMilestones.id, input.milestoneId), eq(projectMilestones.projectId, task.projectId)))
      .limit(1)
    if (!milestone) throw new Error(PROJECT_ERRORS.milestoneNotFound)
  }
  await database
    .update(projectTasks)
    .set({ milestoneId: input.milestoneId, updatedAt: now() })
    .where(eq(projectTasks.id, task.id))
}

/** A milestone someone else can't see answers as gone. */
async function requireMilestone(userId: string, milestoneId: string, database: ProjectDb) {
  const [milestone] = await database
    .select({ id: projectMilestones.id, projectId: projectMilestones.projectId })
    .from(projectMilestones)
    .where(eq(projectMilestones.id, milestoneId))
    .limit(1)
  if (!milestone) throw new Error(PROJECT_ERRORS.milestoneNotFound)
  try {
    const { project } = await requireOpenProject(userId, milestone.projectId, database)
    requireSharedProject(project)
  } catch (error) {
    if (error instanceof Error && error.message === PROJECT_ERRORS.projectNotFound) {
      throw new Error(PROJECT_ERRORS.milestoneNotFound)
    }
    throw error
  }
  return milestone
}
