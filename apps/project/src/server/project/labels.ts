import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { LIMITS, type ProjectColor } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  requireMembership,
  requireTaskAccess,
  requireTeamRunner,
  type ProjectDb,
} from "@/server/project/access"
import { projectLabels, projectTaskLabels } from "@/server/project/schema"

/**
 * Labels belong to the team, so "Bug" or "Client" means the same in every
 * project and cuts across them. A project's own headings are sections
 * (`sections.ts`). Anyone on the team can make a label and put it on a task
 * they can change; only the owner and admins rename or delete one.
 */

export type Label = { id: string; name: string; color: ProjectColor }

export async function listTeamLabels(teamId: string, database: ProjectDb = db): Promise<Label[]> {
  return database
    .select({ id: projectLabels.id, name: projectLabels.name, color: projectLabels.color })
    .from(projectLabels)
    .where(eq(projectLabels.teamId, teamId))
    .orderBy(asc(sql`lower(${projectLabels.name})`))
}

/** Each task's labels, by task id. Call only for tasks the reader may see. */
export async function labelsForTasks(
  taskIds: readonly string[],
  database: ProjectDb = db
): Promise<Map<string, Label[]>> {
  const byTask = new Map<string, Label[]>()
  if (taskIds.length === 0) return byTask
  const rows = await database
    .select({
      taskId: projectTaskLabels.taskId,
      id: projectLabels.id,
      name: projectLabels.name,
      color: projectLabels.color,
    })
    .from(projectTaskLabels)
    .innerJoin(projectLabels, eq(projectLabels.id, projectTaskLabels.labelId))
    .where(inArray(projectTaskLabels.taskId, [...taskIds]))
    .orderBy(asc(sql`lower(${projectLabels.name})`))
  for (const { taskId, ...label } of rows) {
    byTask.set(taskId, [...(byTask.get(taskId) ?? []), label])
  }
  return byTask
}

async function requireNameFree(
  teamId: string,
  name: string,
  database: ProjectDb,
  exceptId?: string
) {
  const [taken] = await database
    .select({ id: projectLabels.id })
    .from(projectLabels)
    .where(
      and(
        eq(projectLabels.teamId, teamId),
        sql`lower(${projectLabels.name}) = lower(${name})`,
        exceptId ? ne(projectLabels.id, exceptId) : undefined
      )
    )
    .limit(1)
  if (taken) throw new Error(PROJECT_ERRORS.labelNameTaken)
}

export async function createLabel(
  userId: string,
  input: { name: string; color: ProjectColor },
  database = db
): Promise<Label> {
  return database.transaction(async (tx) => {
    const membership = await requireMembership(userId, tx)
    const [{ total }] = await tx
      .select({ total: count() })
      .from(projectLabels)
      .where(eq(projectLabels.teamId, membership.teamId))
    if (total >= LIMITS.labelsPerTeam) throw new Error(PROJECT_ERRORS.tooManyLabels)
    await requireNameFree(membership.teamId, input.name, tx)
    const label = { id: uuid(), name: input.name, color: input.color }
    await tx.insert(projectLabels).values({
      ...label,
      teamId: membership.teamId,
      createdByUserId: userId,
      createdAt: now(),
    })
    return label
  })
}

async function requireTeamLabel(teamId: string, labelId: string, database: ProjectDb) {
  const [label] = await database
    .select({ id: projectLabels.id })
    .from(projectLabels)
    .where(and(eq(projectLabels.id, labelId), eq(projectLabels.teamId, teamId)))
    .limit(1)
  if (!label) throw new Error(PROJECT_ERRORS.labelNotFound)
}

export async function updateLabel(
  userId: string,
  input: { labelId: string; name?: string; color?: ProjectColor },
  database = db
) {
  await database.transaction(async (tx) => {
    const membership = await requireTeamRunner(userId, tx)
    await requireTeamLabel(membership.teamId, input.labelId, tx)
    if (input.name) await requireNameFree(membership.teamId, input.name, tx, input.labelId)
    const fields: { name?: string; color?: ProjectColor } = {}
    if (input.name) fields.name = input.name
    if (input.color) fields.color = input.color
    if (Object.keys(fields).length === 0) return
    await tx.update(projectLabels).set(fields).where(eq(projectLabels.id, input.labelId))
  })
}

/** Takes the label off every task too, through the table's cascade. */
export async function deleteLabel(userId: string, labelId: string, database = db) {
  const membership = await requireTeamRunner(userId, database)
  await requireTeamLabel(membership.teamId, labelId, database)
  await database.delete(projectLabels).where(eq(projectLabels.id, labelId))
}

/** Sets a task's labels to exactly these. Every one must be the team's. */
export async function setTaskLabels(
  userId: string,
  input: { taskId: string; labelIds: string[] },
  database = db
) {
  await database.transaction(async (tx) => {
    const { membership, task } = await requireTaskAccess(userId, input.taskId, tx)
    const wanted = [...new Set(input.labelIds)]
    if (wanted.length) {
      const found = await tx
        .select({ id: projectLabels.id })
        .from(projectLabels)
        .where(and(inArray(projectLabels.id, wanted), eq(projectLabels.teamId, membership.teamId)))
      if (found.length !== wanted.length) throw new Error(PROJECT_ERRORS.labelNotFound)
    }
    await tx.delete(projectTaskLabels).where(eq(projectTaskLabels.taskId, task.id))
    if (wanted.length) {
      await tx
        .insert(projectTaskLabels)
        .values(wanted.map((labelId) => ({ taskId: task.id, labelId })))
    }
  })
}

