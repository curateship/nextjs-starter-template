import { and, asc, eq, gte, inArray, isNull, lte, ne, notInArray, or, sql, type SQL } from "drizzle-orm"

import type { AttentionHeading } from "@/lib/project/attention-headings"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { addDays, daysBetween, localNow, momentOf } from "@/lib/project/days"
import type { MyPlace } from "@/lib/project/my-task-order"
import type { NoticeSwitchId } from "@/lib/project/notice-switches"
import { storedNotesForCopy } from "@/lib/project/notes"
import { CLOSED_TASK_STATUSES, boardStatusOrder, PERSONAL_PROJECT_NAME, priorityRank, type ProjectColor, type TaskStatus } from "@/lib/project/rules"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { inTeam, requireSiteAdmin, whoCanStillSee, type ProjectDb } from "@/server/project/access"
import { handedOutBy, openAsk } from "@/server/project/more-time"
import { loadMyTaskOrder } from "@/server/project/my-task-order"
import { loadNoticesOff } from "@/server/project/notice-switches"
import { loadProjectsPage, type ProjectListRow } from "@/server/project/projects"
import { listTeamNames } from "@/server/project/record-team"
import { adminViewScreen, type SavedView } from "@/server/project/saved-views"
import {
  projectProjectMembers,
  projectProjects,
  projectSiteAdminPrefs,
  projectTasks,
  projectTeamMembers,
  projectTeams,
} from "@/server/project/schema"
import { listTaskCards, type TaskCard } from "@/server/project/tasks"
import { loadNeedsAttention } from "@/server/project/team-running"
import { listSavedViews } from "@/server/saved-views"
import { customShellUsers } from "@/server/schema"

/**
 * The site admin's My dashboard (Admin task 03, Tyler, 23 Oct 2026): "it
 * wont work like 'my dashboard' my dashboard has things like checkin and
 * checkout which an admin wont need. Admin dashboard should have tasks that
 * are assigned to me and personal tasks." The middle is every task handed to
 * them in any team plus their own list, with a Need your attention tab of the
 * tasks that need them across every team; the left is their own page, whose
 * Projects blocks draw every open project. Every "today" is in the zone from
 * their My settings.
 */

/** A row's project, named as the site admin reads it across teams: "My team · Website", or "Just me". */
type Named = { projectId: string; projectName: string }

/** An ask for more time that falls to the site admin, for its Yes and No. */
export type AttentionAsk = {
  askedByName: string
  /** The day asked for. */
  day: string
  reason: string
}

/** Someone Hand to offers on a task with nobody on it. */
export type HandToPerson = { userId: string; name: string; avatarUrl: string }

/**
 * The Need your attention tab: each task once, in heading order and, under a
 * heading, the order its reader gives (oldest ask, soonest due, longest
 * stuck first), with what its heading's buttons need.
 */
export type AdminAttention = {
  tasks: TaskCard[]
  heading: Record<string, AttentionHeading>
  asks: Record<string, AttentionAsk>
  /** The project's people, then the site admin, for each task with nobody on it. */
  handTo: Record<string, HandToPerson[]>
}

/** A face on a Projects card. */
export type ProjectFace = { id: string; name: string; avatarUrl: string }

/**
 * What a Projects block adds to its project (task "My dashboard/01 Project
 * cards", Tyler, 29 Oct 2026, drawn by the Projects block since 6 Nov 2026):
 * who's on it, and what got finished lately.
 */
export type AdminProjectCards = {
  /** Up to four people on each project besides its lead, and how many that is in all. */
  people: Record<string, { faces: ProjectFace[]; total: number }>
  /** Tasks finished on each of the last 14 days in their zone, oldest first, today last. */
  finished: Record<string, number[]>
}

export type AdminProject = { name: string; color: ProjectColor; teamName: string | null; movable: boolean }

export type AdminDashboard = {
  me: { id: string; name: string; email: string; avatarUrl: string }
  /** Their own page of notes and "/" blocks at the top of the left panel, as saved, or "". */
  page: string
  /** Their page reads only until they unlock it in My settings. */
  pageLocked: boolean
  /** The zone saved in My settings; null until the dashboard first saves the browser's. */
  savedZone: string | null
  /** The zone every "today" here is counted in, and today in it. */
  zone: string
  today: string
  tasks: TaskCard[]
  /** My own order on the List, per heading. */
  myOrder: MyPlace[]
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
  attention: AdminAttention
  /** Every team's open shared projects, for the Projects blocks, whose status the browser works out from late tasks. */
  projects: ProjectListRow[]
  projectCards: AdminProjectCards
}

/** The zone the dashboard counts in before one is saved. */
const FALLBACK_ZONE = "UTC"
/** Due this week: today and the six days after it. */
const WEEK_DAYS_AHEAD = 6

export async function loadAdminDashboard(userId: string, database = db, at = new Date()): Promise<AdminDashboard> {
  await requireSiteAdmin(userId, database)
  const [me] = await database
    .select({ name: customShellUsers.name, email: customShellUsers.email, avatarUrl: customShellUsers.avatarUrl })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
  const [prefs] = await database
    .select({
      timeZone: projectSiteAdminPrefs.timeZone,
      statusOrder: projectSiteAdminPrefs.statusOrder,
      notes: projectSiteAdminPrefs.notes,
      notesLocked: projectSiteAdminPrefs.notesLocked,
    })
    .from(projectSiteAdminPrefs)
    .where(eq(projectSiteAdminPrefs.userId, userId))
  const zone = prefs?.timeZone ?? FALLBACK_ZONE
  const today = localNow(at, zone).day
  const teams = await listTeamNames(database)
  const teamIds = teams.map((team) => team.id)
  // Shared, open projects in the real teams: never anyone's own list, never a site admin's space.
  const sharedOpen: SQL = teamIds.length
    ? and(
        inArray(projectProjects.teamId, teamIds),
        isNull(projectProjects.personalUserId),
        isNull(projectProjects.archivedAt)
      )!
    : sql`false`
  const { label, projectTeams, projectInfo } = await projectLabeller(userId, database)
  const projects = (await loadProjectsPage(userId, database)).projects.filter(
    (project) => !project.personal && !project.archived
  )

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
    page: prefs?.notes ?? "",
    pageLocked: prefs?.notesLocked ?? false,
    savedZone: prefs?.timeZone ?? null,
    zone,
    today,
    // Waiting first, as on an employee's My dashboard: those need an answer first.
    tasks: label([...mine.filter((card) => card.waiting), ...mine.filter((card) => !card.waiting)]),
    myOrder: await loadMyTaskOrder(userId, database),
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
    attention: await attentionTasks(userId, teams, sharedOpen, today, label, database, at),
    projects,
    // Every open project, so a Projects block picked a moment ago draws in full at once.
    projectCards: await projectCardExtras(projects, today, zone, database),
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
  const asks = new Map<string, AttentionAsk>()
  for (const { task, project, askedByName } of rows) {
    const ask = openAsk(task)
    if (!ask) continue
    const hander = handedOutBy(task)
    const fallsToMe =
      !hander || hander === userId || (await whoCanStillSee(project, [hander], database)).length === 0
    if (fallsToMe) asks.set(task.id, { askedByName, day: ask.day, reason: ask.reason })
  }
  return asks
}

/**
 * Every team's Stuck, Overdue and Untouched tasks, worked out exactly as the
 * team's own Attention tab works them out, longest first.
 */
async function needsHelp(userId: string, teams: { id: string; name: string }[], database: typeof db, at: Date) {
  const kinds = new Map<string, HelpKind>()
  for (const team of teams) {
    const rows = await inTeam(team.id, () => loadNeedsAttention(userId, database, at))
    for (const row of rows) {
      if (!isHelpKind(row.kind)) continue
      // A task that is both keeps the heading higher up the tab: Stuck, then Overdue, then Untouched.
      const kept = kinds.get(row.taskId)
      if (!kept || HELP_KINDS.indexOf(row.kind) < HELP_KINDS.indexOf(kept)) kinds.set(row.taskId, row.kind)
    }
  }
  return kinds
}

const HELP_KINDS = ["stuck", "overdue", "untouched"] as const
type HelpKind = (typeof HELP_KINDS)[number]
const isHelpKind = (kind: string): kind is HelpKind => (HELP_KINDS as readonly string[]).includes(kind)

/**
 * The Need your attention tab's tasks, across every team: asks waiting on
 * the site admin, tasks with nobody on them, Stuck, Overdue and Untouched
 * tasks, and tasks due this week. Each task once, under its first heading.
 */
async function attentionTasks(
  userId: string,
  teams: { id: string; name: string }[],
  sharedOpen: SQL,
  today: string,
  label: <T extends Named>(items: T[]) => T[],
  database: typeof db,
  at: Date
): Promise<AdminAttention> {
  const asks = await waitingOn(userId, sharedOpen, database)
  const nobody = await unassigned(userId, sharedOpen, database)
  const help = await needsHelp(userId, teams, database, at)
  const due = (
    await listTaskCards(
      and(
        sharedOpen,
        notInArray(projectTasks.status, CLOSED_TASK_STATUSES),
        gte(projectTasks.dueDate, today),
        lte(projectTasks.dueDate, addDays(today, WEEK_DAYS_AHEAD))
      ),
      database
    )
  ).sort(bySoonest)

  const heading = new Map<string, AttentionHeading>()
  const put = (ids: Iterable<string>, under: AttentionHeading) => {
    for (const id of ids) if (!heading.has(id)) heading.set(id, under)
  }
  put(asks.keys(), "waiting")
  put(nobody.cards.map((card) => card.id), "unassigned")
  for (const kind of HELP_KINDS) {
    put([...help].filter(([, of]) => of === kind).map(([id]) => id), kind)
  }
  put(due.map((card) => card.id), "due")

  // The cards already read are kept; the asks' and the team tabs' are read in one go.
  const byId = new Map([...nobody.cards, ...due].map((card) => [card.id, card]))
  const missing = [...heading.keys()].filter((id) => !byId.has(id))
  if (missing.length) {
    for (const card of await listTaskCards(and(sharedOpen, inArray(projectTasks.id, missing)), database)) byId.set(card.id, card)
  }
  const ids = [...heading.keys()].filter((id) => byId.has(id))
  return {
    tasks: label(ids.map((id) => byId.get(id)!)),
    heading: Object.fromEntries(ids.map((id) => [id, heading.get(id)!])),
    asks: Object.fromEntries(ids.flatMap((id) => (heading.get(id) === "waiting" ? [[id, asks.get(id)!]] : []))),
    handTo: Object.fromEntries(ids.flatMap((id) => (heading.get(id) === "unassigned" ? [[id, nobody.people.get(id)!]] : []))),
  }
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
  const people = new Map<string, HandToPerson[]>(
    cards.map((card) => [
      card.id,
      [
        ...members
          .filter((member) => member.projectId === card.projectId)
          .map(({ userId: id, name, avatarUrl }) => ({ userId: id, name, avatarUrl: avatarUrl ?? "" })),
        // The site admin may take any task themselves.
        { userId, name: me.name, avatarUrl: me.avatarUrl ?? "" },
      ],
    ])
  )
  return { cards, people }
}

/** Days on a Projects card's line of finished tasks, today included. */
export const FINISHED_DAYS = 14
/** Faces on a Projects card besides the lead's. */
const FACES = 4

/** Each project's people besides its lead, and its tasks finished per day over the last 14 days. */
async function projectCardExtras(
  projects: ProjectListRow[],
  today: string,
  zone: string,
  database: ProjectDb
): Promise<Pick<AdminProjectCards, "people" | "finished">> {
  const ids = projects.map((project) => project.id)
  if (ids.length === 0) return { people: {}, finished: {} }
  const first = addDays(today, -(FINISHED_DAYS - 1))
  const [members, done] = await Promise.all([
    database
      .select({
        projectId: projectProjectMembers.projectId,
        id: customShellUsers.id,
        name: customShellUsers.name,
        avatarUrl: customShellUsers.avatarUrl,
      })
      .from(projectProjectMembers)
      .innerJoin(customShellUsers, eq(customShellUsers.id, projectProjectMembers.userId))
      .where(inArray(projectProjectMembers.projectId, ids))
      .orderBy(asc(customShellUsers.name)),
    database
      .select({ projectId: projectTasks.projectId, completedAt: projectTasks.completedAt })
      .from(projectTasks)
      .where(
        and(
          inArray(projectTasks.projectId, ids),
          isNull(projectTasks.deletedAt),
          eq(projectTasks.status, "done"),
          gte(projectTasks.completedAt, momentOf(first, "00:00", zone))
        )
      ),
  ])
  const lead = new Map(projects.map((project) => [project.id, project.lead?.id]))
  const people: AdminProjectCards["people"] = {}
  for (const member of members) {
    if (member.id === lead.get(member.projectId)) continue
    const entry = (people[member.projectId] ??= { faces: [], total: 0 })
    entry.total += 1
    if (entry.faces.length < FACES) {
      entry.faces.push({ id: member.id, name: member.name, avatarUrl: member.avatarUrl ?? "" })
    }
  }
  const finished: AdminProjectCards["finished"] = {}
  for (const row of done) {
    if (!row.completedAt) continue
    const index = daysBetween(first, localNow(row.completedAt, zone).day)
    if (index < 0 || index >= FINISHED_DAYS) continue
    const days = (finished[row.projectId] ??= Array<number>(FINISHED_DAYS).fill(0))
    days[index] += 1
  }
  return { people, finished }
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

/**
 * The site admin's own page at the top of My dashboard, already checked by
 * `adminPageSchema`. Like a project's page it has no task, so no File block,
 * uploaded picture or Video or Promo card. It alone keeps the dashboard
 * blocks: Projects, Habit, Rating calendar and Rating trend.
 */
export async function setAdminPage(userId: string, notes: string, database = db) {
  await requireSiteAdmin(userId, database)
  // A locked page takes no writing until it's unlocked, as a project's page.
  const [prefs] = await database
    .select({ locked: projectSiteAdminPrefs.notesLocked })
    .from(projectSiteAdminPrefs)
    .where(eq(projectSiteAdminPrefs.userId, userId))
  if (prefs?.locked) throw new Error(PROJECT_ERRORS.adminPageLocked)
  const at = now()
  const kept = storedNotesForCopy(notes, { noTask: true, dashboard: true })
  await database
    .insert(projectSiteAdminPrefs)
    .values({ userId, notes: kept, updatedAt: at })
    .onConflictDoUpdate({ target: projectSiteAdminPrefs.userId, set: { notes: kept, updatedAt: at } })
}

/**
 * Their own page locked so it reads only, or unlocked again, from My settings
 * (Tyler, 6 Nov 2026: "lock the notes option is missing"). Theirs alone.
 */
export async function setAdminPageLock(userId: string, locked: boolean, database = db) {
  await requireSiteAdmin(userId, database)
  const at = now()
  await database
    .insert(projectSiteAdminPrefs)
    .values({ userId, notesLocked: locked, updatedAt: at })
    .onConflictDoUpdate({ target: projectSiteAdminPrefs.userId, set: { notesLocked: locked, updatedAt: at } })
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
