import { and, asc, eq, isNull } from "drizzle-orm"

import type { PlanTask, ProjectPlan } from "@/lib/project/project-plan"
import { now, uuid } from "@/server/auth/security"
import type { ProjectDb, ProjectRow } from "@/server/project/access"
import { projectMilestones, projectTasks } from "@/server/project/schema"
import { storedNotesForCopy } from "@/lib/project/notes"

/**
 * A project's plan, read out of one project and written into another by
 * Copy project, on Tyler's rule of 10 Oct 2026: every task starts To do with
 * nobody assigned and no dates, and milestones keep their names but not their
 * dates. People, chat, files and history stay behind.
 */

export async function readProjectPlan(tx: ProjectDb, source: ProjectRow): Promise<ProjectPlan> {
  const milestones = await tx
    .select({ id: projectMilestones.id, name: projectMilestones.name })
    .from(projectMilestones)
    .where(eq(projectMilestones.projectId, source.id))
    .orderBy(asc(projectMilestones.dueDate), asc(projectMilestones.createdAt))
  const tasks = await tx
    .select()
    .from(projectTasks)
    .where(and(eq(projectTasks.projectId, source.id), isNull(projectTasks.deletedAt)))
    .orderBy(asc(projectTasks.position), asc(projectTasks.createdAt))

  const milestonePlace = new Map(milestones.map((milestone, index) => [milestone.id, index]))
  return {
    color: source.color,
    milestones: milestones.map((milestone) => milestone.name),
    tasks: tasks.map(
      (task): PlanTask => ({
        sourceId: task.id,
        title: task.title,
        notes: task.notes,
        milestone: task.milestoneId ? (milestonePlace.get(task.milestoneId) ?? null) : null,
        priority: task.priority,
      })
    ),
  }
}

/** Writes a plan into a project that was just made. */
export async function writeProjectPlan(
  tx: ProjectDb,
  project: { id: string },
  plan: ProjectPlan,
  actorId: string
) {
  const at = now()
  const milestoneIds = plan.milestones.map(() => uuid())
  if (plan.milestones.length) {
    await tx.insert(projectMilestones).values(
      plan.milestones.map((name, index) => ({
        id: milestoneIds[index],
        projectId: project.id,
        name,
        dueDate: null,
        createdAt: at,
      }))
    )
  }
  if (plan.tasks.length === 0) return

  const tasks = plan.tasks.map((task, index) => ({ id: uuid(), task, position: index + 1 }))
  const copyIds = new Map(tasks.map(({ id, task }) => [task.sourceId, id]))
  await tx.insert(projectTasks).values(
    tasks.map(({ id, task, position }) => ({
      id,
      projectId: project.id,
      title: task.title,
      // Task cards point at the copies; files stay behind, so File blocks and uploaded pictures go.
      notes: storedNotesForCopy(task.notes, { taskIds: copyIds }),
      status: "todo" as const,
      milestoneId: task.milestone === null ? null : (milestoneIds[task.milestone] ?? null),
      position,
      createdByUserId: actorId,
      createdAt: at,
      updatedAt: at,
      priority: task.priority,
    }))
  )
}
