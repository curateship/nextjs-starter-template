import { and, asc, eq, inArray, isNull, or } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { runsTheTeam, type TeamRole } from "@/lib/project/rules"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  projectProjectMembers,
  projectProjects,
  projectSiteAdminTeams,
  projectTasks,
  projectTeamMembers,
  projectTeams,
} from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

/**
 * Who may see what. Every Project endpoint goes through one of these before it
 * reads or writes, so a person in one team can never reach another team's
 * records by guessing an id.
 *
 * - An employee belongs to at most one team.
 * - The site admin, an account with the shell's `admin` role, runs every
 *   team without being on any of them. Tyler, 16 Oct 2026: "Im admin, I
 *   should be able to see everything." The team picker in the header says
 *   which team they are looking at, and `findMembership` answers for them
 *   with that team and the owner's rights, so its callers need nothing of
 *   their own.
 * - Team roles give no powers: "Only me, the site admin." A stored `owner` or
 *   `admin` row reads as a member.
 * - Only a project's members see it. The site admin sees every project, "Just
 *   me" lists included.
 * - A record someone can't see answers exactly like one that doesn't exist.
 * - A "Just me" project (`personalUserId`) is its person's and the site
 *   admin's alone.
 * - A task in the bin answers as missing, except to the bin itself.
 */

/** The database a check runs on: the shared handle or an open transaction. */
export type ProjectDb =
  | CustomShellDb
  | Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]

/**
 * Who someone is in the team they are looking at. `role` is "owner" for the
 * site admin and "member" for everyone else, whatever their stored row says,
 * so `runsTheTeam(role)` means the site admin everywhere it is asked.
 */
export type Membership = {
  teamId: string
  userId: string
  role: TeamRole
  /** The site admin looking at a team they are not on. */
  siteAdmin: boolean
}

export async function findMembership(
  userId: string,
  database: ProjectDb = db
): Promise<Membership | null> {
  const [row] = await database
    .select({ accountRole: customShellUsers.role, teamId: projectTeamMembers.teamId })
    .from(customShellUsers)
    .leftJoin(projectTeamMembers, eq(projectTeamMembers.userId, customShellUsers.id))
    .where(eq(customShellUsers.id, userId))
    .limit(1)
  if (!row) return null
  if (row.accountRole === "admin") {
    const teamId = await pickedTeam(userId, database)
    return teamId ? { teamId, userId, role: "owner", siteAdmin: true } : null
  }
  return row.teamId ? { teamId: row.teamId, userId, role: "member", siteAdmin: false } : null
}

/** The site admin's picked team, or the first team by name when none is picked. */
async function pickedTeam(userId: string, database: ProjectDb): Promise<string | null> {
  const [picked] = await database
    .select({ teamId: projectSiteAdminTeams.teamId })
    .from(projectSiteAdminTeams)
    .where(eq(projectSiteAdminTeams.userId, userId))
    .limit(1)
  if (picked) return picked.teamId
  const [first] = await database
    .select({ id: projectTeams.id })
    .from(projectTeams)
    .orderBy(asc(projectTeams.name), asc(projectTeams.id))
    .limit(1)
  return first?.id ?? null
}

/** Whether this account is a site admin: the shell's `admin` role. */
export async function isSiteAdmin(userId: string, database: ProjectDb = db) {
  const [row] = await database
    .select({ role: customShellUsers.role })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
    .limit(1)
  return row?.role === "admin"
}

/** Refuses anyone but the site admin. */
export async function requireSiteAdmin(userId: string, database: ProjectDb = db) {
  if (!(await isSiteAdmin(userId, database))) throw new Error(PROJECT_ERRORS.notRunningTeam)
}

/**
 * Every active site admin, for the notices meant for whoever runs a team:
 * the morning check-in count, joins, a milestone with no lead.
 */
export async function siteAdminIds(database: ProjectDb = db): Promise<string[]> {
  const rows = await database
    .select({ id: customShellUsers.id })
    .from(customShellUsers)
    .where(and(eq(customShellUsers.role, "admin"), eq(customShellUsers.status, "active")))
  return rows.map((row) => row.id)
}

/** Points the site admin's team picker at a team. Refuses a team that doesn't exist. */
export async function pickTeam(userId: string, teamId: string, database: ProjectDb = db) {
  await requireSiteAdmin(userId, database)
  const [team] = await database
    .select({ id: projectTeams.id })
    .from(projectTeams)
    .where(eq(projectTeams.id, teamId))
    .limit(1)
  if (!team) throw new Error(PROJECT_ERRORS.teamNotFound)
  await database
    .insert(projectSiteAdminTeams)
    .values({ userId, teamId, updatedAt: now() })
    .onConflictDoUpdate({
      target: projectSiteAdminTeams.userId,
      set: { teamId, updatedAt: now() },
    })
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

/**
 * The site admin sees every project in the team, "Just me" lists included;
 * everyone else, the projects they are on and their own "Just me" list.
 */
export function visibleProjectsWhere(membership: Membership) {
  if (membership.siteAdmin) return eq(projectProjects.teamId, membership.teamId)
  const inTeam = and(
    eq(projectProjects.teamId, membership.teamId),
    or(isNull(projectProjects.personalUserId), eq(projectProjects.personalUserId, membership.userId))
  )
  return and(
    inTeam,
    inArray(
      projectProjects.id,
      db
        .select({ id: projectProjectMembers.projectId })
        .from(projectProjectMembers)
        .where(eq(projectProjectMembers.userId, membership.userId))
    )
  )
}

/** The ids of every project this person can see, archived ones included. */
export async function visibleProjectIds(
  membership: Membership,
  database: ProjectDb = db
): Promise<Set<string>> {
  const rows = await database
    .select({ id: projectProjects.id })
    .from(projectProjects)
    .where(visibleProjectsWhere(membership))
  return new Set(rows.map((row) => row.id))
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
  if (project.personalUserId) {
    if (project.personalUserId !== userId && !membership.siteAdmin) {
      throw new Error(PROJECT_ERRORS.projectNotFound)
    }
    return { membership, project }
  }
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

/**
 * A project's settings, when this person may change them: the site admin
 * alone, Tyler's answer of 16 Oct 2026 ("Employees dont even see the settings
 * cog or page. Only admin see it"). That covers the name, colour,
 * description, due date, Doing limit, client, members, lead, "Everyone on the
 * team", status, sections, task types, Save as template and Archive. A
 * person's own "Just me" list keeps its sections in its person's hands.
 */
export async function requireProjectSettings(
  userId: string,
  projectId: string,
  database: ProjectDb = db,
  { allowArchived = false }: { allowArchived?: boolean } = {}
) {
  const access = allowArchived
    ? await requireProjectAccess(userId, projectId, database)
    : await requireOpenProject(userId, projectId, database)
  if (!access.membership.siteAdmin && access.project.personalUserId !== userId) {
    throw new Error(PROJECT_ERRORS.onlySiteAdminSettings)
  }
  return access
}

export type TaskRow = typeof projectTasks.$inferSelect

/** The task and its project, when this person may change it. */
export async function requireTaskAccess(
  userId: string,
  taskId: string,
  database: ProjectDb = db,
  {
    allowArchived = false,
    allowDeleted = false,
  }: { allowArchived?: boolean; allowDeleted?: boolean } = {}
): Promise<{ membership: Membership; project: ProjectRow; task: TaskRow }> {
  const [task] = await database
    .select()
    .from(projectTasks)
    .where(eq(projectTasks.id, taskId))
    .limit(1)
  if (!task) throw new Error(PROJECT_ERRORS.taskNotFound)
  if (task.deletedAt && !allowDeleted) throw new Error(PROJECT_ERRORS.taskNotFound)
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

/**
 * Of these people, the ones who can still see the project: its members, and
 * the site admins. Someone who has left keeps their name on old tasks but
 * must never be sent a notice that shows a task's title.
 */
export async function whoCanStillSee(
  project: { id: string; teamId: string; personalUserId: string | null },
  userIds: readonly (string | null)[],
  database: ProjectDb
): Promise<string[]> {
  const wanted = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
  if (wanted.length === 0) return []
  const admins = new Set(await siteAdminIds(database))
  if (project.personalUserId) {
    return wanted.filter((id) => id === project.personalUserId || admins.has(id))
  }
  const members = await database
    .select({ userId: projectProjectMembers.userId })
    .from(projectProjectMembers)
    .where(
      and(
        eq(projectProjectMembers.projectId, project.id),
        inArray(projectProjectMembers.userId, wanted)
      )
    )
  const allowed = new Set([...members.map((row) => row.userId), ...admins])
  return wanted.filter((id) => allowed.has(id))
}
