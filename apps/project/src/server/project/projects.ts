import { and, asc, count, eq, gt, inArray, isNull, ne } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { projectHealthHeading, projectHref } from "@/lib/project/notices"
import {
  PROJECT_HEALTH_LABEL,
  boardStatusOrder,
  runsTheTeam,
  type ProjectColor,
  type ProjectHealth,
  type TaskStatus,
  type TeamRole,
} from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  findMembership,
  isProjectMember,
  requireMembership,
  requireOpenProject,
  requireProjectAccess,
  visibleProjectsWhere,
  type ProjectDb,
  type ProjectRow,
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
import { listSavedViews, type SavedView } from "@/server/project/saved-views"
import { writeAppNotices } from "@/server/project/notices"
import { listSections, type Section } from "@/server/project/sections"
import { listTaskCards, withUnread, type TaskCard } from "@/server/project/tasks"
import { clearAssignee, listTeamMembers } from "@/server/project/teams"
import {
  projectNoticeLinks,
  projectProjectEvents,
  projectProjectMembers,
  projectProjectStars,
  projectSavedViews,
  projectProjects,
  projectTasks,
  projectTeamMembers,
  projectTeams,
} from "@/server/project/schema"
import { customShellNotifications, customShellUsers } from "@/server/schema"

export type ProjectListRow = {
  id: string
  name: string
  color: ProjectColor
  archived: boolean
  dueDate: string | null
  /** Starred by me. Stars are each person's own. */
  starred: boolean
  memberCount: number
  counts: Record<TaskStatus, number>
  health: ProjectHealthView | null
  lead: { id: string; name: string; avatarUrl: string } | null
  client: string | null
}

/** "At risk: Client hasn't sent the photos", set by Priya at that moment. */
export type ProjectHealthView = {
  value: ProjectHealth
  note: string
  byName: string
  at: string
}

export type ProjectsPage = {
  /** Null until the person creates a team or accepts an invite. */
  team: { id: string; name: string; myRole: TeamRole } | null
  projects: ProjectListRow[]
}

export async function loadProjectsPage(
  userId: string,
  database = db
): Promise<ProjectsPage> {
  const membership = await findMembership(userId, database)
  if (!membership) return { team: null, projects: [] }

  const [team] = await database
    .select({ id: projectTeams.id, name: projectTeams.name })
    .from(projectTeams)
    .where(eq(projectTeams.id, membership.teamId))
    .limit(1)

  // A "Just me" list is reached from My dashboard, never listed as a project.
  const lead = alias(customShellUsers, "lead")
  const setter = alias(customShellUsers, "setter")
  const visible = (
    await database
      .select({
        project: projectProjects,
        leadName: lead.name,
        leadAvatar: lead.avatarUrl,
        setterName: setter.name,
      })
      .from(projectProjects)
      .leftJoin(lead, eq(lead.id, projectProjects.leadUserId))
      .leftJoin(setter, eq(setter.id, projectProjects.healthByUserId))
      .where(and(visibleProjectsWhere(membership), isNull(projectProjects.personalUserId)))
      .orderBy(asc(projectProjects.name))
  ).map((row) => ({ ...row.project, leadName: row.leadName, leadAvatar: row.leadAvatar, setterName: row.setterName }))
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
  const memberRows = ids.length
    ? await database
        .select({ projectId: projectProjectMembers.projectId, total: count() })
        .from(projectProjectMembers)
        .where(inArray(projectProjectMembers.projectId, ids))
        .groupBy(projectProjectMembers.projectId)
    : []
  const starred = await starredProjectIds(userId, ids, database)

  return {
    team: team ? { ...team, myRole: membership.role } : null,
    projects: visible.map((project) => {
      const counts: Record<TaskStatus, number> = { todo: 0, doing: 0, done: 0, stuck: 0 }
      for (const row of statusRows) {
        if (row.projectId === project.id) counts[row.status] = row.total
      }
      return {
        id: project.id,
        name: project.name,
        color: project.color,
        archived: Boolean(project.archivedAt),
        dueDate: project.dueDate,
        starred: starred.has(project.id),
        memberCount: memberRows.find((row) => row.projectId === project.id)?.total ?? 0,
        counts,
        health: healthView(project, project.setterName),
        lead:
          project.leadUserId && project.leadName !== null
            ? { id: project.leadUserId, name: project.leadName, avatarUrl: project.leadAvatar ?? "" }
            : null,
        client: project.client,
      }
    }),
  }
}

const FORMER_MEMBER = "A former member"

function healthView(
  project: Pick<ProjectRow, "health" | "healthNote" | "healthAt">,
  setterName: string | null
): ProjectHealthView | null {
  if (!project.health || !project.healthAt) return null
  return {
    value: project.health,
    note: project.healthNote ?? "",
    byName: setterName ?? FORMER_MEMBER,
    at: project.healthAt.toISOString(),
  }
}

/**
 * A new project, empty or started from one of the team's saved templates.
 * A template brings its colour and description along with its plan.
 */
export async function createProject(
  userId: string,
  input: { name: string; color: ProjectColor; description: string; templateId?: string | null },
  database = db
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    const membership = await requireMembership(userId, tx)
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
    // Whoever creates a project is its first member.
    await tx.insert(projectProjectMembers).values({ projectId: id, userId, addedAt: at })
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
  role: TeamRole
  title: string | null
  openTasks: number
}

export type ProjectPage = {
  project: {
    id: string
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
    health: ProjectHealthView | null
    leadUserId: string | null
    client: string | null
    /** Everyone on the team is a member, people who join later included. */
    wholeTeam: boolean
    /** I may change the status: the lead, the owner and admins, or anyone on it when it has no lead. */
    canSetHealth: boolean
  }
  sections: Section[]
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
  /** Team members who aren't on the project yet, for Add member. */
  addable: { userId: string; name: string; email: string; avatarUrl: string }[]
  tasks: TaskCard[]
  /** Messages in the project's own chat that are new to me. */
  chatUnread: number
  /** My other open projects, for moving ticked tasks. */
  otherProjects: { id: string; name: string; color: ProjectColor }[]
  /** My own saved views on this project. */
  views: SavedView[]
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
      role: projectTeamMembers.role,
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
  const teamMembers = await listTeamMembers(membership.teamId, database)

  return {
    project: {
      id: project.id,
      name: project.name,
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
      health: healthView(project, await nameOf(project.healthByUserId, database)),
      leadUserId: project.leadUserId,
      client: project.client,
      wholeTeam: project.wholeTeam,
      canSetHealth: canSetHealth(project, membership.role, userId),
    },
    sections: await listSections(project.id, database),
    milestones: await listMilestones(project.id, database),
    teamClients: await visibleClients(membership, database),
    taskTypes: await listTeamTypes(membership.teamId, database),
    labels: await listTeamLabels(membership.teamId, database),
    views: await listSavedViews(userId, membership.teamId, project.id, database),
    myUserId: userId,
    myRole: membership.role,
    members: memberRows.map((row) => ({
      ...row,
      avatarUrl: row.avatarUrl ?? "",
      openTasks: tasks.filter(
        (task) => task.assignee?.id === row.userId && task.status !== "done"
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
  },
  database = db
) {
  const { projectId, ...fields } = patch
  const { project } = await requireOpenProject(userId, projectId, database)
  requireSharedProject(project)
  await database
    .update(projectProjects)
    .set({ ...fields, updatedAt: now() })
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

/** The lead, the owner and admins set the status; with no lead, anyone on the project can. */
export function canSetHealth(
  project: Pick<ProjectRow, "leadUserId" | "personalUserId">,
  role: TeamRole,
  userId: string
) {
  if (project.personalUserId) return false
  return !project.leadUserId || project.leadUserId === userId || runsTheTeam(role)
}

/**
 * On track, At risk or Off track, with one line of why, or null to take the
 * status off. At risk and Off track need the line. Each change is a line on
 * the project's Activity tab.
 */
export async function setProjectHealth(
  userId: string,
  input: { projectId: string; health: ProjectHealth | null; note: string },
  database = db
) {
  if ((input.health === "at_risk" || input.health === "off_track") && !input.note) {
    throw new Error(PROJECT_ERRORS.healthNeedsNote)
  }
  await database.transaction(async (tx) => {
    const { membership, project } = await requireOpenProject(userId, input.projectId, tx)
    requireSharedProject(project)
    if (!canSetHealth(project, membership.role, userId)) throw new Error(PROJECT_ERRORS.onlyLeadSetsHealth)
    const at = now()
    const note = input.health ? input.note || null : null
    const from = project.health
    await tx
      .update(projectProjects)
      .set({
        health: input.health,
        healthNote: note,
        healthByUserId: input.health ? userId : null,
        healthAt: input.health ? at : null,
        updatedAt: at,
      })
      .where(eq(projectProjects.id, project.id))
    await tx.insert(projectProjectEvents).values({
      id: uuid(),
      projectId: project.id,
      kind: "health_set",
      actorUserId: userId,
      health: input.health,
      note,
      createdAt: at,
    })
    if (healthNeedsTelling(from, input.health)) {
      await tellProjectAboutHealth(tx, project, userId, { from, to: input.health, note })
    }
  })
}

const TROUBLE: readonly (ProjectHealth | null)[] = ["at_risk", "off_track"]

/**
 * Going into trouble is news, and so is coming out of it (Tyler, 16 Oct
 * 2026). Saying the same status again, or On track from no status, is not.
 */
function healthNeedsTelling(from: ProjectHealth | null, to: ProjectHealth | null) {
  if (from === to) return false
  return TROUBLE.includes(to) || TROUBLE.includes(from)
}

/** One bell row per project per hour for each person, holding the latest status. */
const HEALTH_NOTICE_WINDOW_MS = 60 * 60 * 1000

/**
 * Tells everyone on the project except whoever changed it. A project's
 * status changed again within the hour replaces the earlier row rather than
 * adding one, so a status set and unset by mistake never stacks up in the
 * bell.
 */
async function tellProjectAboutHealth(
  tx: ProjectDb,
  project: ProjectRow,
  actorId: string,
  change: { from: ProjectHealth | null; to: ProjectHealth | null; note: string | null }
) {
  const members = await tx
    .select({ userId: projectProjectMembers.userId })
    .from(projectProjectMembers)
    .where(and(eq(projectProjectMembers.projectId, project.id), ne(projectProjectMembers.userId, actorId)))
  if (members.length === 0) return
  const recipients = members.map((row) => row.userId)
  const href = projectHref(project.id)
  const earlier = await tx
    .select({ id: projectNoticeLinks.noticeId })
    .from(projectNoticeLinks)
    .innerJoin(customShellNotifications, eq(customShellNotifications.id, projectNoticeLinks.noticeId))
    .where(
      and(
        eq(projectNoticeLinks.kind, "project_health"),
        eq(projectNoticeLinks.href, href),
        inArray(customShellNotifications.recipientUserId, recipients),
        gt(customShellNotifications.createdAt, new Date(Date.now() - HEALTH_NOTICE_WINDOW_MS))
      )
    )
  if (earlier.length) {
    await tx.delete(customShellNotifications).where(inArray(customShellNotifications.id, earlier.map((row) => row.id)))
  }
  const [actor] = await tx
    .select({ name: customShellUsers.name })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, actorId))
  const label = change.to ? PROJECT_HEALTH_LABEL[change.to] : null
  const was = change.from ? `Was ${PROJECT_HEALTH_LABEL[change.from]}.` : null
  await writeAppNotices(
    tx,
    recipients.map((recipientUserId) => ({
      kind: "project_health" as const,
      recipientUserId,
      actorUserId: actorId,
      message: projectHealthHeading(actor?.name ?? "Someone", label),
      detail: [project.name, change.note ?? was].filter(Boolean).join(": "),
      href,
    }))
  )
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
  const { project } = await requireOpenProject(actorId, input.projectId, database)
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
  const { project } = await requireOpenProject(userId, input.projectId, database)
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
    const { membership, project } = await requireOpenProject(userId, input.projectId, tx)
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
  const { project } = await requireProjectAccess(userId, projectId, database)
  requireSharedProject(project)
  await database
    .update(projectProjects)
    .set({ archivedAt: archived ? now() : null, updatedAt: now() })
    .where(eq(projectProjects.id, projectId))
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
  const { membership, project } = await requireOpenProject(actorId, projectId, database)
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
    const { project } = await requireOpenProject(actorId, projectId, tx)
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
    await tx
      .delete(projectSavedViews)
      .where(and(eq(projectSavedViews.projectId, projectId), eq(projectSavedViews.userId, userId)))
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
 * again and again: its description, colour, sections, milestones (without
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
    const { membership, project: source } = await requireProjectAccess(userId, input.projectId, tx)
    requireSharedProject(source)
    const plan = await readProjectPlan(tx, source, userId)
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
    await tx.insert(projectProjectMembers).values({ projectId: id, userId, addedAt: at })
    await writeProjectPlan(tx, { id, teamId: membership.teamId }, plan, userId)
    return { id }
  })
}
