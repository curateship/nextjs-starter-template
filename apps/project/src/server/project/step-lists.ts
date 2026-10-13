import { and, asc, count, eq, max, ne, sql } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireTaskAccess, requireTeamRunner, type ProjectDb } from "@/server/project/access"
import { projectStepLists, projectTaskSteps, projectTasks } from "@/server/project/schema"
import type { Actor } from "@/server/project/tasks"

/**
 * Saved step lists, such as "Payroll": a task's steps kept under a name so
 * routine work gets the same checklist every time. They belong to the team.
 * Anyone on it makes or uses one; the owner and admins rename and delete them
 * in Team settings (Tyler's choice, 12 Oct 2026). Steps added from a list have
 * no person and no date.
 */

/** A list as the screens show it: its name and how many steps it holds. */
export type StepList = { id: string; name: string; stepCount: number }

export async function listStepLists(teamId: string, database: ProjectDb = db): Promise<StepList[]> {
  return database
    .select({
      id: projectStepLists.id,
      name: projectStepLists.name,
      stepCount: sql<number>`cardinality(${projectStepLists.steps})`.mapWith(Number),
    })
    .from(projectStepLists)
    .where(eq(projectStepLists.teamId, teamId))
    .orderBy(asc(sql`lower(${projectStepLists.name})`))
}

/** "Save these steps as a list": the task's steps, in order, under a new name. */
export async function saveStepList(
  actor: Actor,
  input: { taskId: string; name: string },
  database = db
): Promise<StepList> {
  return database.transaction(async (tx) => {
    const { membership, task } = await requireTaskAccess(actor.id, input.taskId, tx, { allowArchived: true })
    const steps = (
      await tx
        .select({ text: projectTaskSteps.text })
        .from(projectTaskSteps)
        .where(eq(projectTaskSteps.taskId, task.id))
        .orderBy(asc(projectTaskSteps.position))
    ).map((step) => step.text)
    if (steps.length === 0) throw new Error(PROJECT_ERRORS.noStepsToSave)
    const [{ total }] = await tx
      .select({ total: count() })
      .from(projectStepLists)
      .where(eq(projectStepLists.teamId, membership.teamId))
    if (total >= LIMITS.stepListsPerTeam) throw new Error(PROJECT_ERRORS.tooManyStepLists)
    await requireNameFree(membership.teamId, input.name, tx)
    const list = { id: uuid(), name: input.name, stepCount: steps.length }
    await tx.insert(projectStepLists).values({
      id: list.id,
      name: list.name,
      steps,
      teamId: membership.teamId,
      createdByUserId: actor.id,
      createdAt: now(),
    })
    return list
  })
}

/**
 * "Add a step list": the list's steps go after the task's own, unticked,
 * with no person or date. A task never goes past 50 steps; a list that would
 * take it over is refused whole, saying how much room is left.
 */
export async function addStepListToTask(
  actor: Actor,
  input: { taskId: string; listId: string },
  database = db
) {
  await database.transaction(async (tx) => {
    const { membership, task } = await requireTaskAccess(actor.id, input.taskId, tx)
    const list = await requireTeamList(membership.teamId, input.listId, tx)
    const [{ total, last }] = await tx
      .select({ total: count(), last: max(projectTaskSteps.position) })
      .from(projectTaskSteps)
      .where(eq(projectTaskSteps.taskId, task.id))
    const room = LIMITS.stepsPerTask - total
    if (list.steps.length > room) {
      throw new Error(
        `That list has ${list.steps.length} ${list.steps.length === 1 ? "step" : "steps"} and this task has room for ${room} more, since a task can have at most ${LIMITS.stepsPerTask}.`
      )
    }
    const at = now()
    await tx.insert(projectTaskSteps).values(
      list.steps.map((text, index) => ({
        id: uuid(),
        taskId: task.id,
        text,
        done: false,
        position: (last ?? -1) + 1 + index,
        createdAt: at,
      }))
    )
    await tx.update(projectTasks).set({ updatedAt: at }).where(eq(projectTasks.id, task.id))
  })
}

export async function renameStepList(
  userId: string,
  input: { listId: string; name: string },
  database = db
) {
  await database.transaction(async (tx) => {
    const membership = await requireTeamRunner(userId, tx)
    await requireTeamList(membership.teamId, input.listId, tx)
    await requireNameFree(membership.teamId, input.name, tx, input.listId)
    await tx.update(projectStepLists).set({ name: input.name }).where(eq(projectStepLists.id, input.listId))
  })
}

export async function deleteStepList(userId: string, listId: string, database = db) {
  const membership = await requireTeamRunner(userId, database)
  await requireTeamList(membership.teamId, listId, database)
  await database.delete(projectStepLists).where(eq(projectStepLists.id, listId))
}

async function requireTeamList(teamId: string, listId: string, database: ProjectDb) {
  const [list] = await database
    .select({ id: projectStepLists.id, steps: projectStepLists.steps })
    .from(projectStepLists)
    .where(and(eq(projectStepLists.id, listId), eq(projectStepLists.teamId, teamId)))
    .limit(1)
  if (!list) throw new Error(PROJECT_ERRORS.stepListNotFound)
  return list
}

async function requireNameFree(teamId: string, name: string, database: ProjectDb, exceptId?: string) {
  const [taken] = await database
    .select({ id: projectStepLists.id })
    .from(projectStepLists)
    .where(
      and(
        eq(projectStepLists.teamId, teamId),
        sql`lower(${projectStepLists.name}) = lower(${name})`,
        exceptId ? ne(projectStepLists.id, exceptId) : undefined
      )
    )
    .limit(1)
  if (taken) throw new Error(PROJECT_ERRORS.stepListNameTaken)
}
