import { and, eq } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { PERSONAL_PROJECT_ID, PERSONAL_PROJECT_NAME } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { isSiteAdmin, requireMembership, type ProjectDb } from "@/server/project/access"
import { projectProjectMembers, projectProjects, projectSiteAdminPrefs, projectTeams } from "@/server/project/schema"

/**
 * "Just me" tasks. Each person's own tasks sit in a project of their own,
 * made the first time they need it, which only they can open (`access.ts`)
 * and which never shows on the Projects page. A screen names it by
 * `PERSONAL_PROJECT_ID` until it exists, so nothing is made just by opening a
 * window.
 *
 * An employee's list is on their team. The site admin is on no team, and
 * Tyler wanted "one list of my own" (23 Oct 2026), so theirs is on a space of
 * their own: a team row marked with their id, with no members, which no list
 * of teams shows (`adminSpaceId`).
 */

/** Where the site admin's own list lives, made now if it isn't there yet. */
export async function adminSpaceId(userId: string, database: ProjectDb): Promise<string> {
  const found = await findAdminSpace(userId, database)
  if (found) return found
  const [prefs] = await database
    .select({ timeZone: projectSiteAdminPrefs.timeZone })
    .from(projectSiteAdminPrefs)
    .where(eq(projectSiteAdminPrefs.userId, userId))
  const at = now()
  await database
    .insert(projectTeams)
    .values({
      id: uuid(),
      name: PERSONAL_PROJECT_NAME,
      checkinTime: "09:00",
      timeZone: prefs?.timeZone ?? "UTC",
      workDays: [1, 2, 3, 4, 5],
      createdAt: at,
      updatedAt: at,
      personalUserId: userId,
    })
    .onConflictDoNothing()
  // Two windows making it at once: the other one's row wins.
  return (await findAdminSpace(userId, database))!
}

/** Whether a team row is a site admin's own space rather than a team. */
export async function isAdminSpace(teamId: string, database: ProjectDb) {
  const [row] = await database
    .select({ personalUserId: projectTeams.personalUserId })
    .from(projectTeams)
    .where(eq(projectTeams.id, teamId))
    .limit(1)
  return Boolean(row?.personalUserId)
}

async function findAdminSpace(userId: string, database: ProjectDb) {
  const [row] = await database
    .select({ id: projectTeams.id })
    .from(projectTeams)
    .where(eq(projectTeams.personalUserId, userId))
    .limit(1)
  return row?.id ?? null
}

/** The person's own project, made now if they have none. */
async function ensurePersonalProject(userId: string, database: ProjectDb): Promise<string> {
  const teamId = (await isSiteAdmin(userId, database))
    ? await adminSpaceId(userId, database)
    : (await requireMembership(userId, database)).teamId
  const [found] = await database
    .select({ id: projectProjects.id })
    .from(projectProjects)
    .where(
      and(
        eq(projectProjects.teamId, teamId),
        eq(projectProjects.personalUserId, userId)
      )
    )
    .limit(1)
  if (found) return found.id
  const at = now()
  const id = uuid()
  await database
    .insert(projectProjects)
    .values({
      id,
      teamId,
      name: PERSONAL_PROJECT_NAME,
      color: "slate",
      description: "",
      createdByUserId: userId,
      createdAt: at,
      updatedAt: at,
      personalUserId: userId,
    })
    .onConflictDoNothing()
  // Two windows making the first one at once: the other one's row wins.
  const [made] = await database
    .select({ id: projectProjects.id })
    .from(projectProjects)
    .where(
      and(
        eq(projectProjects.teamId, teamId),
        eq(projectProjects.personalUserId, userId)
      )
    )
    .limit(1)
  await database
    .insert(projectProjectMembers)
    .values({ projectId: made.id, userId, addedAt: at })
    .onConflictDoNothing()
  return made.id
}

/** A project id from a screen, with "Just me" turned into the real one. */
export async function resolveProjectId(userId: string, projectId: string, database: ProjectDb) {
  return projectId === PERSONAL_PROJECT_ID ? ensurePersonalProject(userId, database) : projectId
}

/** Refuses a change that only makes sense for a shared project. */
export function requireSharedProject(project: { personalUserId: string | null }) {
  if (project.personalUserId) throw new Error(PROJECT_ERRORS.personalProject)
}
