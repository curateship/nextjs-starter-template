import { and, asc, eq, inArray, type SQL } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import {
  DEFAULT_CHECKIN_TIME,
  DEFAULT_WORK_DAYS,
  runsTheTeam,
  type TeamInviteRole,
  type TeamRole,
} from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  findMembership,
  requireMembership,
  requireTeamRunner,
  type ProjectDb,
} from "@/server/project/access"
import {
  projectProjectMembers,
  projectProjects,
  projectTasks,
  projectTeamInvites,
  projectTeamMembers,
  projectTeams,
} from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

export type TeamSummary = {
  id: string
  name: string
  checkinTime: string
  timeZone: string
  workDays: number[]
}

export type TeamMemberRow = {
  userId: string
  name: string
  email: string
  avatarUrl: string
  role: TeamRole
  joinedAt: string
}

export type TeamInviteRow = {
  id: string
  email: string
  role: TeamInviteRole
  invitedByName: string | null
  expiresAt: string
  sentAt: string
  expired: boolean
}

export type TeamDashboard = {
  team: TeamSummary
  myRole: TeamRole
  myUserId: string
  members: TeamMemberRow[]
  /** Only the owner and admins see pending invites. */
  invites: TeamInviteRow[]
}

export async function createTeam(
  userId: string,
  input: { name: string; timeZone: string },
  database = db
): Promise<TeamSummary> {
  return database.transaction(async (tx) => {
    if (await findMembership(userId, tx)) {
      throw new Error(PROJECT_ERRORS.alreadyOnTeam)
    }
    const at = now()
    const team = {
      id: uuid(),
      name: input.name,
      checkinTime: DEFAULT_CHECKIN_TIME,
      timeZone: input.timeZone,
      workDays: [...DEFAULT_WORK_DAYS],
      createdAt: at,
      updatedAt: at,
    }
    await tx.insert(projectTeams).values(team)
    await tx.insert(projectTeamMembers).values({
      teamId: team.id,
      userId,
      role: "owner",
      joinedAt: at,
    })
    return toTeamSummary(team)
  })
}

export async function loadTeamDashboard(
  userId: string,
  database = db
): Promise<TeamDashboard | null> {
  const membership = await findMembership(userId, database)
  if (!membership) return null

  const [team] = await database
    .select()
    .from(projectTeams)
    .where(eq(projectTeams.id, membership.teamId))
    .limit(1)
  if (!team) return null

  const members = await listTeamMembers(membership.teamId, database)
  const invites = runsTheTeam(membership.role)
    ? await listTeamInvites(membership.teamId, database)
    : []

  return {
    team: toTeamSummary(team),
    myRole: membership.role,
    myUserId: userId,
    members,
    invites,
  }
}

export async function listTeamMembers(
  teamId: string,
  database: ProjectDb = db
): Promise<TeamMemberRow[]> {
  const rows = await database
    .select({
      userId: projectTeamMembers.userId,
      role: projectTeamMembers.role,
      joinedAt: projectTeamMembers.joinedAt,
      name: customShellUsers.name,
      email: customShellUsers.email,
      avatarUrl: customShellUsers.avatarUrl,
    })
    .from(projectTeamMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
    .where(eq(projectTeamMembers.teamId, teamId))
    .orderBy(asc(customShellUsers.name))
  const order: Record<TeamRole, number> = { owner: 0, admin: 1, member: 2 }
  return rows
    .map((row) => ({
      userId: row.userId,
      role: row.role,
      joinedAt: row.joinedAt.toISOString(),
      name: row.name,
      email: row.email,
      avatarUrl: row.avatarUrl ?? "",
    }))
    .sort((a, b) => order[a.role] - order[b.role])
}

async function listTeamInvites(
  teamId: string,
  database: ProjectDb
): Promise<TeamInviteRow[]> {
  const rows = await database
    .select({
      id: projectTeamInvites.id,
      email: projectTeamInvites.email,
      role: projectTeamInvites.role,
      expiresAt: projectTeamInvites.expiresAt,
      sentAt: projectTeamInvites.sentAt,
      invitedByName: customShellUsers.name,
    })
    .from(projectTeamInvites)
    .leftJoin(
      customShellUsers,
      eq(customShellUsers.id, projectTeamInvites.invitedByUserId)
    )
    .where(eq(projectTeamInvites.teamId, teamId))
    .orderBy(asc(projectTeamInvites.email))
  const at = now()
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    invitedByName: row.invitedByName,
    expiresAt: row.expiresAt.toISOString(),
    sentAt: row.sentAt.toISOString(),
    expired: row.expiresAt <= at,
  }))
}

export async function updateTeam(
  userId: string,
  patch: {
    name?: string
    checkinTime?: string
    timeZone?: string
    workDays?: number[]
  },
  database = db
): Promise<TeamSummary> {
  const membership = await requireTeamRunner(userId, database)
  const [team] = await database
    .update(projectTeams)
    .set({ ...patch, updatedAt: now() })
    .where(eq(projectTeams.id, membership.teamId))
    .returning()
  return toTeamSummary(team)
}

/** Owner and admins move people between admin and member. */
export async function changeMemberRole(
  actorId: string,
  targetUserId: string,
  role: TeamInviteRole,
  database = db
) {
  const membership = await requireTeamRunner(actorId, database)
  const target = await requireTeammate(membership.teamId, targetUserId, database)
  if (target.role === "owner") throw new Error(PROJECT_ERRORS.cantChangeOwner)
  await database
    .update(projectTeamMembers)
    .set({ role })
    .where(
      and(
        eq(projectTeamMembers.teamId, membership.teamId),
        eq(projectTeamMembers.userId, targetUserId)
      )
    )
}

/** The owner hands the team to someone else and becomes an admin. */
export async function transferOwnership(
  actorId: string,
  targetUserId: string,
  database = db
) {
  await database.transaction(async (tx) => {
    const membership = await requireMembership(actorId, tx)
    if (membership.role !== "owner") throw new Error(PROJECT_ERRORS.notRunningTeam)
    if (targetUserId === actorId) return
    await requireTeammate(membership.teamId, targetUserId, tx)
    // Step down first: the table allows one owner per team.
    await tx
      .update(projectTeamMembers)
      .set({ role: "admin" })
      .where(
        and(
          eq(projectTeamMembers.teamId, membership.teamId),
          eq(projectTeamMembers.userId, actorId)
        )
      )
    await tx
      .update(projectTeamMembers)
      .set({ role: "owner" })
      .where(
        and(
          eq(projectTeamMembers.teamId, membership.teamId),
          eq(projectTeamMembers.userId, targetUserId)
        )
      )
  })
}

export async function removeTeamMember(
  actorId: string,
  targetUserId: string,
  database = db
) {
  await database.transaction(async (tx) => {
    const membership = await requireTeamRunner(actorId, tx)
    if (targetUserId === actorId) throw new Error(PROJECT_ERRORS.cantRemoveYourself)
    const target = await requireTeammate(membership.teamId, targetUserId, tx)
    if (target.role === "owner") throw new Error(PROJECT_ERRORS.cantChangeOwner)
    await takePersonOffTeam(membership.teamId, targetUserId, tx)
  })
}

export async function leaveTeam(userId: string, database = db) {
  await database.transaction(async (tx) => {
    const membership = await requireMembership(userId, tx)
    if (membership.role === "owner") throw new Error(PROJECT_ERRORS.ownerCantLeave)
    await takePersonOffTeam(membership.teamId, userId, tx)
  })
}

/**
 * Their tasks stay, with nobody assigned and a note of whose they were, and
 * they lose access at once: off every project, then off the team.
 */
async function takePersonOffTeam(teamId: string, userId: string, tx: ProjectDb) {
  const teamProjectIds = tx
    .select({ id: projectProjects.id })
    .from(projectProjects)
    .where(eq(projectProjects.teamId, teamId))
  await clearAssignee(userId, inArray(projectTasks.projectId, teamProjectIds), tx)
  await tx
    .delete(projectProjectMembers)
    .where(
      and(
        eq(projectProjectMembers.userId, userId),
        inArray(projectProjectMembers.projectId, teamProjectIds)
      )
    )
  await tx
    .delete(projectTeamMembers)
    .where(
      and(eq(projectTeamMembers.teamId, teamId), eq(projectTeamMembers.userId, userId))
    )
}

/**
 * Takes someone off the tasks matched by `where`, keeping their name on each
 * so the task still says whose it was. Shared with removing someone from one
 * project.
 */
export async function clearAssignee(
  userId: string,
  where: SQL,
  tx: ProjectDb
) {
  const [person] = await tx
    .select({ name: customShellUsers.name })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
    .limit(1)
  await tx
    .update(projectTasks)
    .set({
      assigneeUserId: null,
      acceptedAt: null,
      formerAssigneeName: person?.name ?? null,
      updatedAt: now(),
    })
    .where(and(eq(projectTasks.assigneeUserId, userId), where))
}

async function requireTeammate(teamId: string, userId: string, database: ProjectDb) {
  const [row] = await database
    .select({ role: projectTeamMembers.role })
    .from(projectTeamMembers)
    .where(
      and(eq(projectTeamMembers.teamId, teamId), eq(projectTeamMembers.userId, userId))
    )
    .limit(1)
  if (!row) throw new Error(PROJECT_ERRORS.personNotOnTeam)
  return row
}

function toTeamSummary(team: typeof projectTeams.$inferSelect): TeamSummary {
  return {
    id: team.id,
    name: team.name,
    checkinTime: team.checkinTime,
    timeZone: team.timeZone,
    workDays: [...team.workDays],
  }
}

export type BulkResult = { done: string[]; kept: string[] }

/**
 * Runs one change over several rows in one request, keeping going past a row
 * that is refused, and says which went through. The table then words the
 * result with `describeBulkResult`.
 */
export async function eachOf(
  ids: readonly string[],
  change: (id: string) => Promise<unknown>
): Promise<BulkResult> {
  const result: BulkResult = { done: [], kept: [] }
  for (const id of new Set(ids)) {
    try {
      await change(id)
      result.done.push(id)
    } catch {
      result.kept.push(id)
    }
  }
  return result
}
