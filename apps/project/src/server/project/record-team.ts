import { asc, eq, isNull } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { db } from "@/server/db"
import { isSiteAdmin, type ProjectDb } from "@/server/project/access"
import {
  projectLabels,
  projectStepLists,
  projectTaskTypeFields,
  projectTaskTypes,
  projectTeams,
  projectTemplates,
} from "@/server/project/schema"

/**
 * The team a label, template, step list, task type or field belongs to, so a
 * change to one answers for its own team. The site admin is on no team, so
 * without this they would have to say which; everyone else is still checked
 * against their own team by the caller. A record that doesn't exist is refused
 * with its own "not found".
 */
async function teamOf(
  userId: string,
  database: ProjectDb,
  rows: () => Promise<{ teamId: string }[]>,
  missing: string
) {
  // Only the site admin changes these, so nobody else is told whether an id
  // exists: they go on to their own team and are refused there.
  if (!(await isSiteAdmin(userId, database))) return undefined
  const [row] = await rows()
  if (!row) throw new Error(missing)
  return row.teamId
}

export function labelTeam(userId: string, labelId: string, database: ProjectDb) {
  return teamOf(
    userId,
    database,
    () =>
      database.select({ teamId: projectLabels.teamId }).from(projectLabels).where(eq(projectLabels.id, labelId)).limit(1),
    PROJECT_ERRORS.labelNotFound
  )
}

export function templateTeam(userId: string, templateId: string, database: ProjectDb) {
  return teamOf(
    userId,
    database,
    () =>
      database
        .select({ teamId: projectTemplates.teamId })
        .from(projectTemplates)
        .where(eq(projectTemplates.id, templateId))
        .limit(1),
    PROJECT_ERRORS.templateNotFound
  )
}

export function stepListTeam(userId: string, listId: string, database: ProjectDb) {
  return teamOf(
    userId,
    database,
    () =>
      database
        .select({ teamId: projectStepLists.teamId })
        .from(projectStepLists)
        .where(eq(projectStepLists.id, listId))
        .limit(1),
    PROJECT_ERRORS.stepListNotFound
  )
}

export function typeTeam(userId: string, typeId: string, database: ProjectDb) {
  return teamOf(
    userId,
    database,
    () =>
      database
        .select({ teamId: projectTaskTypes.teamId })
        .from(projectTaskTypes)
        .where(eq(projectTaskTypes.id, typeId))
        .limit(1),
    PROJECT_ERRORS.typeNotFound
  )
}

export function fieldTeam(userId: string, fieldId: string, database: ProjectDb) {
  return teamOf(
    userId,
    database,
    () =>
      database
        .select({ teamId: projectTaskTypes.teamId })
        .from(projectTaskTypeFields)
        .innerJoin(projectTaskTypes, eq(projectTaskTypes.id, projectTaskTypeFields.typeId))
        .where(eq(projectTaskTypeFields.id, fieldId))
        .limit(1),
    PROJECT_ERRORS.fieldNotFound
  )
}

/**
 * Every team by name, for what the site admin sees across all teams at once.
 * A site admin's own space for their personal list is no team, so it is left out.
 */
export function listTeamNames(database: ProjectDb = db) {
  return database
    .select({ id: projectTeams.id, name: projectTeams.name })
    .from(projectTeams)
    .where(isNull(projectTeams.personalUserId))
    .orderBy(asc(projectTeams.name), asc(projectTeams.id))
}
