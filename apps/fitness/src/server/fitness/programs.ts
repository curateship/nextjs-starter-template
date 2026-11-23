import { and, asc, desc, eq, gt, gte, inArray, isNull, ne, sql } from "drizzle-orm"

import { addDays, weekStart } from "@/lib/fitness/dates"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { programEndDay } from "@/lib/fitness/schedule"
import { isLiveRoutineType, type RoutineTypeId } from "@/lib/fitness/routine-types"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { canReachPerson, programFor, type FitnessDb } from "@/server/fitness/access"
import { exerciseFor } from "@/server/fitness/exercises"
import { hasTickedSet } from "@/server/fitness/workouts"
import { DEFAULT_CALISTHENICS, type BaselineChange } from "@/server/fitness/week"
import { currentPause, ensureScheduled, rescheduleFromToday, todayFor } from "@/server/fitness/calendar"
import {
  fitnessBaselineLifts,
  fitnessBaselines,
  fitnessCalisthenicsSettings,
  fitnessWeekDays,
  fitnessPrograms,
  fitnessScheduledWorkouts,
  fitnessStrengthSettings,
  fitnessWorkouts,
} from "@/server/fitness/schema"
import { isOwnedImageUrl } from "@/server/media/library"
import { customShellUsers } from "@/server/schema"

export type ProgramSummary = {
  id: string
  name: string
  routineType: string
  isActive: boolean
  archived: boolean
  workoutDays: number
  nextWorkout: { scheduledId: string; day: string; dayName: string } | null
  paused: boolean
  builtBy: string | null
  createdAt: string
}

/** A person's programs, active one first, archived ones last. */
export async function listPrograms(
  actorId: string,
  personId: string,
  database: FitnessDb = db
): Promise<ProgramSummary[]> {
  const programs = await database
    .select({
      program: fitnessPrograms,
      builtBy: customShellUsers.name,
    })
    .from(fitnessPrograms)
    .leftJoin(customShellUsers, eq(customShellUsers.id, fitnessPrograms.builtByUserId))
    .where(eq(fitnessPrograms.userId, personId))
    .orderBy(desc(fitnessPrograms.isActive), asc(sql`${fitnessPrograms.archivedAt} is not null`), desc(fitnessPrograms.createdAt))
  if (!(await canReachPerson(actorId, personId, database))) throw new Error(FITNESS_ERRORS.notYourClient)
  if (programs.length === 0) return []
  const ids = programs.map((row) => row.program.id)
  const counts = await database
    .select({ programId: fitnessWeekDays.programId, count: sql<number>`count(*)::int` })
    .from(fitnessWeekDays)
    .where(inArray(fitnessWeekDays.programId, ids))
    .groupBy(fitnessWeekDays.programId)
  const today = await todayFor(personId, database)
  // A program's calendar is filled as it is read, so the list fills each one
  // first: otherwise "next workout" is empty until its dashboard is opened.
  for (const { program } of programs) {
    if (!program.archivedAt) await ensureScheduled(program.id, today, database)
  }
  const upcoming = await database
    .select({
      scheduledId: fitnessScheduledWorkouts.id,
      programId: fitnessScheduledWorkouts.programId,
      day: fitnessScheduledWorkouts.day,
      dayName: fitnessWeekDays.name,
    })
    .from(fitnessScheduledWorkouts)
    .innerJoin(fitnessWeekDays, eq(fitnessWeekDays.id, fitnessScheduledWorkouts.dayId))
    .where(
      and(
        inArray(fitnessScheduledWorkouts.programId, ids),
        eq(fitnessScheduledWorkouts.status, "planned"),
        gte(fitnessScheduledWorkouts.day, today)
      )
    )
    .orderBy(asc(fitnessScheduledWorkouts.day))
  const result: ProgramSummary[] = []
  for (const { program, builtBy } of programs) {
    const next = upcoming.find((row) => row.programId === program.id)
    result.push({
      id: program.id,
      name: program.name,
      routineType: program.routineType,
      isActive: program.isActive,
      archived: Boolean(program.archivedAt),
      workoutDays: counts.find((row) => row.programId === program.id)?.count ?? 0,
      nextWorkout: next ? { scheduledId: next.scheduledId, day: next.day, dayName: next.dayName } : null,
      paused: Boolean(await currentPause(program.id, today, database)),
      builtBy: program.builtByUserId && program.builtByUserId !== personId ? builtBy : null,
      createdAt: program.createdAt.toISOString(),
    })
  }
  return result
}

type NewProgramInput = {
  name: string
  routineType: RoutineTypeId
  /** How many weeks it runs; empty runs for good. */
  weeks?: number | null
  /** What the person brings on day one, entered in the New program window. */
  baseline?: Omit<BaselineChange, "equipment"> & { equipment?: string[] }
  lifts?: { exerciseId: string; weightKg: number; reps: number }[]
}

/**
 * Makes a program with its routine type's own settings and the starting data
 * from the New program window, all at once. A person's first program is their
 * active one. The week starts empty: every day a rest day until one is made a
 * workout.
 */
export async function createProgram(
  actorId: string,
  personId: string,
  input: NewProgramInput,
  database: FitnessDb = db
) {
  const name = input.name.trim()
  if (!name) throw new Error(FITNESS_ERRORS.nameNeeded)
  if (!isLiveRoutineType(input.routineType)) throw new Error(FITNESS_ERRORS.routineTypeNotLive)
  if (!(await canReachPerson(actorId, personId, database))) throw new Error(FITNESS_ERRORS.notYourClient)
  const today = await todayFor(personId, database)
  const at = now()
  const id = uuid()
  const [existing] = await database
    .select({ id: fitnessPrograms.id })
    .from(fitnessPrograms)
    .where(and(eq(fitnessPrograms.userId, personId), eq(fitnessPrograms.isActive, true)))
    .limit(1)
  await database.insert(fitnessPrograms).values({
    id,
    userId: personId,
    name,
    routineType: input.routineType,
    isActive: !existing,
    archivedAt: null,
    builtByUserId: actorId,
    weeks: input.weeks ?? null,
    createdAt: at,
    updatedAt: at,
  })
  await database.insert(fitnessStrengthSettings).values({
    programId: id,
    startDay: today,
    scheduledThrough: null,
    autoIncrease: true,
    increaseKg: 2.5,
    missesBeforeDrop: 3,
    dropPercent: 10,
    blockWeeks: 0,
    lightWeekPercent: 60,
    shareSlug: null,
  })
  if (input.routineType === "calisthenics") {
    await database.insert(fitnessCalisthenicsSettings).values({ programId: id, ...DEFAULT_CALISTHENICS })
  }
  await database
    .insert(fitnessBaselines)
    .values({ ...input.baseline, programId: id, equipment: input.baseline?.equipment ?? [], updatedAt: at })
  for (const lift of input.lifts ?? []) {
    const exercise = await exerciseFor(personId, lift.exerciseId, database)
    if (exercise.routineType !== input.routineType) continue
    await database
      .insert(fitnessBaselineLifts)
      .values({ programId: id, ...lift })
      .onConflictDoNothing()
  }
  return { id }
}

/**
 * Sets how many weeks the program runs, or clears it so it runs for good.
 * Planned dates past the new last day leave the calendar, and the week is
 * laid out again from today so a longer program fills its new weeks.
 */
export async function setProgramWeeks(
  actorId: string,
  programId: string,
  weeks: number | null,
  database: FitnessDb = db
) {
  const program = await programFor(actorId, programId, database, { forChange: true })
  const today = await todayFor(program.userId, database)
  await database.update(fitnessPrograms).set({ weeks, updatedAt: now() }).where(eq(fitnessPrograms.id, programId))
  const [strength] = await database
    .select({ startDay: fitnessStrengthSettings.startDay })
    .from(fitnessStrengthSettings)
    .where(eq(fitnessStrengthSettings.programId, programId))
    .limit(1)
  const end = strength ? programEndDay(strength.startDay, weeks) : null
  if (end) {
    await database
      .delete(fitnessScheduledWorkouts)
      .where(
        and(
          eq(fitnessScheduledWorkouts.programId, programId),
          eq(fitnessScheduledWorkouts.status, "planned"),
          isNull(fitnessScheduledWorkouts.workoutId),
          gt(fitnessScheduledWorkouts.day, end)
        )
      )
  }
  await rescheduleFromToday(programId, today, database)
}

/**
 * Runs a finished program again: week 1 starts on the coming Monday, or
 * today when today is a Monday, with the weights where they are now.
 * Training blocks count again from the same day.
 */
export async function runProgramAgain(actorId: string, programId: string, database: FitnessDb = db) {
  const program = await programFor(actorId, programId, database, { forChange: true })
  const today = await todayFor(program.userId, database)
  const [strength] = await database
    .select({ startDay: fitnessStrengthSettings.startDay })
    .from(fitnessStrengthSettings)
    .where(eq(fitnessStrengthSettings.programId, programId))
    .limit(1)
  const end = strength ? programEndDay(strength.startDay, program.weeks) : null
  if (!end || end >= today) throw new Error(FITNESS_ERRORS.programNotOver)
  const monday = weekStart(today) === today ? today : addDays(weekStart(today), 7)
  await database
    .update(fitnessStrengthSettings)
    .set({ startDay: monday })
    .where(eq(fitnessStrengthSettings.programId, programId))
  await rescheduleFromToday(programId, today, database)
}

export async function renameProgram(actorId: string, programId: string, name: string, database: FitnessDb = db) {
  await programFor(actorId, programId, database)
  const trimmed = name.trim()
  if (!trimmed) throw new Error(FITNESS_ERRORS.nameNeeded)
  await database
    .update(fitnessPrograms)
    .set({ name: trimmed, updatedAt: now() })
    .where(eq(fitnessPrograms.id, programId))
}

/**
 * Sets or clears the program's banner and its square picture. A picture must
 * be one the person changing it uploaded, the same rule as a profile photo,
 * so a program never shows an outside address. A field left out is kept.
 */
export async function setProgramPictures(
  actorId: string,
  programId: string,
  pictures: { bannerUrl?: string | null; avatarUrl?: string | null },
  database: FitnessDb = db
) {
  await programFor(actorId, programId, database, { forChange: true })
  for (const url of [pictures.bannerUrl, pictures.avatarUrl]) {
    if (url && !(await isOwnedImageUrl(actorId, url, database))) throw new Error(FITNESS_ERRORS.pictureNotYours)
  }
  await database
    .update(fitnessPrograms)
    .set({ ...pictures, updatedAt: now() })
    .where(eq(fitnessPrograms.id, programId))
}

/**
 * One active program per person: the one the home dashboard, reminders and
 * the weekly goal follow. Making another active turns the old one off.
 */
export async function setActiveProgram(actorId: string, programId: string, database: FitnessDb = db) {
  const program = await programFor(actorId, programId, database, { forChange: true })
  await database.transaction(async (tx) => {
    await tx
      .update(fitnessPrograms)
      .set({ isActive: false })
      .where(and(eq(fitnessPrograms.userId, program.userId), ne(fitnessPrograms.id, programId)))
    await tx
      .update(fitnessPrograms)
      .set({ isActive: true, updatedAt: now() })
      .where(eq(fitnessPrograms.id, programId))
  })
}

/** Archiving keeps every logged workout and takes the program off the calendar and reminders. */
export async function setProgramArchived(
  actorId: string,
  programId: string,
  archived: boolean,
  database: FitnessDb = db
) {
  await programFor(actorId, programId, database)
  await database
    .update(fitnessPrograms)
    .set({ archivedAt: archived ? now() : null, isActive: archived ? false : undefined, updatedAt: now() })
    .where(eq(fitnessPrograms.id, programId))
}

/**
 * Deletes the program, its plan and its calendar. Logged workouts stay in
 * History and keep counting toward records and charts.
 */
export async function deleteProgram(actorId: string, programId: string, database: FitnessDb = db) {
  await programFor(actorId, programId, database)
  await database.delete(fitnessPrograms).where(eq(fitnessPrograms.id, programId))
}

/** Deletes several programs in one go; one the actor can't reach is kept and counted. */
export async function deletePrograms(actorId: string, programIds: string[], database: FitnessDb = db) {
  const done: string[] = []
  const kept: string[] = []
  for (const programId of programIds) {
    try {
      await deleteProgram(actorId, programId, database)
      done.push(programId)
    } catch {
      kept.push(programId)
    }
  }
  return { done, kept }
}

/**
 * The program's own unfinished workout, newest first, so its dashboard
 * offers to pick it up. A workout left open in another program stays in that
 * program's dashboard.
 */
export async function openProgramWorkout(programId: string, database: FitnessDb = db) {
  const [row] = await database
    .select({ id: fitnessWorkouts.id, name: fitnessWorkouts.name, day: fitnessWorkouts.day })
    .from(fitnessWorkouts)
    .where(and(eq(fitnessWorkouts.programId, programId), isNull(fitnessWorkouts.finishedAt), hasTickedSet(database)))
    .orderBy(desc(fitnessWorkouts.startedAt))
    .limit(1)
  return row ?? null
}
