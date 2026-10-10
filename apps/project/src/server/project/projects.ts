import { and, asc, count, eq, inArray } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import {
  runsTheTeam,
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
  type Membership,
} from "@/server/project/access"
import { listTaskCards, type TaskCard } from "@/server/project/tasks"
import { clearAssignee, listTeamMembers } from "@/server/project/teams"
import {
  projectProjectMembers,
  projectProjects,
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

  const visible = await database
    .select()
    .from(projectProjects)
    .where(visibleProjectsWhere(membership, database))
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
        .where(inArray(projectTasks.projectId, ids))
        .groupBy(projectTasks.projectId, projectTasks.status)
    : []
  const memberRows = ids.length
    ? await database
        .select({ projectId: projectProjectMembers.projectId, total: count() })
        .from(projectProjectMembers)
        .where(inArray(projectProjectMembers.projectId, ids))
        .groupBy(projectProjectMembers.projectId)
    : []

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
        memberCount: memberRows.find((row) => row.projectId === project.id)?.total ?? 0,
        counts,
      }
    }),
  }
}

/** Owner and admins see the whole team's projects; everyone else, their own. */
function visibleProjectsWhere(membership: Membership, database: typeof db) {
  const inTeam = eq(projectProjects.teamId, membership.teamId)
  if (runsTheTeam(membership.role)) return inTeam
  return and(
    inTeam,
    inArray(
      projectProjects.id,
      database
        .select({ id: projectProjectMembers.projectId })
        .from(projectProjectMembers)
        .where(eq(projectProjectMembers.userId, membership.userId))
    )
  )
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
  openTasks: number
}

export type ProjectPage = {
  project: {
    id: string
    name: string
    color: ProjectColor
    description: string
    archived: boolean
  }
  myUserId: string
  myRole: TeamRole
  members: ProjectMemberRow[]
  /** Team members who aren't on the project yet, for Add member. */
  addable: { userId: string; name: string; email: string; avatarUrl: string }[]
  tasks: TaskCard[]
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
    },
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
  }
}

export async function updateProject(
  userId: string,
  patch: {
    projectId: string
    name?: string
    color?: ProjectColor
    description?: string
  },
  database = db
) {
  const { projectId, ...fields } = patch
  await requireOpenProject(userId, projectId, database)
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
  await requireProjectAccess(userId, projectId, database)
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
  const { membership } = await requireOpenProject(actorId, projectId, database)
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

/** Their tasks in this project stay, with nobody assigned and their name kept. */
export async function removeProjectMember(
  actorId: string,
  projectId: string,
  userId: string,
  database = db
) {
  await database.transaction(async (tx) => {
    await requireOpenProject(actorId, projectId, tx)
    await clearAssignee(userId, eq(projectTasks.projectId, projectId), tx)
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
