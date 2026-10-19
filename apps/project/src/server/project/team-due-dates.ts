import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm"

import type { ProjectColor, TaskStatus } from "@/lib/project/rules"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireMembership, visibleProjectIds, type Membership, type ProjectDb } from "@/server/project/access"
import {
  projectMilestones,
  projectProjects,
  projectSiteAdminTeams,
  projectTasks,
  projectTeamMembers,
} from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

/**
 * The Team calendar's "Due dates" switch: each person's own, off to begin
 * with and kept on the server. On, the calendar adds each day's due tasks
 * from the shared projects that person can see. Done tasks, the bin,
 * archived projects and "Just me" lists are left out, so it shows the work
 * still to land. See `workspace/docs/meetings.md`, "Due dates on the calendar".
 */

export type TeamDueTask = {
  id: string
  title: string
  dueDate: string
  status: TaskStatus
  projectName: string
  projectColor: ProjectColor
  projectClient: string | null
  assigneeName: string | null
}

/** A milestone, or a whole project, due on a day. */
export type TeamDeadline = {
  /** The milestone's id, or the project's for its own due date. */
  id: string
  kind: "milestone" | "project"
  /** The milestone's name, or the project's. */
  name: string
  dueDate: string
  projectId: string
  projectName: string
  projectColor: ProjectColor
  projectClient: string | null
}

export type TeamDueDates = {
  on: boolean
  /** Every due task in the month's grid, by due date then project; empty while the switch is off. */
  tasks: TeamDueTask[]
  /**
   * Milestones not yet reached and projects due in the grid, drawn apart
   * from the tasks (Features 16 Oct, part 2). Empty while the switch is off.
   */
  deadlines: TeamDeadline[]
}

export async function loadTeamDueDates(
  membership: Membership,
  first: string,
  last: string,
  database: ProjectDb = db
): Promise<TeamDueDates> {
  const [me] = membership.siteAdmin
    ? await database
        .select({ on: projectSiteAdminTeams.calendarDueDates })
        .from(projectSiteAdminTeams)
        .where(eq(projectSiteAdminTeams.userId, membership.userId))
        .limit(1)
    : await database
        .select({ on: projectTeamMembers.calendarDueDates })
        .from(projectTeamMembers)
        .where(and(eq(projectTeamMembers.teamId, membership.teamId), eq(projectTeamMembers.userId, membership.userId)))
        .limit(1)
  if (!me?.on) return { on: false, tasks: [], deadlines: [] }
  const visible = [...(await visibleProjectIds(membership, database))]
  if (visible.length === 0) return { on: true, tasks: [], deadlines: [] }
  const rows = await database
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      dueDate: projectTasks.dueDate,
      status: projectTasks.status,
      projectName: projectProjects.name,
      projectColor: projectProjects.color,
      projectClient: projectProjects.client,
      assigneeName: customShellUsers.name,
    })
    .from(projectTasks)
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .leftJoin(customShellUsers, eq(customShellUsers.id, projectTasks.assigneeUserId))
    .where(
      and(
        inArray(projectTasks.projectId, visible),
        isNull(projectProjects.personalUserId),
        isNull(projectProjects.archivedAt),
        isNull(projectTasks.deletedAt),
        ne(projectTasks.status, "done"),
        gte(projectTasks.dueDate, first),
        lte(projectTasks.dueDate, last)
      )
    )
    .orderBy(asc(projectTasks.dueDate), asc(projectProjects.name), asc(projectTasks.position))
  return {
    on: true,
    tasks: rows.flatMap((row) => (row.dueDate ? [{ ...row, dueDate: row.dueDate }] : [])),
    deadlines: await loadDeadlines(visible, first, last, database),
  }
}

async function loadDeadlines(visible: string[], first: string, last: string, database: ProjectDb) {
  const shared = and(
    inArray(projectProjects.id, visible),
    isNull(projectProjects.personalUserId),
    isNull(projectProjects.archivedAt)
  )
  const project = {
    projectId: projectProjects.id,
    projectName: projectProjects.name,
    projectColor: projectProjects.color,
    projectClient: projectProjects.client,
  }
  // Reached, so no longer a deadline: it has tasks, and none is still open.
  const reached = sql<boolean>`(
    exists (select 1 from ${projectTasks} t where t.milestone_id = ${projectMilestones.id} and t.deleted_at is null)
    and not exists (
      select 1 from ${projectTasks} t
      where t.milestone_id = ${projectMilestones.id} and t.deleted_at is null and t.status <> 'done'
    )
  )`
  const milestones = await database
    .select({ id: projectMilestones.id, name: projectMilestones.name, dueDate: projectMilestones.dueDate, ...project })
    .from(projectMilestones)
    .innerJoin(projectProjects, eq(projectProjects.id, projectMilestones.projectId))
    .where(and(shared, gte(projectMilestones.dueDate, first), lte(projectMilestones.dueDate, last), sql`not ${reached}`))
  const projects = await database
    .select({ id: projectProjects.id, name: projectProjects.name, dueDate: projectProjects.dueDate, ...project })
    .from(projectProjects)
    .where(and(shared, gte(projectProjects.dueDate, first), lte(projectProjects.dueDate, last)))
  const deadlines: TeamDeadline[] = [
    ...projects.map((row) => ({ ...row, kind: "project" as const, dueDate: row.dueDate! })),
    ...milestones.map((row) => ({ ...row, kind: "milestone" as const, dueDate: row.dueDate! })),
  ]
  return deadlines.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.projectName.localeCompare(b.projectName))
}

/** Turns my own "Due dates" switch on the Team calendar on or off. */
export async function setCalendarDueDates(userId: string, on: boolean, database = db) {
  const membership = await requireMembership(userId, database)
  if (membership.siteAdmin) {
    // The site admin's own row holds the switch. Its team_id is written but
    // no longer read: the page names its team (Tyler, 19 Oct 2026).
    await database
      .insert(projectSiteAdminTeams)
      .values({ userId, teamId: membership.teamId, calendarDueDates: on, updatedAt: now() })
      .onConflictDoUpdate({ target: projectSiteAdminTeams.userId, set: { calendarDueDates: on } })
    return
  }
  await database
    .update(projectTeamMembers)
    .set({ calendarDueDates: on })
    .where(and(eq(projectTeamMembers.teamId, membership.teamId), eq(projectTeamMembers.userId, userId)))
}
