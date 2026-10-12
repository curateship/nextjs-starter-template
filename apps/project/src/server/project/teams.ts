import { and, asc, eq, inArray, type SQL } from "drizzle-orm"

import { localNow } from "@/lib/project/days"
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
import { isOwnedImageUrl } from "@/server/media/library"
import { loadAnnouncement, type Announcement } from "@/server/project/announcements"
import { requireKnownZone } from "@/server/project/checkins"
import { listHolidays, type Holiday } from "@/server/project/holidays"
import { listTeamLabels, type Label } from "@/server/project/labels"
import { clearPersonValues } from "@/server/project/task-types"
import { joinLinkState, type JoinLinkState } from "@/server/project/team-running"
import {
  findMembership,
  requireMembership,
  requireTeamRunner,
  type ProjectDb,
} from "@/server/project/access"
import {
  projectProjectMembers,
  projectProjectStars,
  projectSavedViews,
  projectTaskSteps,
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
  createdAt: string
  /** The team photo's address, or null. */
  photoUrl: string | null
  /** The team's own words for the check-in's boxes; null keeps the usual one. */
  questions: { yesterday: string | null; today: string | null; blocker: string | null }
  /** Titles each new member gets as "Just me" tasks. */
  starterTasks: string[]
}

export type TeamMemberRow = {
  userId: string
  name: string
  email: string
  avatarUrl: string
  role: TeamRole
  joinedAt: string
  /** A short job title, such as "Copywriter", or null. */
  title: string | null
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
  labels: Label[]
  /** The join link's state, for the owner and admins; null for everyone else. */
  joinLink: JoinLinkState | null
  /** The team's holidays from today on. */
  holidays: Holiday[]
  /** The pinned announcement, unless there is none or I hid it. */
  announcement: Announcement | null
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
    await requireKnownZone(input.timeZone, tx)
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
    labels: await listTeamLabels(membership.teamId, database),
    joinLink: runsTheTeam(membership.role) ? await joinLinkState(membership.teamId, database) : null,
    holidays: await listHolidays(
      membership.teamId,
      localNow(now(), team.timeZone).day,
      database
    ),
    announcement: await loadAnnouncement(membership, database),
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
      title: projectTeamMembers.title,
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
      title: row.title,
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
    questionYesterday?: string | null
    questionToday?: string | null
    questionBlocker?: string | null
    starterTasks?: string[]
  },
  database = db
): Promise<TeamSummary> {
  const membership = await requireTeamRunner(userId, database)
  if (patch.timeZone) await requireKnownZone(patch.timeZone, database)
  const [team] = await database
    .update(projectTeams)
    .set({ ...patch, updatedAt: now() })
    .where(eq(projectTeams.id, membership.teamId))
    .returning()
  return toTeamSummary(team)
}

/**
 * The team photo, which the owner and admins change (Tyler's choice, 11 Oct
 * 2026). A new photo must be one the person uploaded to the media library
 * themselves, so nobody can point the team at someone else's file or at an
 * address outside the library. "" takes the photo away.
 */
export async function setTeamPhoto(userId: string, photoUrl: string, database = db) {
  const membership = await requireTeamRunner(userId, database)
  const [team] = await database
    .select({ photoUrl: projectTeams.photoUrl })
    .from(projectTeams)
    .where(eq(projectTeams.id, membership.teamId))
  const unchanged = photoUrl === (team?.photoUrl ?? "")
  if (photoUrl && !unchanged && !(await isOwnedImageUrl(userId, photoUrl, database))) {
    throw new Error(PROJECT_ERRORS.photoNotYours)
  }
  await database
    .update(projectTeams)
    .set({ photoUrl: photoUrl || null, updatedAt: now() })
    .where(eq(projectTeams.id, membership.teamId))
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
    .delete(projectProjectStars)
    .where(
      and(
        eq(projectProjectStars.userId, userId),
        inArray(projectProjectStars.projectId, teamProjectIds)
      )
    )
  await tx
    .delete(projectSavedViews)
    .where(and(eq(projectSavedViews.teamId, teamId), eq(projectSavedViews.userId, userId)))
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
 * Takes someone off the tasks matched by `where`, and off those tasks'
 * steps, keeping their name on each task so it still says whose it was. Shared with removing someone from one
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
  // A Person field in those tasks loses them too, the same as the task.
  await clearPersonValues(userId, where, tx)
  // Their steps in those tasks lose their name too: a step's person must be
  // on the project.
  await tx
    .update(projectTaskSteps)
    .set({ assigneeUserId: null })
    .where(
      and(
        eq(projectTaskSteps.assigneeUserId, userId),
        inArray(
          projectTaskSteps.taskId,
          tx.select({ id: projectTasks.id }).from(projectTasks).where(where)
        )
      )
    )
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

function toTeamSummary(
  team: Pick<
    typeof projectTeams.$inferSelect,
    "id" | "name" | "checkinTime" | "timeZone" | "workDays" | "createdAt"
  > &
    Partial<
      Pick<
        typeof projectTeams.$inferSelect,
        "photoUrl" | "questionYesterday" | "questionToday" | "questionBlocker" | "starterTasks"
      >
    >
): TeamSummary {
  return {
    id: team.id,
    name: team.name,
    checkinTime: team.checkinTime,
    timeZone: team.timeZone,
    workDays: [...team.workDays],
    createdAt: team.createdAt.toISOString(),
    photoUrl: team.photoUrl ?? null,
    questions: {
      yesterday: team.questionYesterday ?? null,
      today: team.questionToday ?? null,
      blocker: team.questionBlocker ?? null,
    },
    starterTasks: team.starterTasks ? [...team.starterTasks] : [],
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
