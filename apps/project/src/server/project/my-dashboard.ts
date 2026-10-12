import { eq } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { TeamRole } from "@/lib/project/rules"
import { db } from "@/server/db"
import { requireMembership } from "@/server/project/access"
import { loadCheckinPage, type CheckinPage } from "@/server/project/checkins"
import { listTeamLabels, type Label } from "@/server/project/labels"
import { listTeamTypes } from "@/server/project/task-types"
import type { TaskType } from "@/lib/project/task-types"
import { loadCheckinRecord, type CheckinRecord } from "@/server/project/time-off"
import { projectTeamMembers, projectTeams } from "@/server/project/schema"
import { loadMyWork, type TaskCard } from "@/server/project/tasks"
import { customShellUsers } from "@/server/schema"

/**
 * My dashboard: who I am on the team, my tasks, and today's check-in. The
 * check-in is a window opened from here, so its page of data comes along.
 */

export type MyDashboard = {
  me: {
    id: string
    name: string
    email: string
    avatarUrl: string
    role: TeamRole
    joinedAt: string
    teamName: string
    /** My job title, which I set here. */
    title: string | null
  }
  tasks: TaskCard[]
  checkin: CheckinPage
  /** The team's labels, for the Label filter. */
  labels: Label[]
  /** The team's task types, for the Type filter. */
  taskTypes: TaskType[]
  /** "On time 18 of the last 20 work days": mine alone, never shown to anyone else. */
  record: CheckinRecord
}

export async function loadMyDashboard(userId: string, database = db): Promise<MyDashboard> {
  const membership = await requireMembership(userId, database)
  const [row] = await database
    .select({
      name: customShellUsers.name,
      email: customShellUsers.email,
      avatarUrl: customShellUsers.avatarUrl,
      role: projectTeamMembers.role,
      joinedAt: projectTeamMembers.joinedAt,
      teamName: projectTeams.name,
      title: projectTeamMembers.title,
    })
    .from(projectTeamMembers)
    .innerJoin(projectTeams, eq(projectTeams.id, projectTeamMembers.teamId))
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
    .where(eq(projectTeamMembers.userId, userId))
    .limit(1)
  if (!row) throw new Error(PROJECT_ERRORS.noTeam)
  return {
    me: {
      id: userId,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatarUrl ?? "",
      role: row.role,
      joinedAt: row.joinedAt.toISOString(),
      teamName: row.teamName,
      title: row.title,
    },
    tasks: await loadMyWork(userId, database),
    checkin: await loadCheckinPage(userId, database),
    labels: await listTeamLabels(membership.teamId, database),
    taskTypes: await listTeamTypes(membership.teamId, database),
    record: await loadCheckinRecord(userId, database),
  }
}
