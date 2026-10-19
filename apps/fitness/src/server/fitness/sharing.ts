import { randomBytes } from "node:crypto"

import { asc, eq, inArray } from "drizzle-orm"

import { weekOrder } from "@/lib/fitness/dates"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import type { RoutineTypeId } from "@/lib/fitness/routine-types"
import { routineTypeLabel } from "@/lib/fitness/routine-types"
import { uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { programFor, type FitnessDb } from "@/server/fitness/access"
import { rescheduleFromToday, todayFor } from "@/server/fitness/calendar"
import { exercisesById } from "@/server/fitness/exercises"
import { createProgram } from "@/server/fitness/programs"
import {
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
 * the owner's own (not built in) is copied by pointing at the built-in one of
 * the same slug when there is one, and otherwise left out.
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
  const days = await database.select().from(fitnessWeekDays).where(eq(fitnessWeekDays.programId, source.programId))
  for (const day of days) {
    const dayId = uuid()
    await database.insert(fitnessWeekDays).values({ id: dayId, programId: id, name: day.name, weekday: day.weekday })
    const exercises = await database
      .select()
      .from(fitnessDayExercises)
      .where(eq(fitnessDayExercises.dayId, day.id))
      .orderBy(asc(fitnessDayExercises.position))
    const names = await exercisesById(exercises.map((exercise) => exercise.exerciseId), database)
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
          reps: exercise.reps,
          weightKg: 0,
          restSeconds: exercise.restSeconds,
          groupKey,
          missStreak: 0,
        }
      })
    if (rows.length) await database.insert(fitnessDayExercises).values(rows)
  }
  await rescheduleFromToday(id, await todayFor(userId, database), database)
  return { id }
}
