import { and, asc, count, eq, inArray, isNull } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import {
  type ProjectColor,
  type TaskStatus,
  type TeamRole,
} from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  findMembership,
  requireMembership,
  requireOpenProject,
  requireProjectAccess,
  visibleProjectsWhere,
  type ProjectDb,
} from "@/server/project/access"
import { listTeamLabels, type Label } from "@/server/project/labels"
import { copyFieldValues, listTeamTypes } from "@/server/project/task-types"
import type { TaskType } from "@/lib/project/task-types"
import { requireSharedProject } from "@/server/project/personal"
import { listSections, type Section } from "@/server/project/sections"
import { listTaskCards, type TaskCard } from "@/server/project/tasks"
import { clearAssignee, listTeamMembers } from "@/server/project/teams"
import {
  projectProjectMembers,
  projectProjectStars,
  projectProjects,
  projectSections,
  projectTaskLabels,
  projectTaskSteps,
  projectTasks,
  projectTeamMembers,
  projectTeams,
} from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

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
  const visible = await database
    .select()
    .from(projectProjects)
    .where(and(visibleProjectsWhere(membership), isNull(projectProjects.personalUserId)))
    .orderBy(asc(projectProjects.name))
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
      }
    }),
  }
}

export async function createProject(
  userId: string,
  input: { name: string; color: ProjectColor; description: string },
  database = db
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    const membership = await requireMembership(userId, tx)
    const at = now()
    const id = uuid()
    await tx.insert(projectProjects).values({
      id,
      teamId: membership.teamId,
      name: input.name,
      color: input.color,
      description: input.description,
      createdByUserId: userId,
      createdAt: at,
      updatedAt: at,
    })
    // Whoever creates a project is its first member.
    await tx.insert(projectProjectMembers).values({ projectId: id, userId, addedAt: at })
    return { id }
  })
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
  }
  sections: Section[]
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
  /** My other open projects, for moving ticked tasks. */
  otherProjects: { id: string; name: string; color: ProjectColor }[]
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

  const tasks = await listTaskCards(eq(projectTasks.projectId, projectId), database)
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
    },
    sections: await listSections(project.id, database),
    taskTypes: await listTeamTypes(membership.teamId, database),
    labels: await listTeamLabels(membership.teamId, database),
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
    await clearAssignee(userId, eq(projectTasks.projectId, projectId), tx)
    await tx
      .delete(projectProjectStars)
      .where(
        and(eq(projectProjectStars.projectId, projectId), eq(projectProjectStars.userId, userId))
      )
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
 * again and again: its description, colour, sections, and every task not in
 * the bin, in the same order, with their labels, steps (unticked), types and
 * field values, and the project's own pick of types. Every task starts To do
 * with nobody assigned and no due date (Tyler's choice), and a Person field
 * keeps only the person copying, the copy's one member.
 * People, chat, files and history stay with the original. The person copying
 * is the new project's only member.
 */
export async function copyProject(
  userId: string,
  input: { projectId: string; name: string },
  database = db
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    const { membership, project: source } = await requireProjectAccess(userId, input.projectId, tx)
    requireSharedProject(source)
    const at = now()
    const id = uuid()
    await tx.insert(projectProjects).values({
      id,
      teamId: membership.teamId,
      name: input.name,
      color: source.color,
      description: source.description,
      createdByUserId: userId,
      createdAt: at,
      updatedAt: at,
      hiddenTypeIds: source.hiddenTypeIds,
      defaultTypeId: source.defaultTypeId,
    })
    await tx.insert(projectProjectMembers).values({ projectId: id, userId, addedAt: at })

    const sections = await tx
      .select()
      .from(projectSections)
      .where(eq(projectSections.projectId, source.id))
    const sectionIds = new Map(sections.map((section) => [section.id, uuid()]))
    if (sections.length) {
      await tx.insert(projectSections).values(
        sections.map((section) => ({
          id: sectionIds.get(section.id)!,
          projectId: id,
          name: section.name,
          position: section.position,
          createdAt: at,
        }))
      )
    }

    const tasks = await tx
      .select()
      .from(projectTasks)
      .where(and(eq(projectTasks.projectId, source.id), isNull(projectTasks.deletedAt)))
      .orderBy(asc(projectTasks.position), asc(projectTasks.createdAt))
    const taskIds = new Map(tasks.map((task) => [task.id, uuid()]))
    if (tasks.length) {
      await tx.insert(projectTasks).values(
        tasks.map((task, index) => ({
          id: taskIds.get(task.id)!,
          projectId: id,
          title: task.title,
          notes: task.notes,
          status: "todo" as const,
          sectionId: task.sectionId ? (sectionIds.get(task.sectionId) ?? null) : null,
          position: index + 1,
          createdByUserId: userId,
          createdAt: at,
          updatedAt: at,
          typeId: task.typeId,
        }))
      )
      await copyFieldValues(
        tx,
        tasks.map((task) => ({ from: task.id, to: taskIds.get(task.id)! })),
        userId,
        (personId) => personId === userId
      )
      const oldIds = tasks.map((task) => task.id)
      const steps = await tx
        .select()
        .from(projectTaskSteps)
        .where(inArray(projectTaskSteps.taskId, oldIds))
      if (steps.length) {
        await tx.insert(projectTaskSteps).values(
          steps.map((step) => ({
            id: uuid(),
            taskId: taskIds.get(step.taskId)!,
            text: step.text,
            done: false,
            position: step.position,
            createdAt: at,
          }))
        )
      }
      const labels = await tx
        .select()
        .from(projectTaskLabels)
        .where(inArray(projectTaskLabels.taskId, oldIds))
      if (labels.length) {
        await tx.insert(projectTaskLabels).values(
          labels.map((label) => ({ taskId: taskIds.get(label.taskId)!, labelId: label.labelId }))
        )
      }
    }
    return { id }
  })
}
