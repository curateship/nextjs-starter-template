import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm"

import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import {
  EXERCISE_CATALOG,
  type Equipment,
  type Movement,
  type Muscle,
} from "@/lib/fitness/exercise-catalog"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import type { FitnessDb } from "@/server/fitness/access"
import {
  fitnessAvoidedExercises,
  fitnessExercises,
  fitnessWorkoutSets,
} from "@/server/fitness/schema"

export type ExerciseRow = typeof fitnessExercises.$inferSelect

export type Exercise = {
  id: string
  slug: string | null
  name: string
  muscles: Muscle[]
  equipment: Equipment[]
  movement: Movement
  /** The routine type it belongs to, such as `strength`. */
  routineType: string
  isBodyweight: boolean
  pictureUrl: string | null
  builtIn: boolean
  /** On the person's pain list, so swaps never offer it. */
  avoided: boolean
  avoidNote: string
}

const seeded = new WeakSet<object>()

/**
 * Writes the built-in lifts from `EXERCISE_CATALOG` into the table, matched by
 * slug, so the list in code stays the one place they are written. Runs once
 * per database handle per process.
 */
async function ensureBuiltInExercises(database: FitnessDb = db) {
  if (seeded.has(database)) return
  const at = now()
  const rows = EXERCISE_CATALOG.map((exercise) => ({
    id: uuid(),
    slug: exercise.slug,
    ownerUserId: null,
    name: exercise.name,
    muscles: [...exercise.muscles],
    equipment: [...exercise.equipment],
    movement: exercise.movement,
    routineType: "strength",
    isBodyweight: exercise.bodyweight ?? false,
    pictureUrl: null,
    createdAt: at,
    updatedAt: at,
  }))
  await database
    .insert(fitnessExercises)
    .values(rows)
    .onConflictDoUpdate({
      target: fitnessExercises.slug,
      set: {
        name: sql`excluded.name`,
        muscles: sql`excluded.muscles`,
        equipment: sql`excluded.equipment`,
        movement: sql`excluded.movement`,
        isBodyweight: sql`excluded.is_bodyweight`,
      },
    })
  seeded.add(database)
}

function toExercise(row: ExerciseRow, avoided?: { note: string }): Exercise {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    muscles: row.muscles as Muscle[],
    equipment: row.equipment as Equipment[],
    movement: row.movement as Movement,
    routineType: row.routineType,
    isBodyweight: row.isBodyweight,
    pictureUrl: row.pictureUrl,
    builtIn: row.slug !== null,
    avoided: Boolean(avoided),
    avoidNote: avoided?.note ?? "",
  }
}

/**
 * Every built-in lift plus the person's own, by name. With a routine type,
 * only that type's: a program only ever offers its own type's lifts.
 */
export async function listExercises(
  userId: string,
  database: FitnessDb = db,
  routineType?: string
): Promise<Exercise[]> {
  await ensureBuiltInExercises(database)
  const rows = await database
    .select()
    .from(fitnessExercises)
    .where(
      and(
        or(isNotNull(fitnessExercises.slug), eq(fitnessExercises.ownerUserId, userId)),
        routineType ? eq(fitnessExercises.routineType, routineType) : undefined
      )
    )
    .orderBy(asc(sql`lower(${fitnessExercises.name})`))
  const avoided = await avoidedFor(userId, database)
  return rows.map((row) => toExercise(row, avoided.get(row.id)))
}

async function avoidedFor(userId: string, database: FitnessDb) {
  const rows = await database
    .select({ exerciseId: fitnessAvoidedExercises.exerciseId, note: fitnessAvoidedExercises.note })
    .from(fitnessAvoidedExercises)
    .where(eq(fitnessAvoidedExercises.userId, userId))
  return new Map(rows.map((row) => [row.exerciseId, { note: row.note }]))
}

/** A lift the person may use: built in, or their own. */
export async function exerciseFor(
  userId: string,
  exerciseId: string,
  database: FitnessDb = db
): Promise<ExerciseRow> {
  await ensureBuiltInExercises(database)
  const [row] = await database
    .select()
    .from(fitnessExercises)
    .where(
      and(
        eq(fitnessExercises.id, exerciseId),
        or(isNotNull(fitnessExercises.slug), eq(fitnessExercises.ownerUserId, userId))
      )
    )
    .limit(1)
  if (!row) throw new Error(FITNESS_ERRORS.exerciseNotFound)
  return row
}

/**
 * A lift a program may use: the person's to use, and of the program's own
 * routine type. The screens only offer those, and this holds the line on the
 * server too, for when a second routine type ships.
 */
export async function exerciseForRoutine(
  userId: string,
  exerciseId: string,
  routineType: string,
  database: FitnessDb = db
): Promise<ExerciseRow> {
  const row = await exerciseFor(userId, exerciseId, database)
  if (row.routineType !== routineType) throw new Error(FITNESS_ERRORS.wrongRoutineType)
  return row
}

/** Built-in lifts by slug, for templates and imports. */
export async function builtInBySlug(database: FitnessDb = db) {
  await ensureBuiltInExercises(database)
  const rows = await database
    .select()
    .from(fitnessExercises)
    .where(isNotNull(fitnessExercises.slug))
  return new Map(rows.map((row) => [row.slug as string, row]))
}

type ExerciseInput = {
  name: string
  routineType: string
  muscles: Muscle[]
  equipment: Equipment[]
  movement: Movement
  isBodyweight: boolean
  pictureUrl: string | null
}

export async function createExercise(
  userId: string,
  input: ExerciseInput,
  database: FitnessDb = db
): Promise<Exercise> {
  const name = input.name.trim()
  if (!name) throw new Error(FITNESS_ERRORS.nameNeeded)
  const at = now()
  const [row] = await database
    .insert(fitnessExercises)
    .values({
      id: uuid(),
      slug: null,
      ownerUserId: userId,
      ...input,
      name,
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  return toExercise(row)
}

async function ownExercise(userId: string, exerciseId: string, database: FitnessDb) {
  const row = await exerciseFor(userId, exerciseId, database)
  if (row.slug !== null) throw new Error(FITNESS_ERRORS.builtInExercise)
  return row
}

export async function updateExercise(
  userId: string,
  exerciseId: string,
  input: ExerciseInput,
  database: FitnessDb = db
): Promise<Exercise> {
  await ownExercise(userId, exerciseId, database)
  const name = input.name.trim()
  if (!name) throw new Error(FITNESS_ERRORS.nameNeeded)
  const [row] = await database
    .update(fitnessExercises)
    .set({ ...input, name, updatedAt: now() })
    .where(eq(fitnessExercises.id, exerciseId))
    .returning()
  return toExercise(row)
}

export async function deleteExercise(userId: string, exerciseId: string, database: FitnessDb = db) {
  await ownExercise(userId, exerciseId, database)
  const [logged] = await database
    .select({ id: fitnessWorkoutSets.id })
    .from(fitnessWorkoutSets)
    .where(eq(fitnessWorkoutSets.exerciseId, exerciseId))
    .limit(1)
  if (logged) throw new Error(FITNESS_ERRORS.exerciseHasSets)
  await database.delete(fitnessExercises).where(eq(fitnessExercises.id, exerciseId))
}

/**
 * Deletes several of the person's own lifts in one go. A built-in lift, one
 * that isn't theirs, or one with logged sets is kept and counted as kept.
 */
export async function deleteExercises(
  userId: string,
  exerciseIds: readonly string[],
  database: FitnessDb = db
): Promise<{ done: string[]; kept: string[] }> {
  const done: string[] = []
  const kept: string[] = []
  for (const exerciseId of exerciseIds) {
    try {
      await deleteExercise(userId, exerciseId, database)
      done.push(exerciseId)
    } catch {
      kept.push(exerciseId)
    }
  }
  return { done, kept }
}

/** Marks a lift as painful. Swaps stop offering it until it is taken off. */
export async function avoidExercise(
  userId: string,
  exerciseId: string,
  note: string,
  database: FitnessDb = db
) {
  await exerciseFor(userId, exerciseId, database)
  await database
    .insert(fitnessAvoidedExercises)
    .values({ userId, exerciseId, note: note.trim().slice(0, 300), createdAt: now() })
    .onConflictDoUpdate({
      target: [fitnessAvoidedExercises.userId, fitnessAvoidedExercises.exerciseId],
      set: { note: note.trim().slice(0, 300) },
    })
}

export async function stopAvoidingExercise(
  userId: string,
  exerciseId: string,
  database: FitnessDb = db
) {
  await database
    .delete(fitnessAvoidedExercises)
    .where(
      and(
        eq(fitnessAvoidedExercises.userId, userId),
        eq(fitnessAvoidedExercises.exerciseId, exerciseId)
      )
    )
}

/**
 * Lifts that can stand in for `exerciseId`: they work the same main muscle,
 * need only equipment the person has (when they said what they have), and are
 * not on their pain list. Same movement first, then by name.
 */
export async function swapsFor(
  userId: string,
  exerciseId: string,
  equipmentOnHand: readonly string[],
  database: FitnessDb = db
): Promise<Exercise[]> {
  const original = await exerciseFor(userId, exerciseId, database)
  const main = original.muscles[0]
  if (!main) return []
  const all = await listExercises(userId, database, original.routineType)
  const have = new Set(equipmentOnHand)
  return all
    .filter((exercise) => exercise.id !== original.id)
    .filter((exercise) => exercise.muscles[0] === main)
    .filter((exercise) => !exercise.avoided)
    .filter(
      (exercise) =>
        have.size === 0 ||
        exercise.equipment.every((item) => item === "bodyweight" || have.has(item))
    )
    .sort((a, b) => {
      const sameA = a.movement === original.movement ? 0 : 1
      const sameB = b.movement === original.movement ? 0 : 1
      return sameA - sameB || a.name.localeCompare(b.name)
    })
}

/** Names for a set of exercise ids, for screens that list logged lifts. */
export async function exercisesById(ids: readonly string[], database: FitnessDb = db) {
  if (ids.length === 0) return new Map<string, ExerciseRow>()
  const rows = await database
    .select()
    .from(fitnessExercises)
    .where(inArray(fitnessExercises.id, [...new Set(ids)]))
  return new Map(rows.map((row) => [row.id, row]))
}
