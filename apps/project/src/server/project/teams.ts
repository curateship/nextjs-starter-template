import { and, asc, count, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm"

import { localNow } from "@/lib/project/days"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import {
  DEFAULT_CHECKIN_TIME,
  DEFAULT_WORK_DAYS,
  runsTheTeam,
  type TeamRole,
} from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { isOwnedImageUrl } from "@/server/media/library"
import { loadAnnouncement, type Announcement } from "@/server/project/announcements"
import { requireKnownZone } from "@/server/project/checkins"
import { holidayOn, listHolidays, type Holiday } from "@/server/project/holidays"
import { listTeamLabels, type Label } from "@/server/project/labels"
import { listStepLists, type StepList } from "@/server/project/step-lists"
import { listTemplates } from "@/server/project/templates"
import type { TemplateRow } from "@/lib/project/templates"
import { clearPersonValues } from "@/server/project/task-types"
import { pauseClocksOf } from "@/server/project/task-clock-runs"
import { projectViewScreen } from "@/server/project/saved-views"
import { countTeamToday } from "@/server/project/team-days"
import { joinLinkState, type JoinLinkState } from "@/server/project/team-running"
import {
  findMembership,
  requireSiteAdmin,
  requireTeamRunner,
  type ProjectDb,
} from "@/server/project/access"
import { visibleClients } from "@/server/project/clients"
import {
  projectProjectMembers,
  projectProjectStars,
  projectTaskReminders,
  projectTaskSteps,
  projectProjects,
  projectTasks,
  projectTeamMembers,
  projectTeams,
} from "@/server/project/schema"
import { deleteSavedViewsFor } from "@/server/saved-views"
import { customShellUsers } from "@/server/schema"

export type TeamSummary = {
  id: string
  name: string
  checkinTime: string
  timeZone: string
  workDays: number[]
  createdAt: string
  /** The team photo's address, drawn as the wide cover; or null. */
  photoUrl: string | null
  /** The team's square avatar beside its name; null shows its initials. */
  avatarUrl: string | null
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
  joinedAt: string
  /** Invited and hasn't set a password yet, so they have never signed in. */
  invited: boolean
  /** A short job title, such as "Copywriter", or null. */
  title: string | null
}

export type TeamDashboard = {
  team: TeamSummary
  /** "owner" for the site admin, "member" for everyone else. */
  myRole: TeamRole
  myUserId: string
  members: TeamMemberRow[]
  labels: Label[]
  /** The team's saved step lists, renamed and deleted in Team settings. */
  stepLists: StepList[]
  /** The team's saved project templates, renamed and deleted in Team settings. */
  templates: TemplateRow[]
  /** The join link's state, for the site admin; null for everyone else. */
  joinLink: JoinLinkState | null
  /** The team's holidays from today on. */
  holidays: Holiday[]
  /** The pinned announcement, unless there is none or I hid it. */
  announcement: Announcement | null
  /** Clients of the projects I can see, for the Client choice on the calendar and Workload. */
  clients: string[]
}

/**
 * Only the site admin makes teams, and isn't put on them: they oversee, so they
 * are in no member list or count.
 */
export async function createTeam(
  userId: string,
  input: { name: string; timeZone: string },
  database = db
): Promise<TeamSummary> {
  return database.transaction(async (tx) => {
    await requireSiteAdmin(userId, tx)
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
    return toTeamSummary(team)
  })
}

/** A row of the site admin's Teams dashboard. */
export type TeamListRow = {
  id: string
  name: string
  avatarUrl: string | null
  checkinTime: string
  timeZone: string
  /** Employees on the team; the site admin is never counted. */
  people: number
  /** Shared projects not archived. "Just me" lists are each person's, and not counted. */
  openProjects: number
  archivedProjects: number
  /**
   * The team's morning, so the site admin sees every team's day from one page
   * (Seven features, part 3): a day off (not a work day, or a holiday), not
   * yet (before the team's check-in time), or who has checked in so far,
   * counted as the team's calendar counts today.
   */
  today:
    | { state: "day_off" }
    | { state: "not_yet" }
    | { state: "counted"; checkedIn: number; expected: number }
  /** Open tasks in its shared, open projects: Stuck, and past their due date on the team's calendar. */
  stuck: number
  overdue: number
}

/** Each team's Stuck and overdue open tasks, in one read, for the Teams dashboard. */
async function teamTaskCounts(database: ProjectDb, at: Date) {
  const rows = await database
    .select({
      teamId: projectProjects.teamId,
      stuck: sql<number>`count(*) filter (where ${projectTasks.status} = 'stuck')`.mapWith(Number),
      // Overdue on the team's own calendar, as its Needs attention counts it.
      overdue: sql<number>`count(*) filter (where ${projectTasks.dueDate} < (${at.toISOString()}::timestamptz at time zone ${projectTeams.timeZone})::date)`.mapWith(Number),
    })
    .from(projectTasks)
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .innerJoin(projectTeams, eq(projectTeams.id, projectProjects.teamId))
    .where(
      and(
        isNull(projectTasks.deletedAt),
        ne(projectTasks.status, "done"),
        isNull(projectProjects.personalUserId),
        isNull(projectProjects.archivedAt)
      )
    )
    .groupBy(projectProjects.teamId)
  return new Map(rows.map((row) => [row.teamId, row]))
}

/** The team's day so far: a day off, not yet time to check in, or today's count. */
async function teamToday(
  team: { id: string; timeZone: string; checkinTime: string; workDays: readonly number[] },
  database: ProjectDb,
  at: Date
): Promise<TeamListRow["today"]> {
  const local = localNow(at, team.timeZone)
  if (!team.workDays.includes(local.weekday) || (await holidayOn(team.id, local.day, database))) {
    return { state: "day_off" }
  }
  if (local.time < team.checkinTime) return { state: "not_yet" }
  const square = await countTeamToday(team.id, local.day, database)
  return { state: "counted", checkedIn: square.checkedIn, expected: square.expected }
}

/** Every team by name with its counts, for the site admin's Teams dashboard (Tyler, 19 Oct 2026). */
export async function listTeams(userId: string, database = db, at = new Date()): Promise<TeamListRow[]> {
  await requireSiteAdmin(userId, database)
  const [teams, people, projects, tasks] = await Promise.all([
    database.select().from(projectTeams).orderBy(asc(projectTeams.name), asc(projectTeams.id)),
    database
      .select({ teamId: projectTeamMembers.teamId, n: count() })
      .from(projectTeamMembers)
      .groupBy(projectTeamMembers.teamId),
    database
      .select({ teamId: projectProjects.teamId, archivedAt: projectProjects.archivedAt })
      .from(projectProjects)
      .where(isNull(projectProjects.personalUserId)),
    teamTaskCounts(database, at),
  ])
  const peopleOf = new Map(people.map((row) => [row.teamId, Number(row.n)]))
  // One team at a time: the day's count reads each team's own check-ins and time off.
  const todays = new Map<string, TeamListRow["today"]>()
  for (const team of teams) todays.set(team.id, await teamToday(team, database, at))
  return teams.map((team) => {
    const mine = projects.filter((project) => project.teamId === team.id)
    const archived = mine.filter((project) => project.archivedAt).length
    return {
      id: team.id,
      name: team.name,
      avatarUrl: team.avatarUrl,
      checkinTime: team.checkinTime,
      timeZone: team.timeZone,
      people: peopleOf.get(team.id) ?? 0,
      openProjects: mine.length - archived,
      archivedProjects: archived,
      today: todays.get(team.id)!,
      stuck: tasks.get(team.id)?.stuck ?? 0,
      overdue: tasks.get(team.id)?.overdue ?? 0,
    }
  })
}

/**
 * Deletes a team for good, the site admin's alone (Tyler, 19 Oct 2026). It is
 * refused while anyone is on the team or a shared project is still open, so a
 * slip can't take live work with it. What is left goes with the team row: its
 * archived projects and their tasks, "Just me" lists, check-ins, meetings,
 * labels, task types, templates, step lists, days off and saved views, every
 * one of the 16 tables holding a team's rows deleting with it (`onDelete:
 * "cascade"` in `src/server/project/schema.ts`).
 */
export async function deleteTeam(userId: string, teamId: string, database = db) {
  await database.transaction(async (tx) => {
    await requireSiteAdmin(userId, tx)
    // Locked, so a person joining or a project opening can't slip in under the check.
    const [team] = await tx
      .select({ id: projectTeams.id })
      .from(projectTeams)
      .where(eq(projectTeams.id, teamId))
      .for("update")
      .limit(1)
    if (!team) throw new Error(PROJECT_ERRORS.teamNotFound)
    const [[people], projects] = await Promise.all([
      tx.select({ n: count() }).from(projectTeamMembers).where(eq(projectTeamMembers.teamId, teamId)),
      // Locked too, so a project brought back from the archive meanwhile waits and is counted.
      tx
        .select({ archivedAt: projectProjects.archivedAt })
        .from(projectProjects)
        .where(and(eq(projectProjects.teamId, teamId), isNull(projectProjects.personalUserId)))
        .for("update"),
    ])
    const open = projects.filter((project) => !project.archivedAt).length
    if (Number(people.n) || open) throw new Error(PROJECT_ERRORS.teamNotEmpty)
    await deleteSavedViewsFor({ screens: await teamViewScreens(teamId, tx) }, tx)
    await tx.delete(projectTeams).where(eq(projectTeams.id, teamId))
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

  return {
    team: toTeamSummary(team),
    myRole: membership.role,
    myUserId: userId,
    members,
    labels: await listTeamLabels(membership.teamId, database),
    stepLists: await listStepLists(membership.teamId, database),
    templates: await listTemplates(membership.teamId, database),
    joinLink: runsTheTeam(membership.role) ? await joinLinkState(membership.teamId, database) : null,
    holidays: await listHolidays(
      membership.teamId,
      localNow(now(), team.timeZone).day,
      database
    ),
    announcement: await loadAnnouncement(membership, database),
    clients: await visibleClients(membership, database),
  }
}

export async function listTeamMembers(
  teamId: string,
  database: ProjectDb = db
): Promise<TeamMemberRow[]> {
  const rows = await database
    .select({
      userId: projectTeamMembers.userId,
      joinedAt: projectTeamMembers.joinedAt,
      name: customShellUsers.name,
      email: customShellUsers.email,
      avatarUrl: customShellUsers.avatarUrl,
      title: projectTeamMembers.title,
      passwordHash: customShellUsers.passwordHash,
    })
    .from(projectTeamMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
    .where(eq(projectTeamMembers.teamId, teamId))
    .orderBy(asc(customShellUsers.name))
  return rows.map((row) => ({
    userId: row.userId,
    joinedAt: row.joinedAt.toISOString(),
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl ?? "",
    title: row.title,
    invited: row.passwordHash === null,
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
 * The team photo, the wide cover at the top of the Team dashboard, which the
 * site admin changes (Tyler's choice, 11 Oct 2026). A new photo must be one the person uploaded to the media library
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

/**
 * The team's square avatar, the site admin's to change, with the same rule as
 * the cover photo: a picture they uploaded to the media library themselves.
 * "" takes it away and the team's initials show again.
 */
export async function setTeamAvatar(userId: string, avatarUrl: string, database = db) {
  const membership = await requireTeamRunner(userId, database)
  const [team] = await database
    .select({ avatarUrl: projectTeams.avatarUrl })
    .from(projectTeams)
    .where(eq(projectTeams.id, membership.teamId))
  const unchanged = avatarUrl === (team?.avatarUrl ?? "")
  if (avatarUrl && !unchanged && !(await isOwnedImageUrl(userId, avatarUrl, database))) {
    throw new Error(PROJECT_ERRORS.photoNotYours)
  }
  await database
    .update(projectTeams)
    .set({ avatarUrl: avatarUrl || null, updatedAt: now() })
    .where(eq(projectTeams.id, membership.teamId))
}

export async function removeTeamMember(
  actorId: string,
  targetUserId: string,
  database = db
) {
  await database.transaction(async (tx) => {
    const membership = await requireTeamRunner(actorId, tx)
    await requireTeammate(membership.teamId, targetUserId, tx)
    await takePersonOffTeam(membership.teamId, targetUserId, tx)
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
  // A lead who leaves the team leaves their projects with no lead.
  await tx
    .update(projectProjects)
    .set({ leadUserId: null })
    .where(and(eq(projectProjects.teamId, teamId), eq(projectProjects.leadUserId, userId)))
  await tx
    .delete(projectProjectStars)
    .where(
      and(
        eq(projectProjectStars.userId, userId),
        inArray(projectProjectStars.projectId, teamProjectIds)
      )
    )
  // My tasks on this team and every project of it; the shell's table can't cascade from a membership.
  await deleteSavedViewsFor({ userId, screens: await teamViewScreens(teamId, tx) }, tx)
  await tx
    .delete(projectTaskReminders)
    .where(
      and(
        eq(projectTaskReminders.userId, userId),
        inArray(
          projectTaskReminders.taskId,
          tx
            .select({ id: projectTasks.id })
            .from(projectTasks)
            .where(inArray(projectTasks.projectId, teamProjectIds))
        )
      )
    )
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
  // Their clock on those tasks stops with them.
  await pauseClocksOf(tx, userId, null, where)
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
    .select({ userId: projectTeamMembers.userId })
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
        "photoUrl" | "avatarUrl" | "questionYesterday" | "questionToday" | "questionBlocker" | "starterTasks"
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
    avatarUrl: team.avatarUrl ?? null,
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

/** The saved-view screens a team holds: its My tasks and each of its projects. */
async function teamViewScreens(teamId: string, database: ProjectDb) {
  const projects = await database
    .select({ id: projectProjects.id })
    .from(projectProjects)
    .where(eq(projectProjects.teamId, teamId))
  return [projectViewScreen(teamId, null), ...projects.map((project) => projectViewScreen(teamId, project.id))]
}
