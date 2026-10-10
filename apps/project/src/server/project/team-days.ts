import { and, desc, eq, gte, inArray, isNotNull, lt, lte } from "drizzle-orm"

import { addDays, weekdayOf } from "@/lib/project/days"
import type { TeamRole } from "@/lib/project/rules"
import { db } from "@/server/db"
import { visibleProjectIds } from "@/server/project/access"
import { clockOf, isLate, loadClock, personDay } from "@/server/project/checkins"
import {
  projectCheckinItems,
  projectCheckins,
  projectTasks,
  projectTeamMembers,
  projectTeams,
} from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

/**
 * The Team dashboard's calendar and check-ins, read from the saved check-ins.
 * Days are calendar dates: "Fri, Oct 9" is each person's own Oct 9, in their
 * own time zone. A task in a project the viewer isn't on is never named.
 */

export type TeamMonthDay = {
  day: string
  checkedIn: number
  /** People expected that day: everyone on a work day, and anyone who checked in on a day off. */
  expected: number
  /** People with a picked task Stuck that day. */
  blocked: number
}

export type TeamMonth = {
  /** "YYYY-MM". */
  month: string
  /** The viewer's own today. */
  today: string
  days: TeamMonthDay[]
}

export async function loadTeamMonth(
  viewerId: string,
  month: string | undefined,
  database = db,
  at = new Date()
): Promise<TeamMonth> {
  const { membership, clock } = await loadClock(viewerId, database)
  const today = personDay(clock, at).day
  const shown = month ?? today.slice(0, 7)
  const first = `${shown}-01`
  const last = addDays(`${addDays(first, 32).slice(0, 7)}-01`, -1)

  const rows = await database
    .select({
      id: projectCheckins.id,
      userId: projectCheckins.userId,
      day: projectCheckins.day,
      workDay: projectCheckins.workDay,
      checkedInAt: projectCheckins.checkedInAt,
      closedAt: projectCheckins.closedAt,
    })
    .from(projectCheckins)
    .where(
      and(
        eq(projectCheckins.teamId, membership.teamId),
        gte(projectCheckins.day, first),
        lte(projectCheckins.day, last)
      )
    )
  const stuckRows = rows.length
    ? await database
        .select({
          checkinId: projectCheckinItems.checkinId,
          endStatus: projectCheckinItems.endStatus,
          liveStatus: projectTasks.status,
        })
        .from(projectCheckinItems)
        .leftJoin(projectTasks, eq(projectTasks.id, projectCheckinItems.taskId))
        .where(
          and(
            inArray(
              projectCheckinItems.checkinId,
              rows.map((row) => row.id)
            ),
            eq(projectCheckinItems.kind, "pick")
          )
        )
    : []

  // Today has rows only for people who have checked in so far, so who is
  // expected is worked out from the team's work days and its size.
  const [team] = await database
    .select({ workDays: projectTeams.workDays })
    .from(projectTeams)
    .where(eq(projectTeams.id, membership.teamId))
  const teamSize = (
    await database
      .select({ userId: projectTeamMembers.userId })
      .from(projectTeamMembers)
      .where(eq(projectTeamMembers.teamId, membership.teamId))
  ).length

  // A check-in is blocked when one of its picks was Stuck: at the end of the
  // day once the day is saved, and now while it is still going.
  const closed = new Map(rows.map((row) => [row.id, Boolean(row.closedAt)]))
  const blockedCheckins = new Set(
    stuckRows
      .filter((item) => (closed.get(item.checkinId) ? item.endStatus : item.liveStatus) === "stuck")
      .map((item) => item.checkinId)
  )

  const days: TeamMonthDay[] = []
  for (let day = first; day <= last && day <= today; day = addDays(day, 1)) {
    const mine = rows.filter((row) => row.day === day)
    const checkedIn = mine.filter((row) => row.checkedInAt).length
    const expected =
      day === today
        ? team?.workDays.includes(weekdayOf(day))
          ? teamSize
          : checkedIn
        : mine.filter((row) => row.workDay || row.checkedInAt).length
    const blocked = mine.filter((row) => blockedCheckins.has(row.id)).length
    if (mine.length || day === today) days.push({ day, checkedIn, expected, blocked })
  }
  return { month: shown, today, days }
}

export type TeamDayTask = {
  /** Null when the task is in a project the viewer can't see, or was deleted. */
  taskId: string | null
  /** Null when the task is in a project the viewer can't see. */
  title: string | null
}

export type TeamDayPerson = {
  person: { id: string; name: string; avatarUrl: string; role: TeamRole }
  state: "checked_in" | "not_yet" | "missed" | "day_off" | "no_record"
  checkedInAt: string | null
  timeZone: string
  late: boolean
  /** What they picked on their check-in before this day. */
  before: TeamDayTask[]
  /** What they picked on this day. */
  picked: TeamDayTask[]
  /** Picks that were Stuck that day, with the reason when the task is still Stuck now. */
  blockers: (TeamDayTask & { reason: string | null })[]
}

export type TeamDay = {
  day: string
  today: string
  checkedIn: number
  expected: number
  blocked: number
  /** Blocked first, then checked in by time, then everyone else. */
  people: TeamDayPerson[]
}

export async function loadTeamDay(
  viewerId: string,
  requested: string | undefined,
  database = db,
  at = new Date()
): Promise<TeamDay> {
  const { membership, clock } = await loadClock(viewerId, database)
  const today = personDay(clock, at).day
  const day = requested && requested <= today ? requested : today

  const people = await database
    .select({
      id: projectTeamMembers.userId,
      role: projectTeamMembers.role,
      name: customShellUsers.name,
      avatarUrl: customShellUsers.avatarUrl,
      teamTime: projectTeams.checkinTime,
      teamZone: projectTeams.timeZone,
      workDays: projectTeams.workDays,
      ownTime: projectTeamMembers.checkinTime,
      ownZone: projectTeamMembers.timeZone,
    })
    .from(projectTeamMembers)
    .innerJoin(projectTeams, eq(projectTeams.id, projectTeamMembers.teamId))
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
    .where(eq(projectTeamMembers.teamId, membership.teamId))
  const ids = people.map((person) => person.id)

  const onDay = await database
    .select()
    .from(projectCheckins)
    .where(and(eq(projectCheckins.teamId, membership.teamId), eq(projectCheckins.day, day)))
  // Each person's last check-in before this day.
  const before = await database
    .selectDistinctOn([projectCheckins.userId])
    .from(projectCheckins)
    .where(
      and(
        inArray(projectCheckins.userId, ids),
        eq(projectCheckins.teamId, membership.teamId),
        lt(projectCheckins.day, day),
        isNotNull(projectCheckins.checkedInAt)
      )
    )
    .orderBy(projectCheckins.userId, desc(projectCheckins.day))

  const checkinIds = [...onDay, ...before].map((row) => row.id)
  const items = checkinIds.length
    ? await database
        .select({
          checkinId: projectCheckinItems.checkinId,
          taskId: projectCheckinItems.taskId,
          projectId: projectCheckinItems.projectId,
          title: projectCheckinItems.taskTitle,
          endStatus: projectCheckinItems.endStatus,
          liveStatus: projectTasks.status,
          stuckReason: projectTasks.stuckReason,
        })
        .from(projectCheckinItems)
        .leftJoin(projectTasks, eq(projectTasks.id, projectCheckinItems.taskId))
        .where(
          and(
            inArray(projectCheckinItems.checkinId, checkinIds),
            eq(projectCheckinItems.kind, "pick")
          )
        )
        .orderBy(projectCheckinItems.createdAt, projectCheckinItems.taskTitle)
    : []
  const visible = await visibleProjectIds(membership, database)
  const shown = (item: (typeof items)[number]): TeamDayTask => {
    const seen = item.projectId !== null && visible.has(item.projectId)
    return { taskId: seen ? item.taskId : null, title: seen ? item.title : null }
  }

  const rows: TeamDayPerson[] = people.map((person) => {
    const personClock = clockOf(person)
    const row = onDay.find((r) => r.userId === person.id) ?? null
    const previous = before.find((r) => r.userId === person.id) ?? null
    const own = personDay(personClock, at)
    const state: TeamDayPerson["state"] = row?.checkedInAt
      ? "checked_in"
      : row
        ? row.workDay
          ? "missed"
          : "day_off"
        : day === own.day
          ? own.workDay
            ? "not_yet"
            : "day_off"
          : "no_record"
    const picks = row ? items.filter((item) => item.checkinId === row.id) : []
    const closed = Boolean(row?.closedAt)
    return {
      person: {
        id: person.id,
        name: person.name,
        avatarUrl: person.avatarUrl ?? "",
        role: person.role,
      },
      state,
      checkedInAt: row?.checkedInAt?.toISOString() ?? null,
      timeZone: row?.timeZone ?? personClock.zone,
      late: row ? isLate(row) : false,
      before: previous ? items.filter((item) => item.checkinId === previous.id).map(shown) : [],
      picked: picks.map(shown),
      blockers: picks
        .filter((item) => (closed ? item.endStatus : item.liveStatus) === "stuck")
        .map((item) => {
          const task = shown(item)
          const stillStuck = item.liveStatus === "stuck"
          return { ...task, reason: task.title !== null && stillStuck ? item.stuckReason : null }
        }),
    }
  })

  const rank = (row: TeamDayPerson) =>
    row.blockers.length ? 0 : row.state === "checked_in" ? 1 : row.state === "day_off" ? 3 : 2
  rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.checkedInAt ?? "").localeCompare(b.checkedInAt ?? "") ||
      a.person.name.localeCompare(b.person.name)
  )

  return {
    day,
    today,
    checkedIn: rows.filter((row) => row.state === "checked_in").length,
    expected: rows.filter((row) => row.state !== "day_off" && row.state !== "no_record").length,
    blocked: rows.filter((row) => row.blockers.length).length,
    people: rows,
  }
}
