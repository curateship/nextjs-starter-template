import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm"

import { addDays, todayIn, type Day } from "@/lib/fitness/dates"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import {
  SCHEDULE_DAYS_AHEAD,
  displayStatus,
  fillSchedule,
  isLightWeek,
  programEndDay,
  type PauseWindow,
  type ScheduleStatus,
} from "@/lib/fitness/schedule"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { programFor, type FitnessDb } from "@/server/fitness/access"
import { profileFor } from "@/server/fitness/profile"
import {
  fitnessPauses,
  fitnessWeekDays,
  fitnessPrograms,
  fitnessScheduledWorkouts,
  fitnessStrengthSettings,
  fitnessWorkouts,
} from "@/server/fitness/schema"

/**
 * The training calendar: the week's workout days laid onto the person's
 * weekdays, kept filled four weeks ahead. "Missed" and "paused" are never
 * stored; they are read from the date and the pauses.
 */

export async function todayFor(userId: string, database: FitnessDb = db): Promise<Day> {
  return todayIn((await profileFor(userId, database)).timeZone)
}

/** The pause covering today or starting later, if there is one. */
export async function currentPause(
  programId: string,
  today: Day,
  database: FitnessDb = db
): Promise<(typeof fitnessPauses.$inferSelect) | null> {
  const [pause] = await database
    .select()
    .from(fitnessPauses)
    .where(
      and(
        eq(fitnessPauses.programId, programId),
        or(isNull(fitnessPauses.untilDay), gte(fitnessPauses.untilDay, today))
      )
    )
    .orderBy(asc(fitnessPauses.fromDay))
    .limit(1)
  return pause ?? null
}

function asWindow(pause: { fromDay: Day; untilDay: Day | null } | null): PauseWindow | null {
  return pause ? { from: pause.fromDay, until: pause.untilDay } : null
}

/** Weekday (0 = Sunday) to the workout day on it. Rest days are missing. */
async function weekMap(programId: string, database: FitnessDb) {
  const days = await database
    .select({ id: fitnessWeekDays.id, weekday: fitnessWeekDays.weekday })
    .from(fitnessWeekDays)
    .where(eq(fitnessWeekDays.programId, programId))
  return new Map(days.map((day) => [day.weekday, day.id]))
}

/**
 * Fills the calendar up to four weeks past today from the program's week.
 * Safe to call on every read: a second caller finds the days taken and adds
 * nothing.
 */
export async function ensureScheduled(programId: string, today: Day, database: FitnessDb = db) {
  const [strength] = await database
    .select()
    .from(fitnessStrengthSettings)
    .where(eq(fitnessStrengthSettings.programId, programId))
    .limit(1)
  if (!strength) return
  const [program] = await database
    .select({ weeks: fitnessPrograms.weeks })
    .from(fitnessPrograms)
    .where(eq(fitnessPrograms.id, programId))
    .limit(1)
  // A program that runs for a set number of weeks plans nothing past its last day.
  const end = programEndDay(strength.startDay, program?.weeks ?? null)
  const ahead = addDays(today, SCHEDULE_DAYS_AHEAD)
  const to = end && end < ahead ? end : ahead
  const laidFrom =
    strength.scheduledThrough && strength.scheduledThrough >= today
      ? addDays(strength.scheduledThrough, 1)
      : today
  // A program run again starts on a later Monday, and nothing is planned before it.
  const from = laidFrom < strength.startDay ? strength.startDay : laidFrom
  if (from > to) return
  const week = await weekMap(programId, database)
  // A date is taken when it holds a workout, or when a workout was moved off
  // it: laying the week out again must never put that workout back there.
  const taken = await database
    .select({ day: fitnessScheduledWorkouts.day, movedFrom: fitnessScheduledWorkouts.movedFrom })
    .from(fitnessScheduledWorkouts)
    .where(
      and(
        eq(fitnessScheduledWorkouts.programId, programId),
        or(
          and(gte(fitnessScheduledWorkouts.day, from), lte(fitnessScheduledWorkouts.day, to)),
          and(gte(fitnessScheduledWorkouts.movedFrom, from), lte(fitnessScheduledWorkouts.movedFrom, to))
        )
      )
    )
  const pause = await currentPause(programId, today, database)
  const entries = fillSchedule({
    from,
    to,
    week,
    taken: new Set(taken.flatMap((row) => (row.movedFrom ? [row.day, row.movedFrom] : [row.day]))),
    pause: asWindow(pause),
  })
  if (entries.length > 0) {
    await database
      .insert(fitnessScheduledWorkouts)
      .values(
        entries.map((entry) => ({
          id: uuid(),
          programId,
          dayId: entry.dayId,
          day: entry.day,
          status: "planned" as const,
          moved: false,
          workoutId: null,
        }))
      )
      .onConflictDoNothing()
  }
  await database
    .update(fitnessStrengthSettings)
    .set({ scheduledThrough: to })
    .where(eq(fitnessStrengthSettings.programId, programId))
}

/**
 * Lays the week out again from today. Used when a weekday becomes a workout
 * or a rest day, or a pause changes.
 *
 * Throws away every planned date from today on that wasn't moved or skipped
 * by hand and has no workout started on it, and every planned date whose
 * weekday is now a rest day. A date with a workout on it, finished or
 * started, is never touched, so the calendar keeps its history and an open
 * workout keeps its date.
 */
export async function rescheduleFromToday(programId: string, today: Day, database: FitnessDb = db) {
  await database
    .delete(fitnessScheduledWorkouts)
    .where(
      and(
        eq(fitnessScheduledWorkouts.programId, programId),
        eq(fitnessScheduledWorkouts.status, "planned"),
        isNull(fitnessScheduledWorkouts.workoutId),
        or(
          and(
            eq(fitnessScheduledWorkouts.moved, false),
            isNull(fitnessScheduledWorkouts.skippedAt),
            gte(fitnessScheduledWorkouts.day, today)
          ),
          isNull(fitnessScheduledWorkouts.dayId)
        )
      )
    )
  await database
    .update(fitnessStrengthSettings)
    .set({ scheduledThrough: null })
    .where(eq(fitnessStrengthSettings.programId, programId))
  await ensureScheduled(programId, today, database)
}

export type CalendarDay = {
  id: string
  day: Day
  /** Null when its weekday has since become a rest day; only a date with a workout keeps such a row. */
  dayId: string | null
  dayName: string
  status: ScheduleStatus
  moved: boolean
  lightWeek: boolean
  workoutId: string | null
}

export async function loadCalendar(
  actorId: string,
  programId: string,
  range: { from: Day; to: Day },
  database: FitnessDb = db
): Promise<{ today: Day; days: CalendarDay[]; pause: PauseWindow | null }> {
  const program = await programFor(actorId, programId, database)
  const today = await todayFor(program.userId, database)
  if (!program.archivedAt) await ensureScheduled(programId, today, database)
  const [strength] = await database
    .select()
    .from(fitnessStrengthSettings)
    .where(eq(fitnessStrengthSettings.programId, programId))
    .limit(1)
  const rows = await database
    .select({
      id: fitnessScheduledWorkouts.id,
      day: fitnessScheduledWorkouts.day,
      dayId: fitnessScheduledWorkouts.dayId,
      weekDayName: fitnessWeekDays.name,
      workoutName: fitnessWorkouts.name,
      status: fitnessScheduledWorkouts.status,
      moved: fitnessScheduledWorkouts.moved,
      skippedAt: fitnessScheduledWorkouts.skippedAt,
      workoutId: fitnessScheduledWorkouts.workoutId,
    })
    .from(fitnessScheduledWorkouts)
    .leftJoin(fitnessWeekDays, eq(fitnessWeekDays.id, fitnessScheduledWorkouts.dayId))
    .leftJoin(fitnessWorkouts, eq(fitnessWorkouts.id, fitnessScheduledWorkouts.workoutId))
    .where(
      and(
        eq(fitnessScheduledWorkouts.programId, programId),
        gte(fitnessScheduledWorkouts.day, range.from),
        lte(fitnessScheduledWorkouts.day, range.to)
      )
    )
    .orderBy(asc(fitnessScheduledWorkouts.day))
  const pauses = await database
    .select()
    .from(fitnessPauses)
    .where(eq(fitnessPauses.programId, programId))
  const pauseOn = (day: Day) =>
    asWindow(
      pauses.find((pause) => day >= pause.fromDay && (pause.untilDay === null || day <= pause.untilDay)) ??
        null
    )
  const current = await currentPause(programId, today, database)
  return {
    today,
    pause: asWindow(current),
    days: rows.map(({ weekDayName, workoutName, skippedAt, ...row }) => ({
      ...row,
      dayName: weekDayName ?? workoutName ?? "Workout",
      status: displayStatus(row.status, row.day, today, pauseOn(row.day), Boolean(skippedAt)),
      lightWeek: strength ? isLightWeek(row.day, strength.startDay, strength.blockWeeks) : false,
    })),
  }
}

/**
 * One calendar day by its id, worked out the same way the month is, for the
 * right panel of a program's dashboard. A day someone can't see answers like
 * one that doesn't exist.
 */
export async function loadScheduledDay(
  actorId: string,
  scheduledId: string,
  database: FitnessDb = db
): Promise<CalendarDay> {
  const [row] = await database
    .select({ programId: fitnessScheduledWorkouts.programId, day: fitnessScheduledWorkouts.day })
    .from(fitnessScheduledWorkouts)
    .where(eq(fitnessScheduledWorkouts.id, scheduledId))
    .limit(1)
  if (!row) throw new Error(FITNESS_ERRORS.scheduledNotFound)
  const { days } = await loadCalendar(actorId, row.programId, { from: row.day, to: row.day }, database)
  const found = days.find((entry) => entry.id === scheduledId)
  if (!found) throw new Error(FITNESS_ERRORS.scheduledNotFound)
  return found
}

/** Moves one workout to another day. Only that one date changes. */
export async function moveScheduled(
  actorId: string,
  scheduledId: string,
  toDay: Day,
  database: FitnessDb = db
) {
  const [row] = await database
    .select()
    .from(fitnessScheduledWorkouts)
    .where(eq(fitnessScheduledWorkouts.id, scheduledId))
    .limit(1)
  if (!row) throw new Error(FITNESS_ERRORS.scheduledNotFound)
  const program = await programFor(actorId, row.programId, database, { forChange: true })
  const today = await todayFor(program.userId, database)
  if (toDay < today) throw new Error(FITNESS_ERRORS.movePast)
  if (row.status === "done") throw new Error(FITNESS_ERRORS.workoutFinished)
  if (toDay === row.day) return
  const [clash] = await database
    .select({ id: fitnessScheduledWorkouts.id })
    .from(fitnessScheduledWorkouts)
    .where(and(eq(fitnessScheduledWorkouts.programId, row.programId), eq(fitnessScheduledWorkouts.day, toDay)))
    .limit(1)
  if (clash) throw new Error(FITNESS_ERRORS.dayTaken)
  await database
    .update(fitnessScheduledWorkouts)
    .set({
      day: toDay,
      moved: true,
      movedFrom: row.movedFrom ?? row.day,
      remindedAt: null,
      nudgedAt: null,
      skippedAt: null,
      coachNoticedAt: null,
    })
    .where(eq(fitnessScheduledWorkouts.id, scheduledId))
}

/**
 * Skips one planned date on purpose, or takes the skip back. A skipped date
 * is neither done nor missed (Tyler, 21 Oct 2026): it keeps the streak, sends
 * no reminder or nudge and counts as no miss. A date in the past can be
 * skipped too, which turns a Missed date into Skipped. A date with a workout
 * on it, finished or started, can't be skipped.
 */
export async function skipScheduled(
  actorId: string,
  scheduledId: string,
  skipped: boolean,
  database: FitnessDb = db
) {
  const [row] = await database
    .select()
    .from(fitnessScheduledWorkouts)
    .where(eq(fitnessScheduledWorkouts.id, scheduledId))
    .limit(1)
  if (!row) throw new Error(FITNESS_ERRORS.scheduledNotFound)
  await programFor(actorId, row.programId, database, { forChange: true })
  if (row.status === "done" || row.workoutId) throw new Error(FITNESS_ERRORS.skipHasWorkout)
  await database
    .update(fitnessScheduledWorkouts)
    .set({ skippedAt: skipped ? now() : null })
    .where(eq(fitnessScheduledWorkouts.id, scheduledId))
}

/**
 * Pauses a program for a holiday or an injury. Planned days inside the pause
 * leave the calendar and the plan carries on after it, so a week away shows no
 * missed days, sends no reminders and drops no weights.
 */
export async function pauseProgram(
  actorId: string,
  programId: string,
  input: { fromDay: Day; untilDay: Day | null; reason: "holiday" | "injury" | "other" },
  database: FitnessDb = db
) {
  const program = await programFor(actorId, programId, database, { forChange: true })
  const today = await todayFor(program.userId, database)
  if (await currentPause(programId, today, database)) throw new Error(FITNESS_ERRORS.alreadyPaused)
  if (input.untilDay && input.untilDay < input.fromDay) throw new Error(FITNESS_ERRORS.pauseOrder)
  const fromDay = input.fromDay < today ? today : input.fromDay
  await database.insert(fitnessPauses).values({
    id: uuid(),
    programId,
    fromDay,
    untilDay: input.untilDay,
    reason: input.reason,
    createdAt: now(),
  })
  await database
    .delete(fitnessScheduledWorkouts)
    .where(
      and(
        eq(fitnessScheduledWorkouts.programId, programId),
        eq(fitnessScheduledWorkouts.status, "planned"),
        // A workout already started inside the pause keeps its date.
        isNull(fitnessScheduledWorkouts.workoutId),
        gte(fitnessScheduledWorkouts.day, fromDay),
        ...(input.untilDay ? [lte(fitnessScheduledWorkouts.day, input.untilDay)] : [])
      )
    )
  await rescheduleFromToday(programId, today, database)
}

/** Ends the pause today. The calendar carries on from where it stopped. */
export async function resumeProgram(actorId: string, programId: string, database: FitnessDb = db) {
  const program = await programFor(actorId, programId, database, { forChange: true })
  const today = await todayFor(program.userId, database)
  const pause = await currentPause(programId, today, database)
  if (!pause) throw new Error(FITNESS_ERRORS.notPaused)
  if (pause.fromDay >= today) {
    await database.delete(fitnessPauses).where(eq(fitnessPauses.id, pause.id))
  } else {
    await database
      .update(fitnessPauses)
      .set({ untilDay: addDays(today, -1) })
      .where(eq(fitnessPauses.id, pause.id))
  }
  await rescheduleFromToday(programId, today, database)
}

/** Every pause a person's programs have had, for the streak. */
export async function pausesFor(userId: string, database: FitnessDb = db, programId?: string) {
  return database
    .select({ fromDay: fitnessPauses.fromDay, untilDay: fitnessPauses.untilDay })
    .from(fitnessPauses)
    .innerJoin(fitnessPrograms, eq(fitnessPrograms.id, fitnessPauses.programId))
    .where(and(eq(fitnessPrograms.userId, userId), programId ? eq(fitnessPauses.programId, programId) : undefined))
}
