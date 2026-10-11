import { and, count, eq, gt, gte, isNotNull, isNull, lte, lt, ne, or } from "drizzle-orm"

import { addDays, momentOf, weekdayOf } from "@/lib/project/days"
import { db } from "@/server/db"
import { visibleProjectsWhere } from "@/server/project/access"
import { loadClock, personDay } from "@/server/project/checkins"
import {
  projectCheckins,
  projectProjects,
  projectTasks,
  projectTeamInvites,
  projectTeamMembers,
} from "@/server/project/schema"

/**
 * The four figures under the team's name on the Team dashboard. Tyler's
 * choices (11 Oct 2026):
 *
 * - Open tasks and Completed count only projects the viewer can see, leaving
 *   out "Just me" lists and the bin. Open tasks also leave out archived
 *   projects, where nothing can be worked on.
 * - "This week" is Monday to Sunday of the viewer's own week, the way the
 *   calendar's rows run.
 * - The check-in rate covers the 7 days before today, from the saved
 *   check-ins, counted the way the calendar counts them: work days only, time
 *   off left out, and a late check-in still counts. Today is left out because
 *   people still have time to check in.
 */

export type TeamFigures = {
  members: number
  pendingInvites: number
  openTasks: number
  /** Open tasks due Monday to Sunday of this week. */
  dueThisWeek: number
  completedThisWeek: number
  checkins: { checkedIn: number; expected: number }
}

export async function loadTeamFigures(
  viewerId: string,
  database = db,
  at = new Date()
): Promise<TeamFigures> {
  const { membership, clock } = await loadClock(viewerId, database)
  const today = personDay(clock, at).day
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7))
  const sunday = addDays(monday, 6)

  const [{ members }] = await database
    .select({ members: count() })
    .from(projectTeamMembers)
    .where(eq(projectTeamMembers.teamId, membership.teamId))
  const [{ pendingInvites }] = await database
    .select({ pendingInvites: count() })
    .from(projectTeamInvites)
    .where(and(eq(projectTeamInvites.teamId, membership.teamId), gt(projectTeamInvites.expiresAt, at)))

  const sharedAndSeen = and(
    visibleProjectsWhere(membership),
    isNull(projectProjects.personalUserId),
    isNull(projectTasks.deletedAt)
  )
  const tasksIn = (where: ReturnType<typeof and>) =>
    database
      .select({ total: count() })
      .from(projectTasks)
      .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
      .where(where)
  const open = and(sharedAndSeen, isNull(projectProjects.archivedAt), ne(projectTasks.status, "done"))
  const [[openTasks], [dueThisWeek], [completed]] = await Promise.all([
    tasksIn(open),
    tasksIn(and(open, gte(projectTasks.dueDate, monday), lte(projectTasks.dueDate, sunday))),
    tasksIn(
      and(
        sharedAndSeen,
        eq(projectTasks.status, "done"),
        gte(projectTasks.completedAt, momentOf(monday, "00:00", clock.zone))
      )
    ),
  ])

  const rows = await database
    .select({ checkedIn: projectCheckins.checkedInAt })
    .from(projectCheckins)
    .where(
      and(
        eq(projectCheckins.teamId, membership.teamId),
        gte(projectCheckins.day, addDays(today, -7)),
        lt(projectCheckins.day, today),
        or(eq(projectCheckins.workDay, true), isNotNull(projectCheckins.checkedInAt))
      )
    )

  return {
    members,
    pendingInvites,
    openTasks: openTasks.total,
    dueThisWeek: dueThisWeek.total,
    completedThisWeek: completed.total,
    checkins: { checkedIn: rows.filter((row) => row.checkedIn).length, expected: rows.length },
  }
}
