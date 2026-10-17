import { and, asc, eq, gte, inArray, lte } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { runsTheTeam } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireMembership, type ProjectDb } from "@/server/project/access"
import { loadClock, personDay } from "@/server/project/checkins"
import { addDays, weekdayOf } from "@/lib/project/days"
import { projectCheckins, projectTeamMembers, projectTimeOff } from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

/**
 * Time off for one person. On those days of their own calendar there is no
 * reminder, the end-of-day job saves the day as a day off rather than "Didn't
 * check in", and the Team dashboard reads "Away" and doesn't expect them.
 * Days already saved never change. Each person marks their own; the owner
 * and admins can mark anyone's (Tyler's choice).
 */

/** The longest stretch one entry can cover. */
const MAX_DAYS = 366

export type TimeOff = { id: string; firstDay: string; lastDay: string }

export async function addTimeOff(
  actorId: string,
  input: { userId?: string; firstDay: string; lastDay: string },
  database = db
): Promise<TimeOff> {
  const membership = await requireMembership(actorId, database)
  const userId = input.userId ?? actorId
  if (userId !== actorId) {
    if (!runsTheTeam(membership.role)) throw new Error(PROJECT_ERRORS.notRunningTeam)
    const [teammate] = await database
      .select({ userId: projectTeamMembers.userId })
      .from(projectTeamMembers)
      .where(and(eq(projectTeamMembers.teamId, membership.teamId), eq(projectTeamMembers.userId, userId)))
    if (!teammate) throw new Error(PROJECT_ERRORS.personNotOnTeam)
  }
  if (input.lastDay < input.firstDay) throw new Error(PROJECT_ERRORS.timeOffBackwards)
  const span = (Date.parse(input.lastDay) - Date.parse(input.firstDay)) / 86_400_000 + 1
  if (span > MAX_DAYS) throw new Error(PROJECT_ERRORS.timeOffTooLong)
  const row = { id: uuid(), firstDay: input.firstDay, lastDay: input.lastDay }
  await database.insert(projectTimeOff).values({
    ...row,
    teamId: membership.teamId,
    userId,
    createdByUserId: actorId,
    createdAt: now(),
  })
  return row
}

export async function removeTimeOff(actorId: string, timeOffId: string, database = db) {
  const membership = await requireMembership(actorId, database)
  const [row] = await database
    .select({ userId: projectTimeOff.userId })
    .from(projectTimeOff)
    .where(and(eq(projectTimeOff.id, timeOffId), eq(projectTimeOff.teamId, membership.teamId)))
  if (!row) throw new Error(PROJECT_ERRORS.timeOffNotFound)
  if (row.userId !== actorId && !runsTheTeam(membership.role)) {
    throw new Error(PROJECT_ERRORS.notRunningTeam)
  }
  await database.delete(projectTimeOff).where(eq(projectTimeOff.id, timeOffId))
}

/** Someone's time off that hasn't ended: my own, or anyone's for the owner and admins. */
export async function listTimeOffFor(actorId: string, userId: string | undefined, database = db) {
  const membership = await requireMembership(actorId, database)
  const target = userId ?? actorId
  if (target !== actorId) {
    if (!runsTheTeam(membership.role)) throw new Error(PROJECT_ERRORS.notRunningTeam)
    const [teammate] = await database
      .select({ userId: projectTeamMembers.userId })
      .from(projectTeamMembers)
      .where(and(eq(projectTeamMembers.teamId, membership.teamId), eq(projectTeamMembers.userId, target)))
    if (!teammate) throw new Error(PROJECT_ERRORS.personNotOnTeam)
  }
  const { clock } = await loadClock(target, database)
  return upcomingTimeOff(target, personDay(clock, new Date()).day, database)
}

/** A person's time off that hasn't ended yet, from their own today. */
export async function upcomingTimeOff(
  userId: string,
  today: string,
  database: ProjectDb = db
): Promise<TimeOff[]> {
  return database
    .select({ id: projectTimeOff.id, firstDay: projectTimeOff.firstDay, lastDay: projectTimeOff.lastDay })
    .from(projectTimeOff)
    .where(and(eq(projectTimeOff.userId, userId), gte(projectTimeOff.lastDay, today)))
    .orderBy(asc(projectTimeOff.firstDay))
}

/** Of these people, who is away on this calendar day. */
export async function awayOn(
  userIds: readonly string[],
  day: string,
  database: ProjectDb = db
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const rows = await database
    .select({ userId: projectTimeOff.userId })
    .from(projectTimeOff)
    .where(
      and(
        inArray(projectTimeOff.userId, [...userIds]),
        lte(projectTimeOff.firstDay, day),
        gte(projectTimeOff.lastDay, day)
      )
    )
  return new Set(rows.map((row) => row.userId))
}

export type AwayDay = { day: string; people: { id: string; name: string }[] }

/**
 * Who on the team is away on each of the team's work days from `first` to
 * `last`, for the Team calendar (Tyler, 16 Oct 2026: always shown, to
 * everyone on the team). Time off on a day the team doesn't work isn't
 * named, and nor is anyone who has left the team.
 */
export async function awayBetween(
  teamId: string,
  workDays: readonly number[],
  first: string,
  last: string,
  database: ProjectDb = db
): Promise<AwayDay[]> {
  const rows = await database
    .select({
      userId: projectTimeOff.userId,
      name: customShellUsers.name,
      firstDay: projectTimeOff.firstDay,
      lastDay: projectTimeOff.lastDay,
    })
    .from(projectTimeOff)
    .innerJoin(
      projectTeamMembers,
      and(eq(projectTeamMembers.teamId, projectTimeOff.teamId), eq(projectTeamMembers.userId, projectTimeOff.userId))
    )
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTimeOff.userId))
    .where(and(eq(projectTimeOff.teamId, teamId), lte(projectTimeOff.firstDay, last), gte(projectTimeOff.lastDay, first)))
    .orderBy(asc(customShellUsers.name))
  const days: AwayDay[] = []
  for (let day = first; day <= last; day = addDays(day, 1)) {
    if (!workDays.includes(weekdayOf(day))) continue
    const people = new Map<string, string>()
    for (const row of rows) {
      if (row.firstDay <= day && row.lastDay >= day) people.set(row.userId, row.name)
    }
    if (people.size) days.push({ day, people: [...people].map(([id, name]) => ({ id, name })) })
  }
  return days
}

export type CheckinRecord = { onTime: number; of: number }

/**
 * "On time 18 of the last 20 work days": the person's own last 20 saved work
 * days, read from their check-in rows. Days off and time off are saved as
 * days off, so they are left out. Today counts once they have checked in.
 * Only the person themselves is ever shown this.
 */
export async function loadCheckinRecord(
  userId: string,
  database: ProjectDb = db,
  at = new Date()
): Promise<CheckinRecord> {
  const { clock } = await loadClock(userId, database)
  const today = personDay(clock, at).day
  const rows = await database
    .select({
      day: projectCheckins.day,
      dueAt: projectCheckins.dueAt,
      checkedInAt: projectCheckins.checkedInAt,
    })
    .from(projectCheckins)
    .where(
      and(
        eq(projectCheckins.userId, userId),
        eq(projectCheckins.workDay, true),
        lte(projectCheckins.day, today)
      )
    )
    .orderBy(asc(projectCheckins.day))
  const counted = rows.filter((row) => row.day < today || row.checkedInAt).slice(-20)
  return {
    onTime: counted.filter((row) => row.checkedInAt && row.checkedInAt <= row.dueAt).length,
    of: counted.length,
  }
}
