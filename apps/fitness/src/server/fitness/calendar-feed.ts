import { and, asc, eq, gte, isNull } from "drizzle-orm"

import { addDays, todayIn } from "@/lib/fitness/dates"
import { appUrlFor } from "@/server/app-url"
import { db, type CustomShellDb } from "@/server/db"
import { ensureScheduled } from "@/server/fitness/calendar"
import {
  fitnessWeekDays,
  fitnessProfiles,
  fitnessPrograms,
  fitnessScheduledWorkouts,
  fitnessWorkouts,
} from "@/server/fitness/schema"

/**
 * A person's planned workouts as an iCalendar feed, which Google Calendar and
 * Apple Calendar subscribe to by address. The address carries a secret in
 * place of a sign-in; resetting it in the app stops the old one working.
 *
 * One all-day event per planned workout, from 30 days back to four weeks
 * ahead, for every program that isn't archived. It is one way: moving an event
 * in Google does not move the workout.
 */
export async function calendarFeedFor(token: string, database: CustomShellDb = db): Promise<string | null> {
  if (!/^[a-f0-9]{48}$/.test(token)) return null
  const [profile] = await database
    .select()
    .from(fitnessProfiles)
    .where(eq(fitnessProfiles.calendarToken, token))
    .limit(1)
  if (!profile) return null
  const today = todayIn(profile.timeZone)
  const programs = await database
    .select({ id: fitnessPrograms.id, name: fitnessPrograms.name })
    .from(fitnessPrograms)
    .where(and(eq(fitnessPrograms.userId, profile.userId), isNull(fitnessPrograms.archivedAt)))
  const events: string[] = []
  for (const program of programs) {
    await ensureScheduled(program.id, today, database)
    const rows = await database
      .select({
        id: fitnessScheduledWorkouts.id,
        day: fitnessScheduledWorkouts.day,
        status: fitnessScheduledWorkouts.status,
        skippedAt: fitnessScheduledWorkouts.skippedAt,
        weekDayName: fitnessWeekDays.name,
        workoutName: fitnessWorkouts.name,
      })
      .from(fitnessScheduledWorkouts)
      .leftJoin(fitnessWeekDays, eq(fitnessWeekDays.id, fitnessScheduledWorkouts.dayId))
      .leftJoin(fitnessWorkouts, eq(fitnessWorkouts.id, fitnessScheduledWorkouts.workoutId))
      .where(
        and(
          eq(fitnessScheduledWorkouts.programId, program.id),
          gte(fitnessScheduledWorkouts.day, addDays(today, -30))
        )
      )
      .orderBy(asc(fitnessScheduledWorkouts.day))
    for (const row of rows) {
      const name = row.weekDayName ?? row.workoutName ?? "Workout"
      const start = row.day.replaceAll("-", "")
      const end = addDays(row.day, 1).replaceAll("-", "")
      events.push(
        [
          "BEGIN:VEVENT",
          `UID:${row.id}@fitness`,
          `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
          `DTSTART;VALUE=DATE:${start}`,
          `DTEND;VALUE=DATE:${end}`,
          fold(`SUMMARY:${escapeText(`${row.status === "done" ? "Done: " : row.skippedAt ? "Skipped: " : ""}${name}, ${program.name}`)}`),
          fold(`URL:${appUrlFor(`/programs/${program.id}`)}`),
          "END:VEVENT",
        ].join("\r\n")
      )
    }
  }
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fitness//Workouts//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Workouts",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n")
}

function escapeText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n")
}

/** Lines longer than 75 bytes are split, as the format asks. */
function fold(line: string) {
  const parts: string[] = []
  let rest = line
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74))
    rest = rest.slice(74)
  }
  parts.push(rest)
  return parts.join("\r\n ")
}
