import { and, asc, count, eq, gte, lte } from "drizzle-orm"

import { localNow } from "@/lib/project/days"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireTeamRunner, type ProjectDb } from "@/server/project/access"
import { projectTeamHolidays, projectTeams } from "@/server/project/schema"

/**
 * Team holidays: a day off for everyone, set once by the owner or an admin,
 * such as "Christmas Day". On that date nobody is reminded to check in or
 * about due dates, the end-of-day job saves the day as a day off, and the
 * calendar square reads the holiday's name. The date is read on each
 * person's own calendar, the same way the team's work days are. Days already
 * saved never change, the same rule as time off.
 */

export type Holiday = { id: string; day: string; name: string }

/** The team's holidays from `from` on, soonest first. */
export async function listHolidays(
  teamId: string,
  from: string,
  database: ProjectDb = db
): Promise<Holiday[]> {
  return database
    .select({ id: projectTeamHolidays.id, day: projectTeamHolidays.day, name: projectTeamHolidays.name })
    .from(projectTeamHolidays)
    .where(and(eq(projectTeamHolidays.teamId, teamId), gte(projectTeamHolidays.day, from)))
    .orderBy(asc(projectTeamHolidays.day))
}

/** The team's holidays between two days, both included. */
export async function holidaysBetween(
  teamId: string,
  first: string,
  last: string,
  database: ProjectDb = db
): Promise<Holiday[]> {
  return database
    .select({ id: projectTeamHolidays.id, day: projectTeamHolidays.day, name: projectTeamHolidays.name })
    .from(projectTeamHolidays)
    .where(
      and(
        eq(projectTeamHolidays.teamId, teamId),
        gte(projectTeamHolidays.day, first),
        lte(projectTeamHolidays.day, last)
      )
    )
    .orderBy(asc(projectTeamHolidays.day))
}

/** The holiday's name on this day, or null. */
export async function holidayOn(teamId: string, day: string, database: ProjectDb = db) {
  const [row] = await holidaysBetween(teamId, day, day, database)
  return row?.name ?? null
}

/** The team's own today, in its time zone. A holiday before it is already history. */
async function teamToday(teamId: string, database: ProjectDb) {
  const [team] = await database
    .select({ zone: projectTeams.timeZone })
    .from(projectTeams)
    .where(eq(projectTeams.id, teamId))
  return localNow(now(), team.zone).day
}

export async function addHoliday(
  actorId: string,
  input: { day: string; name: string },
  database = db
): Promise<Holiday> {
  const membership = await requireTeamRunner(actorId, database)
  if (input.day < (await teamToday(membership.teamId, database))) {
    throw new Error(PROJECT_ERRORS.holidayInThePast)
  }
  const [{ total }] = await database
    .select({ total: count() })
    .from(projectTeamHolidays)
    .where(eq(projectTeamHolidays.teamId, membership.teamId))
  if (total >= LIMITS.holidaysPerTeam) throw new Error(PROJECT_ERRORS.tooManyHolidays)
  const row = { id: uuid(), day: input.day, name: input.name }
  const added = await database
    .insert(projectTeamHolidays)
    .values({ ...row, teamId: membership.teamId, createdByUserId: actorId, createdAt: now() })
    .onConflictDoNothing()
    .returning({ id: projectTeamHolidays.id })
  if (!added.length) throw new Error(PROJECT_ERRORS.holidayTaken)
  return row
}

export async function removeHoliday(actorId: string, holidayId: string, database = db) {
  const membership = await requireTeamRunner(actorId, database)
  const removed = await database
    .delete(projectTeamHolidays)
    .where(and(eq(projectTeamHolidays.id, holidayId), eq(projectTeamHolidays.teamId, membership.teamId)))
    .returning({ id: projectTeamHolidays.id })
  if (!removed.length) throw new Error(PROJECT_ERRORS.holidayNotFound)
}
