import { and, desc, eq, gte, inArray, isNotNull, lt, lte } from "drizzle-orm"

import { addDays, weekdayOf } from "@/lib/project/days"
import type { CheckinNotes, TeamRole } from "@/lib/project/rules"
import { db } from "@/server/db"
import { visibleProjectIds, type ProjectDb } from "@/server/project/access"
import { clockOf, isLate, loadClock, notesOf, personDay } from "@/server/project/checkins"
import { awayOn } from "@/server/project/time-off"
import {
  projectCheckinItems,
  projectCheckins,
  projectProjects,
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
  /** People with a picked task Stuck that day, or a Blocker note. */
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
      noteBlocker: projectCheckins.noteBlocker,
    })
    .from(projectCheckins)
    .where(
      and(
        eq(projectCheckins.teamId, membership.teamId),
        gte(projectCheckins.day, first),
        lte(projectCheckins.day, last)
      )
    )
  const blockedCheckins = await blockedCheckinIds(rows, database)
  const { workDays, teamSize, memberIds } = await teamShape(membership.teamId, database)
  const awayToday = await awayNotCheckedIn(
    memberIds,
    today,
    rows.filter((row) => row.day === today),
    database
  )

  const days: TeamMonthDay[] = []
  for (let day = first; day <= last && day <= today; day = addDays(day, 1)) {
    const mine = rows.filter((row) => row.day === day)
    if (mine.length || day === today) {
      days.push(
        squareOf(day, day === today, mine, blockedCheckins, workDays, teamSize, day === today ? awayToday : 0)
      )
    }
  }
  return { month: shown, today, days }
}

type DayRow = {
  id: string
  userId: string
  workDay: boolean
  checkedInAt: Date | null
  closedAt: Date | null
  noteBlocker: string | null
}

/**
 * One square of the calendar. Today has rows only for people who have
 * checked in so far, so who is expected today is worked out from the team's
 * work days and its size.
 */
function squareOf(
  day: string,
  isToday: boolean,
  rows: DayRow[],
  blockedCheckins: Set<string>,
  workDays: number[],
  teamSize: number,
  /** People on time off today who haven't checked in anyway. */
  awayToday = 0
): TeamMonthDay {
  const checkedIn = rows.filter((row) => row.checkedInAt).length
  const expected = isToday
    ? workDays.includes(weekdayOf(day))
      ? teamSize - awayToday
      : checkedIn
    : rows.filter((row) => row.workDay || row.checkedInAt).length
  const blocked = rows.filter((row) => blockedCheckins.has(row.id)).length
  return { day, checkedIn, expected, blocked }
}

/**
 * The check-ins with a Blocker note, or a pick that was Stuck: at the end of
 * the day once the day is saved, and now while it is still going.
 */
async function blockedCheckinIds(rows: DayRow[], database: ProjectDb) {
  const noted = rows.filter((row) => row.noteBlocker).map((row) => row.id)
  if (rows.length === 0) return new Set<string>()
  const stuckRows = await database
    .select({
      checkinId: projectCheckinItems.checkinId,
      endStatus: projectCheckinItems.endStatus,
      liveStatus: projectTasks.status,
      deletedAt: projectTasks.deletedAt,
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
  const closed = new Map(rows.map((row) => [row.id, Boolean(row.closedAt)]))
  return new Set([
    ...noted,
    ...stuckRows
      .filter(
        (item) =>
          (closed.get(item.checkinId) ? item.endStatus : !item.deletedAt && item.liveStatus) ===
          "stuck"
      )
      .map((item) => item.checkinId),
  ])
}

async function teamShape(teamId: string, database: ProjectDb) {
  const [team] = await database
    .select({ workDays: projectTeams.workDays })
    .from(projectTeams)
    .where(eq(projectTeams.id, teamId))
  const members = await database
    .select({ userId: projectTeamMembers.userId })
    .from(projectTeamMembers)
    .where(eq(projectTeamMembers.teamId, teamId))
  return {
    workDays: team ? [...team.workDays] : [],
    teamSize: members.length,
    memberIds: members.map((member) => member.userId),
  }
}

/** How many people are away today and haven't checked in anyway. */
async function awayNotCheckedIn(
  memberIds: string[],
  day: string,
  rows: { userId: string; checkedInAt: Date | null }[],
  database: ProjectDb
) {
  const away = await awayOn(memberIds, day, database)
  const checkedIn = new Set(rows.filter((row) => row.checkedInAt).map((row) => row.userId))
  return [...away].filter((userId) => !checkedIn.has(userId)).length
}

/**
 * Today's square for one team, counted exactly as the Team dashboard's
 * calendar counts it, for the morning notice, with the names of the people
 * expected who haven't checked in yet.
 */
export async function countTeamToday(
  teamId: string,
  day: string,
  database: ProjectDb = db
): Promise<TeamMonthDay & { notYet: string[] }> {
  const rows = await database
    .select({
      id: projectCheckins.id,
      userId: projectCheckins.userId,
      workDay: projectCheckins.workDay,
      checkedInAt: projectCheckins.checkedInAt,
      closedAt: projectCheckins.closedAt,
      noteBlocker: projectCheckins.noteBlocker,
    })
    .from(projectCheckins)
    .where(and(eq(projectCheckins.teamId, teamId), eq(projectCheckins.day, day)))
  const { workDays, teamSize, memberIds } = await teamShape(teamId, database)
  const square = squareOf(
    day,
    true,
    rows,
    await blockedCheckinIds(rows, database),
    workDays,
    teamSize,
    await awayNotCheckedIn(memberIds, day, rows, database)
  )
  if (!workDays.includes(weekdayOf(day))) return { ...square, notYet: [] }
  const away = await awayOn(memberIds, day, database)
  const checkedIn = new Set(rows.filter((row) => row.checkedInAt).map((row) => row.userId))
  const missing = memberIds.filter((id) => !checkedIn.has(id) && !away.has(id))
  const named = missing.length
    ? await database
        .select({ name: customShellUsers.name })
        .from(customShellUsers)
        .where(inArray(customShellUsers.id, missing))
        .orderBy(customShellUsers.name)
    : []
  return { ...square, notYet: named.map((row) => row.name) }
}

export type TeamDayTask = {
  /** Null when the task is in a project the viewer can't see, or was deleted. */
  taskId: string | null
  /** Null when the task is in a project the viewer can't see. */
  title: string | null
  /** Someone's own "Just me" task: it reads as "a personal task", for everyone. */
  personal: boolean
}

export type TeamDayPerson = {
  person: { id: string; name: string; avatarUrl: string; role: TeamRole }
  /** `away`: on time off that day, so not expected. */
  state: "checked_in" | "not_yet" | "missed" | "day_off" | "away" | "no_record"
  checkedInAt: string | null
  late: boolean
  /** What they picked on their check-in before this day. */
  before: TeamDayTask[]
  /** What they picked on this day. */
  picked: TeamDayTask[]
  /** Picks that were Stuck that day, with the reason when the task is still Stuck now. */
  blockers: (TeamDayTask & { reason: string | null })[]
  /**
   * The person's own notes on that day's check-in, null without one. They
   * show to everyone on the team: unlike a task title, they are the person's
   * own words.
   */
  notes: CheckinNotes | null
  /** A Blocker note or a Stuck pick. */
  blocked: boolean
}

export type TeamDay = {
  day: string
  today: string
  /** The viewer's own time zone: everyone's check-in time reads in it. */
  viewerZone: string
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
          deletedAt: projectTasks.deletedAt,
          personal: projectProjects.personalUserId,
        })
        .from(projectCheckinItems)
        .leftJoin(projectTasks, eq(projectTasks.id, projectCheckinItems.taskId))
        .leftJoin(projectProjects, eq(projectProjects.id, projectCheckinItems.projectId))
        .where(
          and(
            inArray(projectCheckinItems.checkinId, checkinIds),
            eq(projectCheckinItems.kind, "pick")
          )
        )
        .orderBy(projectCheckinItems.createdAt, projectCheckinItems.taskTitle)
    : []
  const visible = await visibleProjectIds(membership, database)
  const away = await awayOn(ids, day, database)
  const shown = (item: (typeof items)[number]): TeamDayTask => {
    if (item.personal) return { taskId: null, title: null, personal: true }
    const seen = item.projectId !== null && visible.has(item.projectId)
    return {
      // A task in the bin keeps its line, without a way to open it.
      taskId: seen && !item.deletedAt ? item.taskId : null,
      title: seen ? item.title : null,
      personal: false,
    }
  }

  const rows: TeamDayPerson[] = people.map((person) => {
    const personClock = clockOf(person)
    const row = onDay.find((r) => r.userId === person.id) ?? null
    const previous = before.find((r) => r.userId === person.id) ?? null
    const own = personDay(personClock, at)
    // A day already saved keeps what it said; time off only names a day off "Away".
    const state: TeamDayPerson["state"] = row?.checkedInAt
      ? "checked_in"
      : row
        ? row.workDay
          ? "missed"
          : away.has(person.id)
            ? "away"
            : "day_off"
        : day === own.day
          ? away.has(person.id)
            ? "away"
            : own.workDay
              ? "not_yet"
              : "day_off"
          : "no_record"
    const picks = row ? items.filter((item) => item.checkinId === row.id) : []
    const closed = Boolean(row?.closedAt)
    const blockers = picks
      .filter((item) => (closed ? item.endStatus : !item.deletedAt && item.liveStatus) === "stuck")
      .map((item) => {
        const task = shown(item)
        const stillStuck = item.liveStatus === "stuck"
        return { ...task, reason: task.title !== null && stillStuck ? item.stuckReason : null }
      })
    const notes = row?.checkedInAt ? notesOf(row) : null
    return {
      person: {
        id: person.id,
        name: person.name,
        avatarUrl: person.avatarUrl ?? "",
        role: person.role,
      },
      state,
      checkedInAt: row?.checkedInAt?.toISOString() ?? null,
      late: row ? isLate(row) : false,
      before: previous ? items.filter((item) => item.checkinId === previous.id).map(shown) : [],
      picked: picks.map(shown),
      blockers,
      notes,
      blocked: blockers.length > 0 || Boolean(notes?.blocker),
    }
  })

  const rank = (row: TeamDayPerson) =>
    row.blocked
      ? 0
      : row.state === "checked_in"
        ? 1
        : row.state === "day_off" || row.state === "away"
          ? 3
          : 2
  rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.checkedInAt ?? "").localeCompare(b.checkedInAt ?? "") ||
      a.person.name.localeCompare(b.person.name)
  )

  return {
    day,
    today,
    viewerZone: clock.zone,
    checkedIn: rows.filter((row) => row.state === "checked_in").length,
    expected: rows.filter((row) => !["day_off", "away", "no_record"].includes(row.state)).length,
    blocked: rows.filter((row) => row.blocked).length,
    people: rows,
  }
}
