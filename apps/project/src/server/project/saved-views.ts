import { and, eq } from "drizzle-orm"

import {
  savedViewFiltersSchema,
  viewFilters,
  type SavedViewFilters,
  type SavedViewNames,
} from "@/lib/project/saved-views"
import { NOBODY_FILTER } from "@/lib/project/task-filters"
import { savedViewScreen, type SavedViewValues } from "@/lib/saved-views"
import type { SavedViewScreen } from "@/server/app-options"
import { db } from "@/server/db"
import { requireMembership, requireProjectAccess, requireSiteAdmin, type ProjectDb } from "@/server/project/access"
import {
  projectLabels,
  projectTaskTypes,
  projectTeamMembers,
} from "@/server/project/schema"
import { listSavedViews as listShellSavedViews } from "@/server/saved-views"
import { customShellUsers } from "@/server/schema"

/**
 * Saved views on Project's task screens: one project's Board and List
 * (`project:<id>`), My tasks (`my-tasks:<team id>`), and the site admin's
 * My dashboard (`admin-tasks:<their id>`), which spans every team. They live in the
 * shell's `saved_views` table since 20 Oct 2026, when views moved into the
 * shell for every app; `project_saved_views` holds the rows from before and
 * nothing writes to it. The shell keeps the table and the limits; this file
 * says who may keep views where and which filters a view keeps.
 */

export type SavedView = {
  id: string
  name: string
  filters: SavedViewFilters
  names: SavedViewNames
}

/** The shell's key for a project's views, or My tasks' for `projectId` null. */
export function projectViewScreen(teamId: string, projectId: string | null) {
  return projectId === null ? savedViewScreen("my-tasks", teamId) : savedViewScreen("project", projectId)
}

/** The site admin's own views on their My dashboard, kept under their id. */
export function adminViewScreen(userId: string) {
  return savedViewScreen("admin-tasks", userId)
}

/** The person's views on a project, or on My tasks for `projectId` null. Call after an access check. */
export async function listSavedViews(
  userId: string,
  teamId: string,
  projectId: string | null,
  database: ProjectDb = db
): Promise<SavedView[]> {
  // Every row was kept by `keep` below, so its values are task filters.
  return (await listShellSavedViews(userId, projectViewScreen(teamId, projectId), database)) as SavedView[]
}

/** The filters a view keeps, checked against the task filters' own rules. */
function keptFilters(filters: SavedViewValues, myTasks: boolean): SavedViewValues {
  const parsed = savedViewFiltersSchema.safeParse(filters)
  if (!parsed.success) return {}
  const kept = viewFilters(parsed.data)
  // My tasks has no Person filter, every task there being the person's own,
  // and no Group row.
  if (myTasks) {
    delete kept.person
    delete kept.group
  }
  return kept
}

export const projectSavedViewScreens: Record<string, SavedViewScreen> = {
  project: {
    authorize: async ({ userId, recordId, database }) => {
      await requireProjectAccess(userId, recordId, database)
    },
    keep: ({ filters }) => keptFilters(filters, false),
    namesOf: async ({ userId, recordId, filters, database }) => {
      const { membership } = await requireProjectAccess(userId, recordId, database)
      return namesOf(membership.teamId, filters as SavedViewFilters, database)
    },
  },
  "my-tasks": {
    authorize: async ({ userId, recordId, database }) => {
      // A member's membership is their own team whatever team is asked for,
      // so the key's team must be checked against it: otherwise a view could be
      // keyed to another team and its names read back from there.
      const membership = await requireMembership(userId, database, recordId)
      if (membership.teamId !== recordId) throw new Error("FORBIDDEN")
    },
    keep: ({ filters }) => keptFilters(filters, true),
    namesOf: async ({ recordId, filters, database }) => namesOf(recordId, filters as SavedViewFilters, database),
  },
  "admin-tasks": {
    // The key is the site admin's own id, so nobody keeps views under another's.
    authorize: async ({ userId, recordId, database }) => {
      await requireSiteAdmin(userId, database)
      if (recordId !== userId) throw new Error("FORBIDDEN")
    },
    keep: ({ filters }) => keptFilters(filters, true),
    namesOf: async ({ filters, database }) => namesOf(null, filters as SavedViewFilters, database),
  },
}

/**
 * The person's, label's and type's names as they are now, from this team
 * only, so a view can later say "Leo isn't on this project any more". The
 * site admin's My dashboard spans every team, so it passes no team.
 */
async function namesOf(
  teamId: string | null,
  filters: SavedViewFilters,
  database: ProjectDb
): Promise<Record<string, string>> {
  const names: SavedViewNames = {}
  if (filters.person && filters.person !== NOBODY_FILTER) {
    const [person] = await database
      .select({ name: customShellUsers.name })
      .from(projectTeamMembers)
      .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
      .where(and(teamId ? eq(projectTeamMembers.teamId, teamId) : undefined, eq(projectTeamMembers.userId, filters.person)))
    if (person) names.person = person.name
  }
  if (filters.label) {
    const [label] = await database
      .select({ name: projectLabels.name })
      .from(projectLabels)
      .where(and(teamId ? eq(projectLabels.teamId, teamId) : undefined, eq(projectLabels.id, filters.label)))
    if (label) names.label = label.name
  }
  if (filters.type) {
    const [type] = await database
      .select({ name: projectTaskTypes.name })
      .from(projectTaskTypes)
      .where(and(teamId ? eq(projectTaskTypes.teamId, teamId) : undefined, eq(projectTaskTypes.id, filters.type)))
    if (type) names.type = type.name
  }
  return names
}
