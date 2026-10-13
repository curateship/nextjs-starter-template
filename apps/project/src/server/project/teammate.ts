import { and, eq, inArray, isNull, ne } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { TeamRole } from "@/lib/project/rules"
import { db } from "@/server/db"
import { requireMembership, visibleProjectIds } from "@/server/project/access"
import { loadClock, personDay } from "@/server/project/checkins"
import { projectProjects, projectTasks, projectTeamMembers } from "@/server/project/schema"
import { listTaskCards, type TaskCard } from "@/server/project/tasks"
import { listTeamMembers, type TeamMemberRow } from "@/server/project/teams"
import { upcomingTimeOff, type TimeOff } from "@/server/project/time-off"

/**
 * A teammate's page, opened from their name on the Team dashboard or the
 * Members page: what they have open and when they are away. It shows only
 * what the app already shows elsewhere, so it never becomes a way to watch
 * someone. Their tasks come only from shared projects the viewer can see, and
 * their check-in record stays theirs alone (Tyler, 13 Oct 2026).
 */
export type Teammate = {
  /** Their open tasks, soonest due first and undated last. */
  openTasks: TaskCard[]
  /** Time off that hasn't ended yet, first to last day. */
  timeOff: TimeOff[]
}

export async function loadTeammate(viewerId: string, userId: string, database = db): Promise<Teammate> {
  const membership = await requireMembership(viewerId, database)
  const [teammate] = await database
    .select({ userId: projectTeamMembers.userId })
    .from(projectTeamMembers)
    .where(and(eq(projectTeamMembers.teamId, membership.teamId), eq(projectTeamMembers.userId, userId)))
    .limit(1)
  if (!teammate) throw new Error(PROJECT_ERRORS.personNotOnTeam)

  const visible = [...(await visibleProjectIds(membership, database))]
  const openTasks = visible.length
    ? await listTaskCards(
        and(
          eq(projectTasks.assigneeUserId, userId),
          inArray(projectTasks.projectId, visible),
          isNull(projectProjects.personalUserId),
          isNull(projectProjects.archivedAt),
          ne(projectTasks.status, "done")
        ),
        database
      )
    : []
  const { clock } = await loadClock(userId, database)
  return {
    openTasks: openTasks.sort((a, b) =>
      a.dueDate === b.dueDate ? 0 : a.dueDate === null ? 1 : b.dueDate === null ? -1 : a.dueDate < b.dueDate ? -1 : 1
    ),
    timeOff: await upcomingTimeOff(userId, personDay(clock, new Date()).day, database),
  }
}

/**
 * One teammate's row, and who is asking, for opening their page from a name
 * somewhere other than a member list, such as a chat message.
 */
export async function loadTeamMember(
  viewerId: string,
  userId: string,
  database = db
): Promise<{ member: TeamMemberRow; myRole: TeamRole; myUserId: string }> {
  const membership = await requireMembership(viewerId, database)
  const member = (await listTeamMembers(membership.teamId, database)).find((row) => row.userId === userId)
  if (!member) throw new Error(PROJECT_ERRORS.personNotOnTeam)
  return { member, myRole: membership.role, myUserId: viewerId }
}
