import { and, asc, count, eq, isNull } from "drizzle-orm"
import type { z } from "zod"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import {
  viewFilters,
  viewHasFilters,
  type saveViewSchema,
  type updateViewSchema,
  type SavedViewFilters,
  type SavedViewNames,
} from "@/lib/project/saved-views"
import { NOBODY_FILTER } from "@/lib/project/task-filters"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireMembership, requireProjectAccess, type ProjectDb } from "@/server/project/access"
import {
  projectLabels,
  projectSavedViews,
  projectTaskTypes,
  projectTeamMembers,
} from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

/**
 * Saved views: a person's own named filters on one project, or on My tasks
 * (no project). Only their person reads, saves or deletes them, and a view on
 * a project needs the person to still see that project.
 */

export type SavedView = {
  id: string
  name: string
  filters: SavedViewFilters
  names: SavedViewNames
}

/** The person's views on a project, or on My tasks for `projectId` null. Call after an access check. */
export async function listSavedViews(
  userId: string,
  teamId: string,
  projectId: string | null,
  database: ProjectDb = db
): Promise<SavedView[]> {
  return database
    .select({
      id: projectSavedViews.id,
      name: projectSavedViews.name,
      filters: projectSavedViews.filters,
      names: projectSavedViews.names,
    })
    .from(projectSavedViews)
    .where(
      and(
        eq(projectSavedViews.userId, userId),
        eq(projectSavedViews.teamId, teamId),
        projectId === null
          ? isNull(projectSavedViews.projectId)
          : eq(projectSavedViews.projectId, projectId)
      )
    )
    .orderBy(asc(projectSavedViews.createdAt))
}

export async function saveView(
  userId: string,
  input: z.output<typeof saveViewSchema>,
  database = db
): Promise<SavedView> {
  const membership = input.projectId
    ? (await requireProjectAccess(userId, input.projectId, database)).membership
    : await requireMembership(userId, database)
  const filters = keptFilters(input.projectId, input.filters)

  const [{ total }] = await database
    .select({ total: count() })
    .from(projectSavedViews)
    .where(
      and(
        eq(projectSavedViews.userId, userId),
        eq(projectSavedViews.teamId, membership.teamId),
        input.projectId === null
          ? isNull(projectSavedViews.projectId)
          : eq(projectSavedViews.projectId, input.projectId)
      )
    )
  if (total >= LIMITS.viewsPerPlace) throw new Error(PROJECT_ERRORS.tooManyViews)

  const names = await namesOf(membership.teamId, filters, database)
  const view = {
    id: uuid(),
    teamId: membership.teamId,
    userId,
    projectId: input.projectId,
    name: input.name,
    filters,
    names,
    createdAt: now(),
  }
  await database.insert(projectSavedViews).values(view)
  return { id: view.id, name: view.name, filters, names }
}

/**
 * Edit view: the name and filters of one of the person's own views. It stays
 * on its project or on My tasks, and the person must still see that project.
 */
export async function updateView(
  userId: string,
  input: z.output<typeof updateViewSchema>,
  database = db
): Promise<SavedView> {
  const [row] = await database
    .select({ teamId: projectSavedViews.teamId, projectId: projectSavedViews.projectId })
    .from(projectSavedViews)
    .where(and(eq(projectSavedViews.id, input.viewId), eq(projectSavedViews.userId, userId)))
  if (!row) throw new Error(PROJECT_ERRORS.viewNotFound)
  if (row.projectId) await requireProjectAccess(userId, row.projectId, database)
  const filters = keptFilters(row.projectId, input.filters)
  const names = await namesOf(row.teamId, filters, database)
  await database
    .update(projectSavedViews)
    .set({ name: input.name, filters, names })
    .where(and(eq(projectSavedViews.id, input.viewId), eq(projectSavedViews.userId, userId)))
  return { id: input.viewId, name: input.name, filters, names }
}

/** What a view keeps of the filters given, refused when that is nothing. */
function keptFilters(projectId: string | null, given: SavedViewFilters) {
  const filters = viewFilters(given)
  // My tasks has no Person filter, every task there being the person's own,
  // and no Group row.
  if (projectId === null) {
    delete filters.person
    delete filters.group
  }
  if (!viewHasFilters(filters)) throw new Error(PROJECT_ERRORS.viewNeedsFilters)
  return filters
}

export async function deleteView(userId: string, viewId: string, database = db) {
  const deleted = await database
    .delete(projectSavedViews)
    .where(and(eq(projectSavedViews.id, viewId), eq(projectSavedViews.userId, userId)))
    .returning({ id: projectSavedViews.id })
  if (deleted.length === 0) throw new Error(PROJECT_ERRORS.viewNotFound)
}

/**
 * The person's, label's and type's names as they are now, from this team
 * only, so a view can later say "Leo isn't on this project any more".
 */
async function namesOf(
  teamId: string,
  filters: SavedViewFilters,
  database: ProjectDb
): Promise<SavedViewNames> {
  const names: SavedViewNames = {}
  if (filters.person && filters.person !== NOBODY_FILTER) {
    const [person] = await database
      .select({ name: customShellUsers.name })
      .from(projectTeamMembers)
      .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
      .where(and(eq(projectTeamMembers.teamId, teamId), eq(projectTeamMembers.userId, filters.person)))
    if (person) names.person = person.name
  }
  if (filters.label) {
    const [label] = await database
      .select({ name: projectLabels.name })
      .from(projectLabels)
      .where(and(eq(projectLabels.teamId, teamId), eq(projectLabels.id, filters.label)))
    if (label) names.label = label.name
  }
  if (filters.type) {
    const [type] = await database
      .select({ name: projectTaskTypes.name })
      .from(projectTaskTypes)
      .where(and(eq(projectTaskTypes.teamId, teamId), eq(projectTaskTypes.id, filters.type)))
    if (type) names.type = type.name
  }
  return names
}
