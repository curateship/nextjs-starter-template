import { and, asc, eq, inArray, isNull } from "drizzle-orm"

import type { PlanTask, ProjectPlan } from "@/lib/project/project-plan"
import { copyStepFields } from "@/lib/project/step-fields"
import { now, uuid } from "@/server/auth/security"
import type { ProjectDb, ProjectRow } from "@/server/project/access"
import {
  projectLabels,
  projectMilestones,
  projectTaskFieldValues,
  projectTaskLabels,
  projectTaskSteps,
  projectTaskTypeFields,
  projectTaskTypes,
  projectTasks,
} from "@/server/project/schema"

/**
 * A project's plan, read out of one project and written into another by
 * Copy project, on Tyler's rule of 10 Oct 2026: every task starts To do with
 * nobody assigned and no dates, milestones keep their names but not their
 * dates, steps come unticked, and Person fields start empty: a new project
 * has nobody on it until the site admin adds people, the only one who copies
 * (16 Oct 2026).
 * People, chat, files and history stay behind.
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
  const taskIds = tasks.map((task) => task.id)

  const steps = taskIds.length
    ? await tx
        .select({ taskId: projectTaskSteps.taskId, text: projectTaskSteps.text, fields: projectTaskSteps.fields })
        .from(projectTaskSteps)
        .where(inArray(projectTaskSteps.taskId, taskIds))
        .orderBy(asc(projectTaskSteps.position))
    : []
  const labels = taskIds.length
    ? await tx.select().from(projectTaskLabels).where(inArray(projectTaskLabels.taskId, taskIds))
    : []
  // Only values of the task's own type count; a value left from a type it no
  // longer has is never shown, so it isn't carried either.
  const values = taskIds.length
    ? await tx
        .select({
          taskId: projectTaskFieldValues.taskId,
          fieldId: projectTaskFieldValues.fieldId,
          value: projectTaskFieldValues.value,
          kind: projectTaskTypeFields.kind,
        })
        .from(projectTaskFieldValues)
        .innerJoin(projectTaskTypeFields, eq(projectTaskTypeFields.id, projectTaskFieldValues.fieldId))
        .innerJoin(projectTasks, eq(projectTasks.id, projectTaskFieldValues.taskId))
        .where(
          and(
            inArray(projectTaskFieldValues.taskId, taskIds),
            eq(projectTaskTypeFields.typeId, projectTasks.typeId)
          )
        )
    : []

  const milestonePlace = new Map(milestones.map((milestone, index) => [milestone.id, index]))
  return {
    color: source.color,
    description: source.description,
    hiddenTypeIds: source.hiddenTypeIds,
    defaultTypeId: source.defaultTypeId,
    milestones: milestones.map((milestone) => milestone.name),
    tasks: tasks.map(
      (task): PlanTask => ({
        title: task.title,
        notes: task.notes,
        milestone: task.milestoneId ? (milestonePlace.get(task.milestoneId) ?? null) : null,
        typeId: task.typeId,
        priority: task.priority,
        steps: steps
          .filter((step) => step.taskId === task.id)
          .map((step) => ({ text: step.text, fields: step.fields })),
        labelIds: labels.filter((label) => label.taskId === task.id).map((label) => label.labelId),
        fieldValues: values
          .filter((row) => row.taskId === task.id)
          .filter((row) => row.kind !== "person")
          .map(({ fieldId, value }) => ({ fieldId, value })),
      })
    ),
  }
}

/**
 * Writes a plan into a project that was just made. Anything it names that
 * the team no longer has is left out rather than refused.
 */
export async function writeProjectPlan(
  tx: ProjectDb,
  project: { id: string; teamId: string },
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

  const typeIds = new Set(
    (
      await tx
        .select({ id: projectTaskTypes.id })
        .from(projectTaskTypes)
        .where(eq(projectTaskTypes.teamId, project.teamId))
    ).map((row) => row.id)
  )
  const labelIds = new Set(
    (
      await tx
        .select({ id: projectLabels.id })
        .from(projectLabels)
        .where(eq(projectLabels.teamId, project.teamId))
    ).map((row) => row.id)
  )
  const fields = typeIds.size
    ? await tx
        .select({
          id: projectTaskTypeFields.id,
          typeId: projectTaskTypeFields.typeId,
          kind: projectTaskTypeFields.kind,
        })
        .from(projectTaskTypeFields)
        .where(inArray(projectTaskTypeFields.typeId, [...typeIds]))
    : []
  const fieldById = new Map(fields.map((field) => [field.id, field]))

  const tasks = plan.tasks.map((task, index) => ({
    id: uuid(),
    task,
    typeId: task.typeId && typeIds.has(task.typeId) ? task.typeId : null,
    position: index + 1,
  }))
  await tx.insert(projectTasks).values(
    tasks.map(({ id, task, typeId, position }) => ({
      id,
      projectId: project.id,
      title: task.title,
      notes: task.notes,
      status: "todo" as const,
      milestoneId: task.milestone === null ? null : (milestoneIds[task.milestone] ?? null),
      position,
      createdByUserId: actorId,
      createdAt: at,
      updatedAt: at,
      typeId,
      priority: task.priority,
    }))
  )

  const steps = tasks.flatMap(({ id, task }) =>
    task.steps.map((step, position) => ({
      id: uuid(),
      taskId: id,
      text: step.text,
      done: false,
      position,
      createdAt: at,
      fields: copyStepFields(step.fields),
    }))
  )
  if (steps.length) await tx.insert(projectTaskSteps).values(steps)

  const labels = tasks.flatMap(({ id, task }) =>
    [...new Set(task.labelIds)].filter((labelId) => labelIds.has(labelId)).map((labelId) => ({ taskId: id, labelId }))
  )
  if (labels.length) await tx.insert(projectTaskLabels).values(labels)

  const values = tasks.flatMap(({ id, task, typeId }) =>
    task.fieldValues
      .filter(({ fieldId }) => {
        const field = fieldById.get(fieldId)
        if (!field || field.typeId !== typeId) return false
        return field.kind !== "person"
      })
      .map(({ fieldId, value }) => ({
        taskId: id,
        fieldId,
        value,
        updatedByUserId: actorId,
        updatedAt: at,
      }))
  )
  if (values.length) await tx.insert(projectTaskFieldValues).values(values)
}
