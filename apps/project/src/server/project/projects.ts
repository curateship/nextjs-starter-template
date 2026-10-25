import { and, asc, count, eq, inArray, isNull, lte, notInArray } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import {
  CLOSED_TASK_STATUSES,
  PERSONAL_PROJECT_NAME,
  boardStatusOrder,
  type ProjectColor,
  type TaskStatus,
  type TeamRole,
  isOpenStatus,
} from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { isOwnedImageUrl } from "@/server/media/library"
import {
  findMembership,
  isProjectMember,
  isSiteAdmin,
  requireTeamRunner,
  requireOpenProject,
  requireProjectAccess,
  requireProjectSettings,
  visibleProjectsWhere,
  type ProjectDb,
} from "@/server/project/access"
import { unreadInProjectChat } from "@/server/project/chat-reads"
import { visibleClients } from "@/server/project/clients"
import { listTeamLabels, type Label } from "@/server/project/labels"
import { listMilestones, type Milestone } from "@/server/project/milestones"
import { readProjectPlan, writeProjectPlan } from "@/server/project/project-plans"
import { listTeamTypes } from "@/server/project/task-types"
import { loadTemplatePlan } from "@/server/project/templates"
import type { TaskType } from "@/lib/project/task-types"
import { requireSharedProject } from "@/server/project/personal"
import { listSavedViews, projectViewScreen, type SavedView } from "@/server/project/saved-views"
import { listTaskCards, siteAdminPerson, withUnread, type TaskCard } from "@/server/project/tasks"
import { pauseTaskClock, projectClockSeconds } from "@/server/project/task-clock-runs"
import { clearAssignee, listTeamMembers } from "@/server/project/teams"
import {
  projectProjectMembers,
  projectProjectStars,
  projectProjects,
  projectTaskClockRuns,
  projectTasks,
  projectTeamMembers,
  projectTeams,
} from "@/server/project/schema"
import { listTeamNames } from "@/server/project/record-team"
import { deleteSavedViewsFor } from "@/server/saved-views"
import { customShellUsers } from "@/server/schema"

export type ProjectListRow = {
  id: string
  name: string
  color: ProjectColor
  archived: boolean
  /** Someone's "Just me" list, which only the site admin sees listed. */
  personal: boolean
  /** Pinned by me (called a star in the code). Pins are each person's own. */
  starred: boolean
  counts: Record<TaskStatus, number>
  /** The open tasks with a due date that could be late, for the status worked out in the browser. */
  dated: LateCandidate[]
  /** The project's status rule (`lib/project/project-pace.ts`). */
  slowingAt: number
  behindAt: number
  lead: { id: string; name: string; avatarUrl: string } | null
  client: string | null
  /** The project's team, shown in the site admin's Team column. */
  team: { id: string; name: string }
  /** Seconds on the clock across its tasks, for the Time column (Seven features, part 4). */
  clockSeconds: number
}

/**
 * An open task's due date and time. Whether it is late depends on the
 * reader's own clock, as the red due date does, so the browser counts them.
 */
export type LateCandidate = { dueDate: string; dueAt: string | null; status: TaskStatus }

export type ProjectsPage = {
  /** An employee's team; null until they are put on one, and always null for the site admin. */
  team: { id: string; name: string; myRole: TeamRole } | null
  /** The site admin sees every team's projects (Tyler, 19 Oct 2026). */
  siteAdmin: boolean
  /** Every team by name, for the site admin's team filter and New project; empty for anyone else. */
  teams: { id: string; name: string }[]
  /** The team the site admin's filter shows, or null for every team. */
  teamFilter: string | null
  projects: ProjectListRow[]
}

/**
 * The Projects dashboard. An employee sees their team's projects they are on;
 * the site admin sees every team's, "Just me" lists included, narrowed to one
 * team by `teamFilter` (a team that doesn't exist shows every team).
 */
export async function loadProjectsPage(
  userId: string,
  database = db,
  teamFilter: string | null = null
): Promise<ProjectsPage> {
  const siteAdmin = await isSiteAdmin(userId, database)
  const teams = siteAdmin ? await listTeamNames(database) : []
  const filter = teams.find((team) => team.id === teamFilter)?.id ?? null
  const membership = siteAdmin ? null : await findMembership(userId, database)
  if (!siteAdmin && !membership) return { team: null, siteAdmin, teams, teamFilter: null, projects: [] }

  const [team] = membership
    ? await database
        .select({ id: projectTeams.id, name: projectTeams.name })
        .from(projectTeams)
        .where(eq(projectTeams.id, membership.teamId))
        .limit(1)
    : []

  // A "Just me" list is reached from My dashboard, never listed as a project,
  // except to the site admin, who sees every one by its person's name.
  const lead = alias(customShellUsers, "lead")
  const owner = alias(customShellUsers, "owner")
  const visible = (
    await database
      .select({
        project: projectProjects,
        leadName: lead.name,
        leadAvatar: lead.avatarUrl,
        ownerName: owner.name,
        teamName: projectTeams.name,
      })
      .from(projectProjects)
      .innerJoin(projectTeams, eq(projectTeams.id, projectProjects.teamId))
      .leftJoin(lead, eq(lead.id, projectProjects.leadUserId))
      .leftJoin(owner, eq(owner.id, projectProjects.personalUserId))
      .where(
        membership
          ? and(visibleProjectsWhere(membership), isNull(projectProjects.personalUserId))
          : // A site admin's own list is on My dashboard, never on a team's Projects page.
            and(isNull(projectTeams.personalUserId), filter ? eq(projectProjects.teamId, filter) : undefined)
      )
      .orderBy(asc(projectProjects.name))
  ).map((row) => ({
    ...row.project,
    name: row.project.personalUserId ? justMeName(row.ownerName) : row.project.name,
    leadName: row.leadName,
    leadAvatar: row.leadAvatar,
    teamName: row.teamName,
  }))
  const ids = visible.map((project) => project.id)

  const statusRows = ids.length
    ? await database
        .select({
          projectId: projectTasks.projectId,
          status: projectTasks.status,
          total: count(),
        })
        .from(projectTasks)
        .where(and(inArray(projectTasks.projectId, ids), isNull(projectTasks.deletedAt)))
        .groupBy(projectTasks.projectId, projectTasks.status)
    : []
  // Open tasks due by tomorrow in UTC: no reader anywhere can count a later one late yet.
  const tomorrowUtc = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const datedRows = ids.length
    ? await database
        .select({
          projectId: projectTasks.projectId,
          dueDate: projectTasks.dueDate,
          dueAt: projectTasks.dueAt,
          status: projectTasks.status,
        })
        .from(projectTasks)
        .where(
          and(
            inArray(projectTasks.projectId, ids),
            isNull(projectTasks.deletedAt),
            notInArray(projectTasks.status, CLOSED_TASK_STATUSES),
            lte(projectTasks.dueDate, tomorrowUtc)
          )
        )
    : []
  const starred = await starredProjectIds(userId, ids, database)
  const clocked = await projectClockSeconds(ids, database)

  return {
    team: team && membership ? { ...team, myRole: membership.role } : null,
    siteAdmin,
    teams,
    teamFilter: filter,
    projects: visible.map((project) => {
      const counts: Record<TaskStatus, number> = { todo: 0, doing: 0, done: 0, stuck: 0, archived: 0 }
      for (const row of statusRows) {
        if (row.projectId === project.id) counts[row.status] = row.total
      }
      return {
        id: project.id,
        name: project.name,
        color: project.color,
        archived: Boolean(project.archivedAt),
        personal: Boolean(project.personalUserId),
        starred: starred.has(project.id),
        counts,
        dated: datedRows
          .filter((row) => row.projectId === project.id && row.dueDate)
          .map((row) => ({ dueDate: row.dueDate!, dueAt: row.dueAt?.toISOString() ?? null, status: row.status })),
        slowingAt: project.slowingAt,
        behindAt: project.behindAt,
        lead:
          project.leadUserId && project.leadName !== null
            ? { id: project.leadUserId, name: project.leadName, avatarUrl: project.leadAvatar ?? "" }
            : null,
        client: project.client,
        team: { id: project.teamId, name: project.teamName },
        clockSeconds: clocked.get(project.id) ?? 0,
      }
    }),
  }
}

const FORMER_MEMBER = "A former member"

/** How the site admin sees someone's "Just me" list: "Just me · Ben Tester". */
function justMeName(personName: string | null) {
  return `${PERSONAL_PROJECT_NAME} · ${personName ?? FORMER_MEMBER}`
}


/**
 * A new project, empty or started from one of the team's saved templates.
 * A template brings its colour and description along with its plan. Only the
 * site admin makes projects (Tyler, 16 Oct 2026: "only I create projects").
 */
export async function createProject(
  userId: string,
  input: { name: string; color: ProjectColor; description: string; templateId?: string | null },
  database = db
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    const membership = await requireTeamRunner(userId, tx)
    const plan = input.templateId ? await loadTemplatePlan(membership.teamId, input.templateId, tx) : null
    const at = now()
    const id = uuid()
    await tx.insert(projectProjects).values({
      id,
      teamId: membership.teamId,
      name: input.name,
      color: plan?.color ?? input.color,
      description: plan?.description ?? input.description,
      createdByUserId: userId,
      createdAt: at,
      updatedAt: at,
      ...(plan ? await planTypeChoices(membership.teamId, plan, tx) : {}),
    })
    // The site admin sees every project without being on any, so a new
    // project starts with nobody on it until they add people.
    if (plan) await writeProjectPlan(tx, { id, teamId: membership.teamId }, plan, userId)
    return { id }
  })
}

/** The project's own pick of types, keeping only types the team still has. */
async function planTypeChoices(
  teamId: string,
  plan: { hiddenTypeIds: string[]; defaultTypeId: string | null },
  tx: ProjectDb
) {
  const types = new Set((await listTeamTypes(teamId, tx)).map((type) => type.id))
  return {
    hiddenTypeIds: plan.hiddenTypeIds.filter((typeId) => types.has(typeId)),
    defaultTypeId: plan.defaultTypeId && types.has(plan.defaultTypeId) ? plan.defaultTypeId : null,
  }
}

export type ProjectMemberRow = {
  userId: string
  name: string
  email: string
  avatarUrl: string
  title: string | null
  openTasks: number
}

export type ProjectPage = {
  project: {
    id: string
    /** The project's team, which the page sends with its team-wide requests. */
    teamId: string
    name: string
    color: ProjectColor
    description: string
    archived: boolean
    starred: boolean
    dueDate: string | null
    /** My own "Just me" list rather than a shared project. */
    personal: boolean
    /** "Doing per person": the Board warns past it. Null warns never. */
    doingLimit: number | null
    /** The team's types this project leaves out, and the one New task starts on. */
    hiddenTypeIds: string[]
    defaultTypeId: string | null
    /** The Board's columns, in the order the project's people dragged them into. */
    statusOrder: TaskStatus[]
    /** The status rule: Slowing down from this many late tasks, Behind from `behindAt`. */
    slowingAt: number
    behindAt: number
    leadUserId: string | null
    client: string | null
    /** Everyone on the team is a member, people who join later included. */
    wholeTeam: boolean
    /** The faint banner behind the top of the left panel, and the round avatar at its foot. */
    bannerUrl: string | null
    avatarUrl: string | null
  }
  /** The project's milestones, soonest first, each with its task counts. */
  milestones: Milestone[]
  /** Client names already used on projects I can see, for the Client field. */
  teamClients: string[]
  /** The team's task types, archived ones included, for New task, the Type filter and field columns. */
  taskTypes: TaskType[]
  /** The team's labels, for the Label filter and a task's labels. */
  labels: Label[]
  myUserId: string
  myRole: TeamRole
  members: ProjectMemberRow[]
  /**
   * The site admin viewing the page, who is on no project but can take its
   * tasks (Tyler, 19 Oct 2026); null for everyone else. Offered beside the
   * members wherever a task is handed out or filtered by person.
   */
  siteAdminMe: ProjectMemberRow | null
  /** Team members who aren't on the project yet, for Add member. */
  addable: { userId: string; name: string; email: string; avatarUrl: string }[]
  tasks: TaskCard[]
  /** Messages in the project's own chat that are new to me. */
  chatUnread: number
  /** My other open projects, for moving ticked tasks. */
  otherProjects: { id: string; name: string; color: ProjectColor }[]
  /** My own saved views on this project. */
  views: SavedView[]
  /** The shell's key those views are kept under, `project:<id>`. */
  viewScreen: string
}

export async function loadProjectPage(
  userId: string,
  projectId: string,
  database = db
): Promise<ProjectPage> {
  const { membership, project } = await requireProjectAccess(userId, projectId, database)

  const memberRows = await database
    .select({
      userId: projectProjectMembers.userId,
      name: customShellUsers.name,
      email: customShellUsers.email,
      avatarUrl: customShellUsers.avatarUrl,
      title: projectTeamMembers.title,
    })
    .from(projectProjectMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectProjectMembers.userId))
    .innerJoin(
      projectTeamMembers,
      and(
        eq(projectTeamMembers.userId, projectProjectMembers.userId),
        eq(projectTeamMembers.teamId, membership.teamId)
      )
    )
    .where(eq(projectProjectMembers.projectId, projectId))
    .orderBy(asc(customShellUsers.name))

  const tasks = await withUnread(
    membership,
    await listTaskCards(eq(projectTasks.projectId, projectId), database),
    database
  )
  const memberIds = new Set(memberRows.map((row) => row.userId))
  const siteAdminMe = membership.siteAdmin ? await siteAdminPerson(userId, database) : null
  const teamMembers = await listTeamMembers(membership.teamId, database)

  return {
    project: {
      id: project.id,
      teamId: project.teamId,
      // The site admin opening someone's "Just me" list sees whose it is.
      name:
        project.personalUserId && project.personalUserId !== userId
          ? justMeName(await nameOf(project.personalUserId, database))
          : project.name,
      color: project.color,
      description: project.description,
      archived: Boolean(project.archivedAt),
      dueDate: project.dueDate,
      starred: (await starredProjectIds(userId, [project.id], database)).has(project.id),
      personal: Boolean(project.personalUserId),
      doingLimit: project.doingLimit,
      hiddenTypeIds: project.hiddenTypeIds,
      defaultTypeId: project.defaultTypeId,
      statusOrder: boardStatusOrder(project.statusOrder),
      slowingAt: project.slowingAt,
      behindAt: project.behindAt,
      leadUserId: project.leadUserId,
      client: project.client,
      wholeTeam: project.wholeTeam,
      bannerUrl: project.bannerUrl,
      avatarUrl: project.avatarUrl,
    },
    milestones: await listMilestones(project.id, database),
    teamClients: await visibleClients(membership, database),
    taskTypes: await listTeamTypes(membership.teamId, database),
    labels: await listTeamLabels(membership.teamId, database),
    views: await listSavedViews(userId, membership.teamId, project.id, database),
    viewScreen: projectViewScreen(membership.teamId, project.id),
    myUserId: userId,
    myRole: membership.role,
    siteAdminMe: siteAdminMe && {
      userId,
      name: siteAdminMe.name,
      email: "",
      avatarUrl: siteAdminMe.avatarUrl,
      title: null,
      openTasks: tasks.filter((task) => task.assignee?.id === userId && isOpenStatus(task.status)).length,
    },
    members: memberRows.map((row) => ({
      ...row,
      avatarUrl: row.avatarUrl ?? "",
      openTasks: tasks.filter(
        (task) => task.assignee?.id === row.userId && isOpenStatus(task.status)
      ).length,
    })),
    addable: teamMembers
      .filter((member) => !memberIds.has(member.userId))
      .map(({ userId: id, name, email, avatarUrl }) => ({
        userId: id,
        name,
        email,
        avatarUrl,
      })),
    tasks,
    chatUnread: project.personalUserId ? 0 : await unreadInProjectChat(membership, project.id, database),
    otherProjects: (
      await database
        .select({
          id: projectProjects.id,
          name: projectProjects.name,
          color: projectProjects.color,
          archivedAt: projectProjects.archivedAt,
          personalUserId: projectProjects.personalUserId,
        })
        .from(projectProjects)
        .where(visibleProjectsWhere(membership))
        .orderBy(asc(projectProjects.name))
    )
      .filter((other) => other.id !== project.id && !other.archivedAt && !other.personalUserId)
      .map(({ id, name, color }) => ({ id, name, color })),
  }
}

export async function updateProject(
  userId: string,
  patch: {
    projectId: string
    name?: string
    color?: ProjectColor
    description?: string
    dueDate?: string | null
    doingLimit?: number | null
    bannerUrl?: string
    avatarUrl?: string
    slowingAt?: number
    behindAt?: number
  },
  database = db
) {
  const { projectId, bannerUrl, avatarUrl, ...fields } = patch
  const { project } = await requireProjectSettings(userId, projectId, database)
  requireSharedProject(project)
  // Behind can't start before Slowing down; the two may match, and then Slowing down never shows.
  if ((fields.behindAt ?? project.behindAt) < (fields.slowingAt ?? project.slowingAt)) {
    throw new Error(PROJECT_ERRORS.behindBeforeSlowing)
  }
  // A new picture must be one the site admin uploaded to the media library,
  // as with the team's, so nobody can point a project at an outside address.
  // "" takes it away.
  for (const [url, was] of [
    [bannerUrl, project.bannerUrl],
    [avatarUrl, project.avatarUrl],
  ] as const) {
    if (url && url !== was && !(await isOwnedImageUrl(userId, url, database))) {
      throw new Error(PROJECT_ERRORS.photoNotYours)
    }
  }
  await database
    .update(projectProjects)
    .set({
      ...fields,
      ...(bannerUrl === undefined ? null : { bannerUrl: bannerUrl || null }),
      ...(avatarUrl === undefined ? null : { avatarUrl: avatarUrl || null }),
      updatedAt: now(),
    })
    .where(eq(projectProjects.id, projectId))
}

/**
 * The Board's column order, for everyone on the project. Anyone who can change
 * the project can drag it, "Just me" lists included, since it is only layout.
 */
export async function setStatusOrder(
  userId: string,
  input: { projectId: string; statusOrder: TaskStatus[] },
  database = db
) {
  await requireOpenProject(userId, input.projectId, database)
  await database
    .update(projectProjects)
    .set({ statusOrder: input.statusOrder, updatedAt: now() })
    .where(eq(projectProjects.id, input.projectId))
}

/**
 * Names one member as the project's lead, or nobody. Anyone who can change
 * the project can pick the lead, so members keep every right they had.
 */
export async function setProjectLead(
  actorId: string,
  input: { projectId: string; userId: string | null },
  database = db
) {
  const { project } = await requireProjectSettings(actorId, input.projectId, database)
  requireSharedProject(project)
  if (input.userId && !(await isProjectMember(project.id, input.userId, database))) {
    throw new Error(PROJECT_ERRORS.leadNotMember)
  }
  await database
    .update(projectProjects)
    .set({ leadUserId: input.userId, updatedAt: now() })
    .where(eq(projectProjects.id, project.id))
}

export async function setProjectClient(
  userId: string,
  input: { projectId: string; client: string | null },
  database = db
) {
  const { project } = await requireProjectSettings(userId, input.projectId, database)
  requireSharedProject(project)
  await database
    .update(projectProjects)
    .set({ client: input.client, updatedAt: now() })
    .where(eq(projectProjects.id, project.id))
}

/**
 * "Everyone on the team": while on, every teammate is a member, and people who
 * join later are added as they join. Turning it off keeps everyone on as an
 * ordinary member.
 */
export async function setWholeTeam(
  userId: string,
  input: { projectId: string; wholeTeam: boolean },
  database = db
) {
  await database.transaction(async (tx) => {
    const { membership, project } = await requireProjectSettings(userId, input.projectId, tx)
    requireSharedProject(project)
    await tx
      .update(projectProjects)
      .set({ wholeTeam: input.wholeTeam, updatedAt: now() })
      .where(eq(projectProjects.id, project.id))
    if (!input.wholeTeam) return
    const teammates = await tx
      .select({ userId: projectTeamMembers.userId })
      .from(projectTeamMembers)
      .where(eq(projectTeamMembers.teamId, membership.teamId))
    // A team can have nobody on it yet: the site admin who made it isn't.
    if (teammates.length === 0) return
    const at = now()
    await tx
      .insert(projectProjectMembers)
      .values(teammates.map((row) => ({ projectId: project.id, userId: row.userId, addedAt: at })))
      .onConflictDoNothing()
  })
}

async function nameOf(userId: string | null, database: ProjectDb) {
  if (!userId) return null
  const [row] = await database
    .select({ name: customShellUsers.name })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
    .limit(1)
  return row?.name ?? null
}

export async function setProjectArchived(
  userId: string,
  projectId: string,
  archived: boolean,
  database = db
) {
  const { project } = await requireProjectSettings(userId, projectId, database, { allowArchived: true })
  requireSharedProject(project)
  await database.transaction(async (tx) => {
    await tx
      .update(projectProjects)
      .set({ archivedAt: archived ? now() : null, updatedAt: now() })
      .where(eq(projectProjects.id, projectId))
    // Nothing in an archived project can change, its clocks included, so they stop now.
    if (archived) {
      const running = await tx
        .select({ taskId: projectTaskClockRuns.taskId })
        .from(projectTaskClockRuns)
        .innerJoin(projectTasks, eq(projectTasks.id, projectTaskClockRuns.taskId))
        .where(and(eq(projectTasks.projectId, projectId), isNull(projectTaskClockRuns.stoppedAt)))
      for (const run of running) await pauseTaskClock(tx, run.taskId, userId)
    }
  })
}

/**
 * Anyone who can see a project can add a teammate to it. That matches who can
 * change it: the project's own members, the owner and admins.
 */
export async function addProjectMember(
  actorId: string,
  projectId: string,
  userId: string,
  database = db
) {
  const { membership, project } = await requireProjectSettings(actorId, projectId, database)
  requireSharedProject(project)
  const [teammate] = await database
    .select({ userId: projectTeamMembers.userId })
    .from(projectTeamMembers)
    .where(
      and(
        eq(projectTeamMembers.teamId, membership.teamId),
        eq(projectTeamMembers.userId, userId)
      )
    )
    .limit(1)
  if (!teammate) throw new Error(PROJECT_ERRORS.personNotOnTeam)
  await database
    .insert(projectProjectMembers)
    .values({ projectId, userId, addedAt: now() })
    .onConflictDoNothing()
}

async function starredProjectIds(userId: string, projectIds: string[], database: ProjectDb) {
  if (projectIds.length === 0) return new Set<string>()
  const rows = await database
    .select({ projectId: projectProjectStars.projectId })
    .from(projectProjectStars)
    .where(
      and(
        eq(projectProjectStars.userId, userId),
        inArray(projectProjectStars.projectId, projectIds)
      )
    )
  return new Set(rows.map((row) => row.projectId))
}

/** Stars are each person's own, on any project they can see, archived or not. */
export async function setProjectStar(
  userId: string,
  input: { projectId: string; starred: boolean },
  database = db
) {
  await requireProjectAccess(userId, input.projectId, database)
  if (input.starred) {
    await database
      .insert(projectProjectStars)
      .values({ projectId: input.projectId, userId, createdAt: now() })
      .onConflictDoNothing()
    return
  }
  await database
    .delete(projectProjectStars)
    .where(
      and(
        eq(projectProjectStars.projectId, input.projectId),
        eq(projectProjectStars.userId, userId)
      )
    )
}

/**
 * Their tasks in this project stay, with nobody assigned and their name kept.
 * Their star on it goes, since leaving a project takes it off their list.
 */
export async function removeProjectMember(
  actorId: string,
  projectId: string,
  userId: string,
  database = db
) {
  await database.transaction(async (tx) => {
    const { project } = await requireProjectSettings(actorId, projectId, tx)
    requireSharedProject(project)
    // Nobody leaves a project that includes everyone; the switch goes off first.
    if (project.wholeTeam) throw new Error(PROJECT_ERRORS.wholeTeamProject)
    await clearAssignee(userId, eq(projectTasks.projectId, projectId), tx)
    // A lead who leaves leaves the project with no lead.
    if (project.leadUserId === userId) {
      await tx.update(projectProjects).set({ leadUserId: null }).where(eq(projectProjects.id, projectId))
    }
    await tx
      .delete(projectProjectStars)
      .where(
        and(eq(projectProjectStars.projectId, projectId), eq(projectProjectStars.userId, userId))
      )
    // The shell's table can't cascade from a project membership, so the views go here.
    await deleteSavedViewsFor({ userId, screens: [projectViewScreen(project.teamId, projectId)] }, tx)
    await tx
      .delete(projectProjectMembers)
      .where(
        and(
          eq(projectProjectMembers.projectId, projectId),
          eq(projectProjectMembers.userId, userId)
        )
      )
  })
}

/**
 * A new project made from an old one, for teams that do the same kind of job
 * again and again: its description, colour, milestones (without
 * their dates) and every task not in the bin, in the same order, with their
 * labels, steps (unticked), types, field values and priority, and the
 * project's own pick of types. The rules are in `project-plans.ts`. The
 * person copying is the new project's only member.
 */
export async function copyProject(
  userId: string,
  input: { projectId: string; name: string },
  database = db
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    // A copy is a new project, which only the site admin makes.
    const { membership, project: source } = await requireProjectSettings(userId, input.projectId, tx, {
      allowArchived: true,
    })
    requireSharedProject(source)
    const plan = await readProjectPlan(tx, source)
    const at = now()
    const id = uuid()
    await tx.insert(projectProjects).values({
      id,
      teamId: membership.teamId,
      name: input.name,
      color: plan.color,
      description: plan.description,
      createdByUserId: userId,
      createdAt: at,
      updatedAt: at,
      hiddenTypeIds: plan.hiddenTypeIds,
      defaultTypeId: plan.defaultTypeId,
    })
    await writeProjectPlan(tx, { id, teamId: membership.teamId }, plan, userId)
    return { id }
  })
}
