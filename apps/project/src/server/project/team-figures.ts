import { and, count, eq, gte, isNotNull, isNull, lte, lt, ne, or } from "drizzle-orm"

import { addDays, daysBetween, localNow, momentOf, weekdayOf } from "@/lib/project/days"
import { db } from "@/server/db"
import { visibleProjectsWhere } from "@/server/project/access"
import { loadClock, personDay } from "@/server/project/checkins"
import {
  projectCheckins,
  projectProjects,
  projectTasks,
  projectTeamMembers,
} from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

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
  /** People invited who haven't set their password yet. */
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
  // An invited employee is on the team from the start; until they set a
  // password from their email, they count as a pending invite.
  const [{ pendingInvites }] = await database
    .select({ pendingInvites: count() })
    .from(projectTeamMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
    .where(and(eq(projectTeamMembers.teamId, membership.teamId), isNull(customShellUsers.passwordHash)))

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

export type TrendWeek = {
  /** The week's Monday, in the viewer's own calendar. */
  monday: string
  /** Check-ins counted the way the figure counts them, up to yesterday for this week. */
  checkins: { checkedIn: number; expected: number }
  /** Tasks marked Done that week and still Done, as "Completed" counts them. */
  finished: number
}

export const TREND_WEEKS = 12

/**
 * The Trends window: the check-in rate and the tasks finished, week by week,
 * for the last 12 weeks, this one last. Team totals only: Tyler said the
 * check-in isn't for watching people, so nothing here is ever split by
 * person. Each week uses the four figures' own rules, so this week's
 * finished count is the "Completed" figure.
 */
export async function loadTeamTrends(
  viewerId: string,
  database = db,
  at = new Date()
): Promise<TrendWeek[]> {
  const { membership, clock } = await loadClock(viewerId, database)
  const today = personDay(clock, at).day
  const thisMonday = addDays(today, -((weekdayOf(today) + 6) % 7))
  const mondays = Array.from({ length: TREND_WEEKS }, (_, index) =>
    addDays(thisMonday, -7 * (TREND_WEEKS - 1 - index))
  )
  // Which of the 12 weeks a day falls in, or -1 before the first.
  const weekOf = (day: string) => Math.floor(daysBetween(mondays[0], day) / 7)

  const finishedRows = await database
    .select({ completedAt: projectTasks.completedAt })
    .from(projectTasks)
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .where(
      and(
        visibleProjectsWhere(membership),
        isNull(projectProjects.personalUserId),
        isNull(projectTasks.deletedAt),
        eq(projectTasks.status, "done"),
        gte(projectTasks.completedAt, momentOf(mondays[0], "00:00", clock.zone))
      )
    )
  const checkinRows = await database
    .select({ day: projectCheckins.day, checkedIn: projectCheckins.checkedInAt })
    .from(projectCheckins)
    .where(
      and(
        eq(projectCheckins.teamId, membership.teamId),
        gte(projectCheckins.day, mondays[0]),
        // Today is left out, as in the figure: people still have time to check in.
        lt(projectCheckins.day, today),
        or(eq(projectCheckins.workDay, true), isNotNull(projectCheckins.checkedInAt))
      )
    )

  const weeks: TrendWeek[] = mondays.map((monday) => ({
    monday,
    checkins: { checkedIn: 0, expected: 0 },
    finished: 0,
  }))
  for (const row of finishedRows) {
    if (!row.completedAt) continue
    const week = weeks[weekOf(localNow(row.completedAt, clock.zone).day)]
    if (week) week.finished += 1
  }
  for (const row of checkinRows) {
    const week = weeks[weekOf(row.day)]
    if (!week) continue
    week.checkins.expected += 1
    if (row.checkedIn) week.checkins.checkedIn += 1
  }
  return weeks
}
