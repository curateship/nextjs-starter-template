import { and, asc, count, eq, gte, inArray, isNull, lt, lte, ne, notInArray, or, sql, type SQL } from "drizzle-orm"

import { addDays, localNow, momentOf } from "@/lib/project/days"
import type { MyPlace } from "@/lib/project/my-task-order"
import type { NoticeSwitchId } from "@/lib/project/notice-switches"
import { CLOSED_TASK_STATUSES, boardStatusOrder, PERSONAL_PROJECT_NAME, priorityRank, type ProjectColor, type TaskStatus } from "@/lib/project/rules"
import type { TaskType } from "@/lib/project/task-types"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { inTeam, requireSiteAdmin, whoCanStillSee, type ProjectDb } from "@/server/project/access"
import { listTeamLabels, type Label } from "@/server/project/labels"
import { occurrencesBetween } from "@/server/project/meetings"
import { handedOutBy, openAsk } from "@/server/project/more-time"
import { loadMyTaskOrder } from "@/server/project/my-task-order"
import { loadNoticesOff } from "@/server/project/notice-switches"
import { loadProjectsPage, type ProjectListRow } from "@/server/project/projects"
import { listTeamNames } from "@/server/project/record-team"
import { adminViewScreen, type SavedView } from "@/server/project/saved-views"
import {
  projectMeetings,
  projectMilestones,
  projectProjectMembers,
  projectProjects,
  projectSiteAdminPrefs,
  projectTasks,
  projectTeamMembers,
  projectTeams,
} from "@/server/project/schema"
import { listTaskCards, type TaskCard } from "@/server/project/tasks"
import { listTeamTypes } from "@/server/project/task-types"
import { loadNeedsAttention } from "@/server/project/team-running"
import { listSavedViews } from "@/server/saved-views"
import { customShellUsers } from "@/server/schema"

/**
 * The site admin's My dashboard (Admin task 03, Tyler, 23 Oct 2026): "it
 * wont work like 'my dashboard' my dashboard has things like checkin and
 * checkout which an admin wont need. Admin dashboard should have tasks that
 * are assigned to me and personal tasks." The middle is every task handed to
 * them in any team plus their own list; the left is ten cards counting across
 * every team. Every "today" is in the zone from their My settings.
 */

/** A row's project, named as the site admin reads it across teams: "My team · Website", or "Just me". */
type Named = { projectId: string; projectName: string }

export type WaitingAsk = Named & {
  taskId: string
  title: string
  askedByName: string
  /** The day asked for, and the one it is due now. */
  day: string
  dueDate: string | null
  reason: string
}

export type TeamAttention = { teamId: string; teamName: string; stuck: number; overdue: number; untouched: number }

export type UnassignedTask = Named & {
  taskId: string
  title: string
  dueDate: string | null
  /** Who Hand to offers: the project's people, then the site admin. */
  people: { userId: string; name: string; avatarUrl: string }[]
}

export type PendingInvite = { userId: string; name: string; email: string; teamId: string; teamName: string }

export type TodayMeeting = {
  meetingId: string
  title: string
  color: ProjectColor
  teamId: string
  teamName: string
  startsAt: string
  endsAt: string
}

export type MilestoneDue = Named & { id: string; name: string; dueDate: string; projectId: string; openTasks: number }

export type DonePerson = {
  /** Null for tasks finished with nobody on them. */
  userId: string | null
  name: string
  avatarUrl: string
  tasks: (Named & { taskId: string; title: string })[]
}

export type AdminProject = { name: string; color: ProjectColor; teamName: string | null; movable: boolean }

export type AdminDashboard = {
  me: { id: string; name: string; email: string; avatarUrl: string }
  /** The zone saved in My settings; null until the dashboard first saves the browser's. */
  savedZone: string | null
  /** The zone every "today" here is counted in, and today in it. */
  zone: string
  today: string
  tasks: TaskCard[]
  /** My own order on the List, per heading. */
  myOrder: MyPlace[]
  /** Every team's labels and types, for Filter. */
  labels: Label[]
  taskTypes: TaskType[]
  views: SavedView[]
  viewScreen: string
  noticesOff: NoticeSwitchId[]
  statusOrder: TaskStatus[]
  /** Everyone on a team, for the bulk menu's Hand to; a project refuses anyone not on it. */
  people: { id: string; name: string; avatarUrl: string }[]
  /** Each project's team, so a task opened here asks its own team's questions. */
  projectTeams: Record<string, string>
  /**
   * Each project as the table's Project chip draws it: its own name without
   * the team ("Just me" for their own list), its colour, its team's name (null
   * for their own list), and whether a task can move into it (open and shared).
   */
  projectInfo: Record<string, AdminProject>
  cards: {
    waiting: WaitingAsk[]
    attention: TeamAttention[]
    unassigned: UnassignedTask[]
    invites: PendingInvite[]
    meetings: TodayMeeting[]
    dueThisWeek: TaskCard[]
    /** Every team's open shared projects, whose status the browser works out from late tasks. */
    projects: ProjectListRow[]
    milestones: MilestoneDue[]
    doneToday: DonePerson[]
  }
}

/** The zone the dashboard counts in before one is saved. */
const FALLBACK_ZONE = "UTC"
/** Milestones this many days ahead count as "this month". */
const MILESTONE_DAYS = 30

export async function loadAdminDashboard(userId: string, database = db, at = new Date()): Promise<AdminDashboard> {
  await requireSiteAdmin(userId, database)
  const [me] = await database
    .select({ name: customShellUsers.name, email: customShellUsers.email, avatarUrl: customShellUsers.avatarUrl })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
  const [prefs] = await database
    .select({ timeZone: projectSiteAdminPrefs.timeZone, statusOrder: projectSiteAdminPrefs.statusOrder })
    .from(projectSiteAdminPrefs)
    .where(eq(projectSiteAdminPrefs.userId, userId))
  const zone = prefs?.timeZone ?? FALLBACK_ZONE
  const today = localNow(at, zone).day
  const teams = await listTeamNames(database)
  const teamIds = teams.map((team) => team.id)
  const teamName = new Map(teams.map((team) => [team.id, team.name]))
  // Shared, open projects in the real teams: never anyone's own list, never a site admin's space.
  const sharedOpen: SQL = teamIds.length
    ? and(
        inArray(projectProjects.teamId, teamIds),
        isNull(projectProjects.personalUserId),
        isNull(projectProjects.archivedAt)
      )!
    : sql`false`
  const { label, projectTeams, projectInfo } = await projectLabeller(userId, database)

  const mine = await listTaskCards(
    and(
      eq(projectTasks.assigneeUserId, userId),
      isNull(projectProjects.archivedAt),
      ne(projectTasks.status, "archived"),
      or(isNull(projectProjects.personalUserId), eq(projectProjects.personalUserId, userId))
    ),
    database
  )

  return {
    me: { id: userId, name: me.name, email: me.email, avatarUrl: me.avatarUrl ?? "" },
    savedZone: prefs?.timeZone ?? null,
    zone,
    today,
    // Waiting first, as on an employee's My dashboard: those need an answer first.
    tasks: label([...mine.filter((card) => card.waiting), ...mine.filter((card) => !card.waiting)]),
    myOrder: await loadMyTaskOrder(userId, database),
    labels: (await Promise.all(teamIds.map((id) => listTeamLabels(id, database)))).flat(),
    taskTypes: (await Promise.all(teamIds.map((id) => listTeamTypes(id, database)))).flat(),
    views: (await listSavedViews(userId, adminViewScreen(userId), database)) as SavedView[],
    viewScreen: adminViewScreen(userId),
    noticesOff: await loadNoticesOff(userId, database),
    statusOrder: boardStatusOrder(prefs?.statusOrder ?? []),
    people: teamIds.length
      ? (
          await database
            .selectDistinct({ id: customShellUsers.id, name: customShellUsers.name, avatarUrl: customShellUsers.avatarUrl })
            .from(projectTeamMembers)
            .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
            .where(inArray(projectTeamMembers.teamId, teamIds))
            .orderBy(asc(customShellUsers.name))
        ).map((person) => ({ ...person, avatarUrl: person.avatarUrl ?? "" }))
      : [],
    projectTeams,
    projectInfo,
    cards: {
      waiting: label(await waitingOn(userId, sharedOpen, database)),
      attention: await attentionByTeam(userId, teams, database, at),
      unassigned: label(await unassigned(userId, sharedOpen, database)),
      invites: await pendingInvites(teamIds, teamName, database),
      meetings: await meetingsOn(today, zone, teamIds, teamName, database),
      dueThisWeek: label(
        (
          await listTaskCards(
            and(
              sharedOpen,
              notInArray(projectTasks.status, CLOSED_TASK_STATUSES),
              gte(projectTasks.dueDate, today),
              lte(projectTasks.dueDate, addDays(today, 6))
            ),
            database
          )
        ).sort(bySoonest)
      ),
      projects: (await loadProjectsPage(userId, database)).projects.filter(
        (project) => !project.personal && !project.archived
      ),
      milestones: label(await milestonesDue(today, sharedOpen, database)),
      doneToday: await doneOn(today, zone, sharedOpen, label, database),
    },
  }
}

/**
 * Names each row's project with its team, "My team · Website", since the
 * dashboard mixes every team; a site admin's own list reads "Just me". Also
 * each project's team, and what the table's Project chip shows and offers.
 */
async function projectLabeller(userId: string, database: ProjectDb) {
  const rows = await database
    .select({
      id: projectProjects.id,
      name: projectProjects.name,
      color: projectProjects.color,
      archivedAt: projectProjects.archivedAt,
      personalUserId: projectProjects.personalUserId,
      teamId: projectTeams.id,
      teamName: projectTeams.name,
      teamOwner: projectTeams.personalUserId,
    })
    .from(projectProjects)
    .innerJoin(projectTeams, eq(projectTeams.id, projectProjects.teamId))
    .where(or(isNull(projectProjects.personalUserId), eq(projectProjects.personalUserId, userId)))
  const names = new Map(
    rows.map((row) => [row.id, row.personalUserId ? PERSONAL_PROJECT_NAME : `${row.teamName} · ${row.name}`])
  )
  return {
    label: <T extends Named>(items: T[]): T[] =>
      items.map((item) => ({ ...item, projectName: names.get(item.projectId) ?? item.projectName })),
    projectTeams: Object.fromEntries(rows.map((row) => [row.id, row.teamId])),
    projectInfo: Object.fromEntries(
      rows.map((row): [string, AdminProject] => [
        row.id,
        {
          name: row.personalUserId ? PERSONAL_PROJECT_NAME : row.name,
          color: row.color,
          teamName: row.teamOwner ? null : row.teamName,
          movable: !row.personalUserId && !row.archivedAt && !row.teamOwner,
        },
      ])
    ),
  }
}

/** Soonest due first; then the higher priority; then by title. */
function bySoonest(a: TaskCard, b: TaskCard) {
  return (
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
    priorityRank(a.priority) - priorityRank(b.priority) ||
    a.title.localeCompare(b.title)
  )
}

/**
 * Asks for more time that fall to the site admin: nobody else handed the
 * task out, they handed it out themselves, or whoever did can no longer see
 * it. Oldest ask first.
 */
async function waitingOn(userId: string, sharedOpen: SQL, database: ProjectDb) {
  const rows = await database
    .select({ task: projectTasks, project: projectProjects, askedByName: customShellUsers.name })
    .from(projectTasks)
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTasks.moreTimeByUserId))
    .where(and(sharedOpen, isNull(projectTasks.deletedAt), notInArray(projectTasks.status, CLOSED_TASK_STATUSES)))
    .orderBy(asc(projectTasks.moreTimeAskedAt))
  const asks: WaitingAsk[] = []
  for (const { task, project, askedByName } of rows) {
    const ask = openAsk(task)
    if (!ask) continue
    const hander = handedOutBy(task)
    const fallsToMe =
      !hander || hander === userId || (await whoCanStillSee(project, [hander], database)).length === 0
    if (!fallsToMe) continue
    asks.push({
      taskId: task.id,
      projectId: project.id,
      projectName: project.name,
      title: task.title,
      askedByName,
      day: ask.day,
      dueDate: task.dueDate,
      reason: ask.reason,
    })
  }
  return asks
}

/** Each team's Needs attention counts, worked out exactly as the team's own Attention tab. */
async function attentionByTeam(
  userId: string,
  teams: { id: string; name: string }[],
  database: typeof db,
  at: Date
): Promise<TeamAttention[]> {
  const counts: TeamAttention[] = []
  for (const team of teams) {
    const rows = await inTeam(team.id, () => loadNeedsAttention(userId, database, at))
    const of = (kind: string) => new Set(rows.filter((row) => row.kind === kind).map((row) => row.taskId)).size
    counts.push({
      teamId: team.id,
      teamName: team.name,
      stuck: of("stuck"),
      overdue: of("overdue"),
      untouched: of("untouched"),
    })
  }
  const total = (row: TeamAttention) => row.stuck + row.overdue + row.untouched
  return counts.filter((row) => total(row) > 0).sort((a, b) => total(b) - total(a))
}

/** Open tasks with nobody on them, soonest due first, each with the people Hand to offers. */
async function unassigned(userId: string, sharedOpen: SQL, database: ProjectDb) {
  const cards = (
    await listTaskCards(
      and(sharedOpen, notInArray(projectTasks.status, CLOSED_TASK_STATUSES), isNull(projectTasks.assigneeUserId)),
      database
    )
  ).sort(bySoonest)
  const projectIds = [...new Set(cards.map((card) => card.projectId))]
  const members = projectIds.length
    ? await database
        .select({
          projectId: projectProjectMembers.projectId,
          userId: customShellUsers.id,
          name: customShellUsers.name,
          avatarUrl: customShellUsers.avatarUrl,
        })
        .from(projectProjectMembers)
        .innerJoin(customShellUsers, eq(customShellUsers.id, projectProjectMembers.userId))
        .where(inArray(projectProjectMembers.projectId, projectIds))
        .orderBy(asc(customShellUsers.name))
    : []
  const [me] = await database
    .select({ name: customShellUsers.name, avatarUrl: customShellUsers.avatarUrl })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
  return cards.map((card) => ({
    taskId: card.id,
    projectId: card.projectId,
    projectName: card.projectName,
    title: card.title,
    dueDate: card.dueDate,
    people: [
      ...members
        .filter((member) => member.projectId === card.projectId)
        .map(({ userId: id, name, avatarUrl }) => ({ userId: id, name, avatarUrl: avatarUrl ?? "" })),
      // The site admin may take any task themselves.
      { userId, name: me.name, avatarUrl: me.avatarUrl ?? "" },
    ],
  }))
}

/** People put on a team who haven't set a password yet, the longest waiting first. */
async function pendingInvites(teamIds: string[], teamName: Map<string, string>, database: ProjectDb) {
  if (teamIds.length === 0) return []
  const rows = await database
    .select({
      userId: customShellUsers.id,
      name: customShellUsers.name,
      email: customShellUsers.email,
      teamId: projectTeamMembers.teamId,
    })
    .from(projectTeamMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
    .where(and(inArray(projectTeamMembers.teamId, teamIds), isNull(customShellUsers.passwordHash)))
    .orderBy(asc(projectTeamMembers.joinedAt))
  return rows.map((row) => ({ ...row, teamName: teamName.get(row.teamId) ?? "" }))
}

/** Every team's meetings falling on the site admin's today, earliest first. */
async function meetingsOn(
  today: string,
  zone: string,
  teamIds: string[],
  teamName: Map<string, string>,
  database: ProjectDb
): Promise<TodayMeeting[]> {
  if (teamIds.length === 0) return []
  const rows = await database.select().from(projectMeetings).where(inArray(projectMeetings.teamId, teamIds))
  return rows
    .flatMap((row) =>
      occurrencesBetween(row, zone, today, today).map((occurrence) => ({
        meetingId: row.id,
        title: row.title,
        color: row.color,
        teamId: row.teamId,
        teamName: teamName.get(row.teamId) ?? "",
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
      }))
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** Milestones due from today to 30 days on, soonest first, with their tasks not yet Done. */
async function milestonesDue(today: string, sharedOpen: SQL, database: ProjectDb) {
  const open = database
    .select({ milestoneId: projectTasks.milestoneId, n: count().as("n") })
    .from(projectTasks)
    .where(and(isNull(projectTasks.deletedAt), notInArray(projectTasks.status, CLOSED_TASK_STATUSES)))
    .groupBy(projectTasks.milestoneId)
    .as("open")
  const rows = await database
    .select({
      id: projectMilestones.id,
      name: projectMilestones.name,
      dueDate: projectMilestones.dueDate,
      projectId: projectProjects.id,
      projectName: projectProjects.name,
      openTasks: open.n,
    })
    .from(projectMilestones)
    .innerJoin(projectProjects, eq(projectProjects.id, projectMilestones.projectId))
    .leftJoin(open, eq(open.milestoneId, projectMilestones.id))
    .where(
      and(
        sharedOpen,
        gte(projectMilestones.dueDate, today),
        lte(projectMilestones.dueDate, addDays(today, MILESTONE_DAYS))
      )
    )
    .orderBy(asc(projectMilestones.dueDate), asc(projectMilestones.name))
  return rows.map((row) => ({ ...row, dueDate: row.dueDate!, openTasks: Number(row.openTasks ?? 0) }))
}

/** Tasks finished in the site admin's today, by person, the most first. */
async function doneOn(
  today: string,
  zone: string,
  sharedOpen: SQL,
  label: <T extends Named>(items: T[]) => T[],
  database: ProjectDb
): Promise<DonePerson[]> {
  const cards = await listTaskCards(
    and(
      sharedOpen,
      eq(projectTasks.status, "done"),
      gte(projectTasks.completedAt, momentOf(today, "00:00", zone)),
      lt(projectTasks.completedAt, momentOf(addDays(today, 1), "00:00", zone))
    ),
    database
  )
  const people = new Map<string, DonePerson>()
  for (const card of label(cards)) {
    const key = card.assignee?.id ?? ""
    const person = people.get(key) ?? {
      userId: card.assignee?.id ?? null,
      name: card.assignee?.name ?? "Nobody on it",
      avatarUrl: card.assignee?.avatarUrl ?? "",
      tasks: [],
    }
    person.tasks.push({ taskId: card.id, title: card.title, projectId: card.projectId, projectName: card.projectName })
    people.set(key, person)
  }
  return [...people.values()].sort((a, b) => b.tasks.length - a.tasks.length || a.name.localeCompare(b.name))
}

/** The site admin's own time zone, from My settings. Their own list follows it too. */
export async function setAdminTimeZone(userId: string, timeZone: string, database = db) {
  await requireSiteAdmin(userId, database)
  const at = now()
  await database
    .insert(projectSiteAdminPrefs)
    .values({ userId, timeZone, updatedAt: at })
    .onConflictDoUpdate({ target: projectSiteAdminPrefs.userId, set: { timeZone, updatedAt: at } })
  await database
    .update(projectTeams)
    .set({ timeZone, updatedAt: at })
    .where(eq(projectTeams.personalUserId, userId))
}

/** The site admin's Board columns dragged into a new order: theirs alone. */
export async function setAdminStatusOrder(userId: string, statusOrder: TaskStatus[], database = db) {
  await requireSiteAdmin(userId, database)
  const at = now()
  await database
    .insert(projectSiteAdminPrefs)
    .values({ userId, statusOrder, updatedAt: at })
    .onConflictDoUpdate({ target: projectSiteAdminPrefs.userId, set: { statusOrder, updatedAt: at } })
}
