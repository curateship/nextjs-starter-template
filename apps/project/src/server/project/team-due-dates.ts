import { and, asc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm"

import type { ProjectColor, TaskStatus } from "@/lib/project/rules"
import { db } from "@/server/db"
import { requireMembership, visibleProjectIds, type Membership, type ProjectDb } from "@/server/project/access"
import { projectProjects, projectTasks, projectTeamMembers } from "@/server/project/schema"
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
  assigneeName: string | null
}

export type TeamDueDates = {
  on: boolean
  /** Every due task in the month's grid, by due date then project; empty while the switch is off. */
  tasks: TeamDueTask[]
}

export async function loadTeamDueDates(
  membership: Membership,
  first: string,
  last: string,
  database: ProjectDb = db
): Promise<TeamDueDates> {
  const [me] = await database
    .select({ on: projectTeamMembers.calendarDueDates })
    .from(projectTeamMembers)
    .where(and(eq(projectTeamMembers.teamId, membership.teamId), eq(projectTeamMembers.userId, membership.userId)))
    .limit(1)
  if (!me?.on) return { on: false, tasks: [] }
  const visible = [...(await visibleProjectIds(membership, database))]
  if (visible.length === 0) return { on: true, tasks: [] }
  const rows = await database
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      dueDate: projectTasks.dueDate,
      status: projectTasks.status,
      projectName: projectProjects.name,
      projectColor: projectProjects.color,
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
  }
}

/** Turns my own "Due dates" switch on the Team calendar on or off. */
export async function setCalendarDueDates(userId: string, on: boolean, database = db) {
  const membership = await requireMembership(userId, database)
  await database
    .update(projectTeamMembers)
    .set({ calendarDueDates: on })
    .where(and(eq(projectTeamMembers.teamId, membership.teamId), eq(projectTeamMembers.userId, userId)))
}
