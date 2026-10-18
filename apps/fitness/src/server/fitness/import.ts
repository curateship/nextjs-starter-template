import { and, eq, inArray } from "drizzle-orm"

import type { Equipment, Movement, Muscle } from "@/lib/fitness/exercise-catalog"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { matchCatalogSlug, parseWorkoutExport, type ParsedImport } from "@/lib/fitness/import-parse"
import type { WeightUnit } from "@/lib/fitness/weights"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { programFor, type FitnessDb } from "@/server/fitness/access"
import { builtInBySlug, createExercise, exerciseFor, listExercises } from "@/server/fitness/exercises"
import { fitnessWorkoutSets, fitnessWorkouts } from "@/server/fitness/schema"

const IMPORT_MAX_BYTES = 5 * 1024 * 1024
/** One import may add at most this many lifts of the person's own. */
const IMPORT_MAX_NEW_LIFTS = 300

export type ImportPreview = {
  source: ParsedImport["source"]
  workouts: number
  alreadyImported: number
  sets: number
  firstDay: string
  lastDay: string
  /** Each lift name in the file and the library lift it was matched to, or null. */
  names: { name: string; exerciseId: string | null }[]
}

function parse(text: string, unit: WeightUnit) {
  if (text.length > IMPORT_MAX_BYTES) throw new Error(FITNESS_ERRORS.importTooBig)
  const parsed = parseWorkoutExport(text, unit)
  if (!parsed) throw new Error(FITNESS_ERRORS.importUnreadable)
  return parsed
}

async function importedKeys(userId: string, keys: string[], database: FitnessDb) {
  if (keys.length === 0) return new Set<string>()
  const rows = await database
    .select({ key: fitnessWorkouts.importKey })
    .from(fitnessWorkouts)
    .where(and(eq(fitnessWorkouts.userId, userId), inArray(fitnessWorkouts.importKey, keys)))
  return new Set(rows.map((row) => row.key))
}

/**
 * The program an import lands in. Only its owner imports into it: a coach
 * reads a client's history but never adds to it.
 */
async function ownProgram(userId: string, programId: string, database: FitnessDb) {
  const program = await programFor(userId, programId, database, { forChange: true })
  if (program.userId !== userId) throw new Error(FITNESS_ERRORS.notYourWorkout)
  return program
}

/** Reads the file and says what it holds, without saving anything. */
export async function previewImport(
  userId: string,
  input: { text: string; unit: WeightUnit; programId: string },
  database: FitnessDb = db
): Promise<ImportPreview> {
  const program = await ownProgram(userId, input.programId, database)
  const parsed = parse(input.text, input.unit)
  const bySlug = await builtInBySlug(database)
  const own = (await listExercises(userId, database, program.routineType)).filter((exercise) => !exercise.builtIn)
  const names = [...new Set(parsed.workouts.flatMap((workout) => workout.exercises.map((exercise) => exercise.name)))]
  const done = await importedKeys(userId, parsed.workouts.map((workout) => workout.key), database)
  const days = parsed.workouts.map((workout) => workout.day).sort()
  return {
    source: parsed.source,
    workouts: parsed.workouts.length,
    alreadyImported: done.size,
    sets: parsed.workouts.reduce(
      (sum, workout) => sum + workout.exercises.reduce((inner, exercise) => inner + exercise.sets.length, 0),
      0
    ),
    firstDay: days[0],
    lastDay: days[days.length - 1],
    names: names.map((name) => {
      const slug = matchCatalogSlug(name)
      const builtIn = slug ? bySlug.get(slug) : undefined
      const mine = own.find((exercise) => exercise.name.toLowerCase() === name.toLowerCase())
      return { name, exerciseId: builtIn?.id ?? mine?.id ?? null }
    }),
  }
}

/**
 * Saves every workout in the file that isn't already saved. Each name the
 * person matched goes to that lift; each name they chose to create becomes a
 * lift of their own. Every workout lands in the program the import was
 * started from. Importing the same file twice adds nothing, because each
 * workout carries a key made from its app, start time and name.
 */
export async function runImport(
  userId: string,
  input: {
    text: string
    unit: WeightUnit
    programId: string
    matches: { name: string; exerciseId: string | null }[]
  },
  database: FitnessDb = db
): Promise<{ imported: number; skipped: number }> {
  await ownProgram(userId, input.programId, database)
  const parsed = parse(input.text, input.unit)
  const idForName = new Map<string, string>()
  for (const match of input.matches) {
    if (match.exerciseId) {
      await exerciseFor(userId, match.exerciseId, database)
      idForName.set(match.name, match.exerciseId)
    }
  }
  const unmatched = new Set(
    parsed.workouts.flatMap((workout) => workout.exercises.map((exercise) => exercise.name)).filter((name) => !idForName.has(name))
  )
  if (unmatched.size > IMPORT_MAX_NEW_LIFTS) throw new Error(FITNESS_ERRORS.importTooManyLifts)
  for (const workout of parsed.workouts) {
    for (const exercise of workout.exercises) {
      if (idForName.has(exercise.name)) continue
      const created = await createExercise(
        userId,
        {
          name: exercise.name,
          // Strong and Hevy log gym lifts, so an unmatched one is a strength lift.
          routineType: "strength",
          muscles: [] as Muscle[],
          equipment: [] as Equipment[],
          movement: "isolation" as Movement,
          isBodyweight: false,
          pictureUrl: null,
        },
        database
      )
      idForName.set(exercise.name, created.id)
    }
  }
  const done = await importedKeys(userId, parsed.workouts.map((workout) => workout.key), database)
  let imported = 0
  for (const workout of parsed.workouts) {
    if (done.has(workout.key)) continue
    const id = uuid()
    const startedAt = new Date(workout.startedAt)
    const inserted = await database
      .insert(fitnessWorkouts)
      .values({
        id,
        userId,
        programId: input.programId,
        dayId: null,
        scheduledId: null,
        name: workout.name,
        day: workout.day,
        source: "import",
        lightWeek: false,
        startedAt,
        finishedAt: startedAt,
        effort: null,
        note: "",
        importKey: workout.key,
      })
      .onConflictDoNothing()
      .returning({ id: fitnessWorkouts.id })
    if (inserted.length === 0) continue
    const at = now()
    const sets = workout.exercises.flatMap((exercise, position) =>
      exercise.sets.map((set, index) => ({
        id: uuid(),
        workoutId: id,
        exerciseId: idForName.get(exercise.name) as string,
        dayExerciseId: null,
        exercisePosition: position,
        setNumber: index + 1,
        kind: set.warmup ? ("warmup" as const) : ("working" as const),
        targetReps: null,
        targetWeightKg: null,
        weightKg: set.weightKg,
        bodyweightKg: null,
        reps: set.reps,
        done: true,
        groupKey: null,
        note: "",
        updatedAt: at,
      }))
    )
    if (sets.length > 0) await database.insert(fitnessWorkoutSets).values(sets)
    imported += 1
  }
  return { imported, skipped: parsed.workouts.length - imported }
}
