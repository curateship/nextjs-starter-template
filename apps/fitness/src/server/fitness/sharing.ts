import { randomBytes } from "node:crypto"

import { and, asc, eq, inArray } from "drizzle-orm"

import { weekOrder } from "@/lib/fitness/dates"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import type { RoutineTypeId } from "@/lib/fitness/routine-types"
import { routineTypeLabel } from "@/lib/fitness/routine-types"
import { TEMPLATE_START_SHARE } from "@/lib/fitness/templates"
import { roundToStep } from "@/lib/fitness/weights"
import { uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { canReachPerson, programFor, type FitnessDb } from "@/server/fitness/access"
import { rescheduleFromToday, todayFor } from "@/server/fitness/calendar"
import { exercisesById } from "@/server/fitness/exercises"
import { preferencesFor } from "@/server/fitness/profile"
import { createProgram } from "@/server/fitness/programs"
import { loadBaseline } from "@/server/fitness/week"
import {
  fitnessCalisthenicsSettings,
  fitnessWeekDays,
  fitnessDayExercises,
  fitnessPrograms,
  fitnessStrengthSettings,
} from "@/server/fitness/schema"

/**
 * Sharing a program as a public page at `/r/<code>`. The page shows the
 * program's days and lifts with sets, reps and rest. It never shows the
 * owner's name, weights, workouts, starting data or photos.
 */

function newCode() {
  return randomBytes(9).toString("base64url")
}

export async function setProgramShared(
  actorId: string,
  programId: string,
  shared: boolean,
  database: FitnessDb = db
): Promise<{ shareCode: string | null }> {
  const program = await programFor(actorId, programId, database, { forChange: true })
  // Sharing publishes the program, so it is the owner's call alone; a coach
  // who can change a client's program still can't make it public.
  if (program.userId !== actorId) throw new Error(FITNESS_ERRORS.programNotFound)
  const [current] = await database
    .select({ shareSlug: fitnessStrengthSettings.shareSlug })
    .from(fitnessStrengthSettings)
    .where(eq(fitnessStrengthSettings.programId, programId))
    .limit(1)
  if (shared && current?.shareSlug) return { shareCode: current.shareSlug }
  const shareCode = shared ? newCode() : null
  await database
    .update(fitnessStrengthSettings)
    .set({ shareSlug: shareCode })
    .where(eq(fitnessStrengthSettings.programId, programId))
  return { shareCode }
}

export type SharedProgram = {
  code: string
  name: string
  routineLabel: string
  days: {
    /** 0 is Sunday. Weekdays not listed are rest days. */
    weekday: number
    name: string
    exercises: { name: string; sets: number; reps: number; restSeconds: number; superset: boolean }[]
  }[]
}

export async function loadSharedProgram(code: string, database: FitnessDb = db): Promise<SharedProgram | null> {
  if (!/^[A-Za-z0-9_-]{8,24}$/.test(code)) return null
  const [row] = await database
    .select({ program: fitnessPrograms, strength: fitnessStrengthSettings })
    .from(fitnessStrengthSettings)
    .innerJoin(fitnessPrograms, eq(fitnessPrograms.id, fitnessStrengthSettings.programId))
    .where(eq(fitnessStrengthSettings.shareSlug, code))
    .limit(1)
  if (!row || row.program.archivedAt) return null
  const days = (
    await database.select().from(fitnessWeekDays).where(eq(fitnessWeekDays.programId, row.program.id))
  ).sort((a, b) => weekOrder(a.weekday) - weekOrder(b.weekday))
  const exercises = days.length
    ? await database
        .select()
        .from(fitnessDayExercises)
        .where(inArray(fitnessDayExercises.dayId, days.map((day) => day.id)))
        .orderBy(asc(fitnessDayExercises.position))
    : []
  const names = await exercisesById(exercises.map((exercise) => exercise.exerciseId), database)
  return {
    code,
    name: row.program.name,
    routineLabel: routineTypeLabel(row.program.routineType),
    days: days.map((day) => ({
      weekday: day.weekday,
      name: day.name,
      exercises: exercises
        .filter((exercise) => exercise.dayId === day.id)
        .map((exercise) => ({
          name: names.get(exercise.exerciseId)?.name ?? "Exercise",
          sets: exercise.sets,
          reps: exercise.reps,
          restSeconds: exercise.restSeconds,
          superset: exercise.groupKey !== null,
        })),
    })),
  }
}

/**
 * Copies a shared program into the visitor's own account as a new program.
 * Weights start empty, because the owner's weights are theirs. A lift that is
 * the owner's own (not built in) is left out, because it lives in the owner's
 * own library.
 */
export async function copySharedProgram(userId: string, code: string, database: FitnessDb = db) {
  const shared = await loadSharedProgram(code, database)
  if (!shared) throw new Error(FITNESS_ERRORS.shareOff)
  const [source] = await database
    .select({ programId: fitnessStrengthSettings.programId, routineType: fitnessPrograms.routineType })
    .from(fitnessStrengthSettings)
    .innerJoin(fitnessPrograms, eq(fitnessPrograms.id, fitnessStrengthSettings.programId))
    .where(eq(fitnessStrengthSettings.shareSlug, code))
    .limit(1)
  const { id } = await createProgram(userId, userId, { name: shared.name, routineType: source.routineType as RoutineTypeId }, database)
  await copyWeek(source.programId, id, () => 0, database)
  await rescheduleFromToday(id, await todayFor(userId, database), database)
  return { id }
}

/**
 * Copies one of a coach's own programs into a client's account in one step
 * (Tyler, 21 Oct 2026). The week, its rules and its length come too;
 * pictures, starting data and history stay behind. Each heavy lift starts at
 * 75 out of 100 of the client's best lift in their active program's starting
 * data, the way templates start, or empty without one ("Start from the
 * client's best lifts"). A lift the coach made themselves lives in the coach's
 * library, so it's left out and named in the answer.
 */
export async function copyProgramToClient(
  coachId: string,
  programId: string,
  clientId: string,
  database: FitnessDb = db
): Promise<{ id: string; leftOut: string[] }> {
  const source = await programFor(coachId, programId, database)
  if (source.userId !== coachId) throw new Error(FITNESS_ERRORS.copyNeedsOwnProgram)
  if (clientId === coachId || !(await canReachPerson(coachId, clientId, database))) {
    throw new Error(FITNESS_ERRORS.notYourClient)
  }
  // All of it or none of it: a copy that fails halfway leaves no half-built program.
  return database.transaction(async (tx) => {
    const { id } = await createProgram(
      coachId,
      clientId,
      { name: source.name, routineType: source.routineType as RoutineTypeId, weeks: source.weeks },
      tx
    )
    const [rules] = await tx
      .select()
      .from(fitnessStrengthSettings)
      .where(eq(fitnessStrengthSettings.programId, source.id))
      .limit(1)
    if (rules) {
      const { programId: _from, startDay: _start, scheduledThrough: _through, shareSlug: _share, ...kept } = rules
      await tx.update(fitnessStrengthSettings).set(kept).where(eq(fitnessStrengthSettings.programId, id))
    }
    const [steps] = await tx
      .select()
      .from(fitnessCalisthenicsSettings)
      .where(eq(fitnessCalisthenicsSettings.programId, source.id))
      .limit(1)
    if (steps) {
      await tx
        .insert(fitnessCalisthenicsSettings)
        .values({ ...steps, programId: id })
        .onConflictDoUpdate({
          target: fitnessCalisthenicsSettings.programId,
          set: { autoStepUp: steps.autoStepUp, sessionsToStep: steps.sessionsToStep },
        })
    }
    const best = await clientBestLifts(clientId, tx)
    const profile = await preferencesFor(clientId, tx)
    const leftOut = await copyWeek(
      source.id,
      id,
      (exerciseId) => {
        const lift = best.get(exerciseId)
        return lift ? roundToStep(lift * TEMPLATE_START_SHARE, profile.stepKg) : 0
      },
      tx
    )
  await rescheduleFromToday(id, await todayFor(clientId, tx), tx)
    return { id, leftOut }
  })
}

/** The client's estimated one-rep max for each lift in their active program's starting data. */
async function clientBestLifts(clientId: string, database: FitnessDb) {
  const [active] = await database
    .select({ id: fitnessPrograms.id })
    .from(fitnessPrograms)
    .where(and(eq(fitnessPrograms.userId, clientId), eq(fitnessPrograms.isActive, true)))
    .limit(1)
  const best = new Map<string, number>()
  if (!active) return best
  for (const lift of (await loadBaseline(active.id, database)).lifts) best.set(lift.exerciseId, lift.oneRepMaxKg)
  return best
}

/**
 * Copies a program's week into another program: the same workout on the same
 * weekday, with the same lifts, sets, reps, rest and supersets. Only built-in
 * lifts travel, because a lift someone made lives in their own library; the
 * names of the ones left out come back. A bodyweight lift's weight is only
 * what hangs from the belt, so it starts at 0.
 */
async function copyWeek(
  fromProgramId: string,
  toProgramId: string,
  weightFor: (exerciseId: string) => number,
  database: FitnessDb
): Promise<string[]> {
  const leftOut = new Set<string>()
  const days = await database.select().from(fitnessWeekDays).where(eq(fitnessWeekDays.programId, fromProgramId))
  for (const day of days) {
    const dayId = uuid()
    await database.insert(fitnessWeekDays).values({ id: dayId, programId: toProgramId, name: day.name, weekday: day.weekday })
    const exercises = await database
      .select()
      .from(fitnessDayExercises)
      .where(eq(fitnessDayExercises.dayId, day.id))
      .orderBy(asc(fitnessDayExercises.position))
    const names = await exercisesById(exercises.map((exercise) => exercise.exerciseId), database)
    for (const exercise of exercises) {
      const found = names.get(exercise.exerciseId)
      if (found && !found.slug) leftOut.add(found.name)
    }
    const groups = new Map<string, string>()
    const rows = exercises
      .filter((exercise) => names.get(exercise.exerciseId)?.slug)
      .map((exercise) => {
        const groupKey = exercise.groupKey ? (groups.get(exercise.groupKey) ?? uuid()) : null
        if (exercise.groupKey && groupKey) groups.set(exercise.groupKey, groupKey)
        return {
          id: uuid(),
          dayId: dayId,
          exerciseId: exercise.exerciseId,
          position: exercise.position,
          sets: exercise.sets,
          reps: exercise.repsMin ?? exercise.reps,
          repsMin: exercise.repsMin,
          repsMax: exercise.repsMax,
          weightKg: names.get(exercise.exerciseId)?.isBodyweight ? 0 : weightFor(exercise.exerciseId),
          restSeconds: exercise.restSeconds,
          groupKey,
          missStreak: 0,
          goodStreak: 0,
        }
      })
    if (rows.length) await database.insert(fitnessDayExercises).values(rows)
  }
  return [...leftOut]
}
