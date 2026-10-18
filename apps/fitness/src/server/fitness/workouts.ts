import { and, asc, desc, eq, exists, inArray, isNotNull, isNull, lt, max, ne, not } from "drizzle-orm"

import type { Day } from "@/lib/fitness/dates"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { warmUpSets } from "@/lib/fitness/plates"
import { DEFAULT_PROGRESSION, nextWeight } from "@/lib/fitness/progress"
import { isLightWeek } from "@/lib/fitness/schedule"
import { estimateOneRepMax, formatWeight, roundToStep } from "@/lib/fitness/weights"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { canReachPerson, programFor, type FitnessDb } from "@/server/fitness/access"
import { todayFor } from "@/server/fitness/calendar"
import { exerciseFor, exerciseForRoutine, exercisesById } from "@/server/fitness/exercises"
import { sendFitnessNotice } from "@/server/fitness/notices"
import { preferencesFor } from "@/server/fitness/profile"
import {
  fitnessBaselines,
  fitnessPhotoSessions,
  fitnessWeekDays,
  fitnessDayExercises,
  fitnessPrograms,
  fitnessScheduledWorkouts,
  fitnessStrengthSettings,
  fitnessWeighIns,
  fitnessWorkoutSets,
  fitnessWorkouts,
} from "@/server/fitness/schema"

type WorkoutRow = typeof fitnessWorkouts.$inferSelect
type SetRow = typeof fitnessWorkoutSets.$inferSelect

export type SetView = {
  id: string
  setNumber: number
  kind: "warmup" | "working"
  targetReps: number | null
  targetWeightKg: number | null
  weightKg: number | null
  bodyweightKg: number | null
  reps: number | null
  done: boolean
  note: string
}

export type WorkoutExercise = {
  position: number
  exerciseId: string
  name: string
  isBodyweight: boolean
  muscles: string[]
  groupKey: string | null
  restSeconds: number
  dayExerciseId: string | null
  sets: SetView[]
  /** Last session's working sets for this lift, shown beside each set. */
  last: { day: Day; sets: { weightKg: number | null; reps: number | null }[] } | null
}

export type WorkoutView = {
  id: string
  userId: string
  programId: string | null
  name: string
  day: Day
  source: WorkoutRow["source"]
  lightWeek: boolean
  startedAt: string
  finishedAt: string | null
  effort: number | null
  note: string
  exercises: WorkoutExercise[]
}

/** The latest bodyweight the person gave: a weigh-in, a photo day, or their starting data. */
async function latestBodyweight(userId: string, database: FitnessDb = db): Promise<number | null> {
  const [weighIn] = await database
    .select({ weightKg: fitnessWeighIns.weightKg, day: fitnessWeighIns.day })
    .from(fitnessWeighIns)
    .where(eq(fitnessWeighIns.userId, userId))
    .orderBy(desc(fitnessWeighIns.day))
    .limit(1)
  const [photo] = await database
    .select({ weightKg: fitnessPhotoSessions.bodyweightKg, day: fitnessPhotoSessions.day })
    .from(fitnessPhotoSessions)
    .where(and(eq(fitnessPhotoSessions.userId, userId), isNotNull(fitnessPhotoSessions.bodyweightKg)))
    .orderBy(desc(fitnessPhotoSessions.day))
    .limit(1)
  const dated = [weighIn, photo].filter((entry): entry is { weightKg: number; day: string } =>
    Boolean(entry && entry.weightKg !== null)
  )
  dated.sort((a, b) => b.day.localeCompare(a.day))
  if (dated[0]) return dated[0].weightKg
  const [baseline] = await database
    .select({ weightKg: fitnessBaselines.bodyweightKg })
    .from(fitnessBaselines)
    .innerJoin(fitnessPrograms, eq(fitnessPrograms.id, fitnessBaselines.programId))
    .where(and(eq(fitnessPrograms.userId, userId), isNotNull(fitnessBaselines.bodyweightKg)))
    .orderBy(desc(fitnessPrograms.isActive), desc(fitnessBaselines.updatedAt))
    .limit(1)
  return baseline?.weightKg ?? null
}

/**
 * A workout the actor may see. A coach linked to the person may read it, but
 * only the person who trained may start, log, change, finish or delete one:
 * `forChange` refuses everyone else with the same answer a stranger gets.
 */
async function workoutFor(
  actorId: string,
  workoutId: string,
  database: FitnessDb,
  { forChange = false }: { forChange?: boolean } = {}
) {
  const [workout] = await database.select().from(fitnessWorkouts).where(eq(fitnessWorkouts.id, workoutId)).limit(1)
  if (!workout || !(await canReachPerson(actorId, workout.userId, database))) {
    throw new Error(FITNESS_ERRORS.workoutNotFound)
  }
  if (forChange && workout.userId !== actorId) throw new Error(FITNESS_ERRORS.notYourWorkout)
  return workout
}

/** Only the program's own person starts a workout from it; a coach builds the plan but never trains it. */
function requireOwnProgram(actorId: string, program: { userId: string }) {
  if (program.userId !== actorId) throw new Error(FITNESS_ERRORS.notYourWorkout)
}

/** A lift this workout may take: the person's own to use, of its program's routine type. */
async function liftForWorkout(workout: WorkoutRow, exerciseId: string, database: FitnessDb) {
  if (!workout.programId) return exerciseFor(workout.userId, exerciseId, database)
  const [program] = await database
    .select({ routineType: fitnessPrograms.routineType })
    .from(fitnessPrograms)
    .where(eq(fitnessPrograms.id, workout.programId))
    .limit(1)
  return program
    ? exerciseForRoutine(workout.userId, exerciseId, program.routineType, database)
    : exerciseFor(workout.userId, exerciseId, database)
}

type NewSet = Omit<SetRow, "id" | "workoutId" | "updatedAt" | "note"> & { note?: string }

/** The sets a plan exercise starts with: warm-ups when they are on, then its working sets. */
function setsForDayExercise(
  plan: typeof fitnessDayExercises.$inferSelect,
  exercise: { isBodyweight: boolean },
  position: number,
  options: {
    warmupsOn: boolean
    barKg: number
    platesKg: number[]
    stepKg: number
    lightShare: number | null
    bodyweightKg: number | null
  }
): NewSet[] {
  const weight =
    options.lightShare !== null && !exercise.isBodyweight
      ? roundToStep(plan.weightKg * options.lightShare, options.stepKg)
      : plan.weightKg
  const sets: NewSet[] = []
  const base = {
    exerciseId: plan.exerciseId,
    dayExerciseId: plan.id,
    exercisePosition: position,
    groupKey: plan.groupKey,
    bodyweightKg: exercise.isBodyweight ? options.bodyweightKg : null,
    reps: null,
    done: false,
  }
  if (options.warmupsOn && !exercise.isBodyweight) {
    for (const warm of warmUpSets(weight, options.barKg, options.platesKg)) {
      sets.push({
        ...base,
        setNumber: sets.length + 1,
        kind: "warmup",
        targetReps: warm.reps,
        targetWeightKg: warm.weightKg,
        weightKg: warm.weightKg,
      })
    }
  }
  for (let index = 0; index < plan.sets; index += 1) {
    sets.push({
      ...base,
      setNumber: sets.length + 1,
      kind: "working",
      targetReps: plan.reps,
      targetWeightKg: weight,
      weightKg: weight,
    })
  }
  return sets
}

async function insertSets(workoutId: string, sets: NewSet[], database: FitnessDb) {
  if (sets.length === 0) return
  const at = now()
  await database
    .insert(fitnessWorkoutSets)
    .values(sets.map((set) => ({ ...set, note: set.note ?? "", id: uuid(), workoutId, updatedAt: at })))
}

/**
 * Starts a workout. From a calendar date or a weekday it copies that day's
 * lifts and weights, lighter in a light week. An unfinished workout for the
 * same calendar day is opened again rather than started twice.
 */
export async function startWorkout(
  actorId: string,
  input:
    | { from: "scheduled"; scheduledId: string }
    | { from: "day"; dayId: string }
    | { from: "empty"; programId?: string; name?: string }
    | { from: "repeat"; workoutId: string },
  database: FitnessDb = db
): Promise<{ id: string }> {
  if (input.from === "repeat") return repeatWorkout(actorId, input.workoutId, database)
  if (input.from === "empty") {
    if (input.programId) requireOwnProgram(actorId, await programFor(actorId, input.programId, database, { forChange: true }))
    const today = await todayFor(actorId, database)
    const id = uuid()
    await database.insert(fitnessWorkouts).values({
      id,
      userId: actorId,
      programId: input.programId ?? null,
      dayId: null,
      scheduledId: null,
      name: input.name?.trim() || "Workout",
      day: today,
      source: "empty",
      lightWeek: false,
      startedAt: now(),
      finishedAt: null,
      effort: null,
      note: "",
      importKey: null,
    })
    return { id }
  }

  let dayId: string
  let scheduled: typeof fitnessScheduledWorkouts.$inferSelect | null = null
  if (input.from === "scheduled") {
    const [row] = await database
      .select()
      .from(fitnessScheduledWorkouts)
      .where(eq(fitnessScheduledWorkouts.id, input.scheduledId))
      .limit(1)
    if (!row) throw new Error(FITNESS_ERRORS.scheduledNotFound)
    scheduled = row
    if (row.workoutId) {
      requireOwnProgram(actorId, await programFor(actorId, row.programId, database))
      return { id: row.workoutId }
    }
    // Its weekday became a rest day after the date was laid out.
    if (!row.dayId) throw new Error(FITNESS_ERRORS.scheduledNotFound)
    dayId = row.dayId
  } else {
    dayId = input.dayId
  }
  const [weekDay] = await database.select().from(fitnessWeekDays).where(eq(fitnessWeekDays.id, dayId)).limit(1)
  if (!weekDay) throw new Error(FITNESS_ERRORS.weekDayNotFound)
  const program = await programFor(actorId, weekDay.programId, database, { forChange: true })
  requireOwnProgram(actorId, program)
  const personId = program.userId
  const today = await todayFor(personId, database)
  const [strength] = await database
    .select()
    .from(fitnessStrengthSettings)
    .where(eq(fitnessStrengthSettings.programId, program.id))
    .limit(1)
  const day = scheduled?.day && scheduled.day <= today ? scheduled.day : today
  const lightWeek = strength ? isLightWeek(day, strength.startDay, strength.blockWeeks) : false
  const profile = await preferencesFor(personId, database)
  const bodyweightKg = await latestBodyweight(personId, database)
  const planExercises = await database
    .select()
    .from(fitnessDayExercises)
    .where(eq(fitnessDayExercises.dayId, dayId))
    .orderBy(asc(fitnessDayExercises.position))
  const exercises = await exercisesById(planExercises.map((row) => row.exerciseId), database)

  const id = uuid()
  await database.insert(fitnessWorkouts).values({
    id,
    userId: personId,
    programId: program.id,
    dayId,
    scheduledId: scheduled?.id ?? null,
    name: weekDay.name,
    day,
    source: "day",
    lightWeek,
    startedAt: now(),
    finishedAt: null,
    effort: null,
    note: "",
    importKey: null,
  })
  const sets = planExercises.flatMap((plan, position) =>
    setsForDayExercise(plan, { isBodyweight: exercises.get(plan.exerciseId)?.isBodyweight ?? false }, position, {
      warmupsOn: profile.warmupsOn,
      barKg: profile.barKg,
      platesKg: profile.platesKg,
      stepKg: profile.stepKg,
      lightShare: lightWeek && strength ? strength.lightWeekPercent / 100 : null,
      bodyweightKg,
    })
  )
  await insertSets(id, sets, database)
  if (scheduled) {
    await database
      .update(fitnessScheduledWorkouts)
      .set({ workoutId: id })
      .where(eq(fitnessScheduledWorkouts.id, scheduled.id))
  }
  return { id }
}

/** A new workout with an old one's lifts, and last time's weights and reps as the targets. */
async function repeatWorkout(actorId: string, workoutId: string, database: FitnessDb) {
  const old = await workoutFor(actorId, workoutId, database, { forChange: true })
  const today = await todayFor(old.userId, database)
  const bodyweightKg = await latestBodyweight(old.userId, database)
  const oldSets = await database
    .select()
    .from(fitnessWorkoutSets)
    .where(eq(fitnessWorkoutSets.workoutId, workoutId))
    .orderBy(asc(fitnessWorkoutSets.exercisePosition), asc(fitnessWorkoutSets.setNumber))
  const id = uuid()
  await database.insert(fitnessWorkouts).values({
    id,
    userId: old.userId,
    // Done again in the same program, so it shows in that program's history.
    programId: old.programId,
    dayId: null,
    scheduledId: null,
    name: old.name,
    day: today,
    source: "repeat",
    lightWeek: false,
    startedAt: now(),
    finishedAt: null,
    effort: null,
    note: "",
    importKey: null,
  })
  await insertSets(
    id,
    oldSets.map((set) => ({
      exerciseId: set.exerciseId,
      dayExerciseId: null,
      exercisePosition: set.exercisePosition,
      setNumber: set.setNumber,
      kind: set.kind,
      targetReps: set.reps ?? set.targetReps,
      targetWeightKg: set.weightKg ?? set.targetWeightKg,
      weightKg: set.weightKg ?? set.targetWeightKg,
      bodyweightKg: set.bodyweightKg === null ? null : bodyweightKg,
      reps: null,
      done: false,
      groupKey: set.groupKey,
    })),
    database
  )
  return { id }
}

/** Last finished session's working sets for each of these lifts, before `beforeDay`. */
async function lastSessions(
  userId: string,
  exerciseIds: string[],
  excludeWorkoutId: string,
  database: FitnessDb
) {
  const result = new Map<string, WorkoutExercise["last"]>()
  for (const exerciseId of [...new Set(exerciseIds)]) {
    const [latest] = await database
      .select({ workoutId: fitnessWorkouts.id, day: fitnessWorkouts.day })
      .from(fitnessWorkoutSets)
      .innerJoin(fitnessWorkouts, eq(fitnessWorkouts.id, fitnessWorkoutSets.workoutId))
      .where(
        and(
          eq(fitnessWorkouts.userId, userId),
          isNotNull(fitnessWorkouts.finishedAt),
          ne(fitnessWorkouts.id, excludeWorkoutId),
          eq(fitnessWorkoutSets.exerciseId, exerciseId),
          eq(fitnessWorkoutSets.kind, "working"),
          eq(fitnessWorkoutSets.done, true)
        )
      )
      .orderBy(desc(fitnessWorkouts.day), desc(fitnessWorkouts.finishedAt))
      .limit(1)
    if (!latest) continue
    const sets = await database
      .select({ weightKg: fitnessWorkoutSets.weightKg, reps: fitnessWorkoutSets.reps })
      .from(fitnessWorkoutSets)
      .where(
        and(
          eq(fitnessWorkoutSets.workoutId, latest.workoutId),
          eq(fitnessWorkoutSets.exerciseId, exerciseId),
          eq(fitnessWorkoutSets.kind, "working"),
          eq(fitnessWorkoutSets.done, true)
        )
      )
      .orderBy(asc(fitnessWorkoutSets.setNumber))
    result.set(exerciseId, { day: latest.day, sets })
  }
  return result
}

export async function loadWorkout(actorId: string, workoutId: string, database: FitnessDb = db): Promise<WorkoutView> {
  const workout = await workoutFor(actorId, workoutId, database)
  const sets = await database
    .select()
    .from(fitnessWorkoutSets)
    .where(eq(fitnessWorkoutSets.workoutId, workoutId))
    .orderBy(asc(fitnessWorkoutSets.exercisePosition), asc(fitnessWorkoutSets.setNumber))
  const exerciseRows = await exercisesById(sets.map((set) => set.exerciseId), database)
  const planIds = [...new Set(sets.map((set) => set.dayExerciseId).filter((id): id is string => Boolean(id)))]
  const planRows = planIds.length
    ? await database.select().from(fitnessDayExercises).where(inArray(fitnessDayExercises.id, planIds))
    : []
  const last = await lastSessions(workout.userId, sets.map((set) => set.exerciseId), workoutId, database)

  const byPosition = new Map<number, SetRow[]>()
  for (const set of sets) {
    byPosition.set(set.exercisePosition, [...(byPosition.get(set.exercisePosition) ?? []), set])
  }
  const exercises: WorkoutExercise[] = [...byPosition.entries()]
    .sort(([a], [b]) => a - b)
    .map(([position, group]) => {
      const first = group[0]
      const exercise = exerciseRows.get(first.exerciseId)
      const plan = planRows.find((row) => row.id === first.dayExerciseId)
      return {
        position,
        exerciseId: first.exerciseId,
        name: exercise?.name ?? "Exercise",
        isBodyweight: exercise?.isBodyweight ?? false,
        muscles: exercise?.muscles ?? [],
        groupKey: first.groupKey,
        restSeconds: plan?.restSeconds ?? 120,
        dayExerciseId: first.dayExerciseId,
        sets: group.map((set) => ({
          id: set.id,
          setNumber: set.setNumber,
          kind: set.kind,
          targetReps: set.targetReps,
          targetWeightKg: set.targetWeightKg,
          weightKg: set.weightKg,
          bodyweightKg: set.bodyweightKg,
          reps: set.reps,
          done: set.done,
          note: set.note,
        })),
        last: last.get(first.exerciseId) ?? null,
      }
    })
  return {
    id: workout.id,
    userId: workout.userId,
    programId: workout.programId,
    name: workout.name,
    day: workout.day,
    source: workout.source,
    lightWeek: workout.lightWeek,
    startedAt: workout.startedAt.toISOString(),
    finishedAt: workout.finishedAt?.toISOString() ?? null,
    effort: workout.effort,
    note: workout.note,
    exercises,
  }
}

export type SetChange = Partial<{
  weightKg: number | null
  reps: number | null
  done: boolean
  note: string
}>

/** Saves one set as it is ticked, not at the end of the workout. */
export async function saveSet(actorId: string, setId: string, change: SetChange, database: FitnessDb = db) {
  const [set] = await database.select().from(fitnessWorkoutSets).where(eq(fitnessWorkoutSets.id, setId)).limit(1)
  if (!set) throw new Error(FITNESS_ERRORS.setNotFound)
  await workoutFor(actorId, set.workoutId, database, { forChange: true })
  await database
    .update(fitnessWorkoutSets)
    .set({ ...change, updatedAt: now() })
    .where(eq(fitnessWorkoutSets.id, setId))
}

/**
 * Adds a set to an exercise already in the workout, copying the last set's
 * weight and reps. The id may come from the phone, so the same set sent twice
 * after a dropped signal is saved once.
 */
export async function addSet(
  actorId: string,
  workoutId: string,
  input: { position: number; id?: string },
  database: FitnessDb = db
) {
  const workout = await workoutFor(actorId, workoutId, database, { forChange: true })
  const siblings = await database
    .select()
    .from(fitnessWorkoutSets)
    .where(and(eq(fitnessWorkoutSets.workoutId, workout.id), eq(fitnessWorkoutSets.exercisePosition, input.position)))
    .orderBy(desc(fitnessWorkoutSets.setNumber))
  const last = siblings[0]
  if (!last) throw new Error(FITNESS_ERRORS.setNotFound)
  const id = input.id ?? uuid()
  await database
    .insert(fitnessWorkoutSets)
    .values({
      id,
      workoutId,
      exerciseId: last.exerciseId,
      dayExerciseId: last.dayExerciseId,
      exercisePosition: input.position,
      setNumber: last.setNumber + 1,
      kind: "working",
      targetReps: last.targetReps,
      targetWeightKg: last.targetWeightKg,
      weightKg: last.weightKg ?? last.targetWeightKg,
      bodyweightKg: last.bodyweightKg,
      reps: null,
      done: false,
      groupKey: last.groupKey,
      note: "",
      updatedAt: now(),
    })
    .onConflictDoNothing()
  return { id }
}

export async function removeSet(actorId: string, setId: string, database: FitnessDb = db) {
  const [set] = await database.select().from(fitnessWorkoutSets).where(eq(fitnessWorkoutSets.id, setId)).limit(1)
  if (!set) return
  await workoutFor(actorId, set.workoutId, database, { forChange: true })
  await database.delete(fitnessWorkoutSets).where(eq(fitnessWorkoutSets.id, setId))
}

/** Adds a lift to the end of the workout with three empty sets. */
export async function addExerciseToWorkout(
  actorId: string,
  workoutId: string,
  exerciseId: string,
  database: FitnessDb = db
) {
  const workout = await workoutFor(actorId, workoutId, database, { forChange: true })
  const exercise = await liftForWorkout(workout, exerciseId, database)
  const [{ last }] = await database
    .select({ last: max(fitnessWorkoutSets.exercisePosition) })
    .from(fitnessWorkoutSets)
    .where(eq(fitnessWorkoutSets.workoutId, workoutId))
  const position = (last ?? -1) + 1
  const bodyweightKg = exercise.isBodyweight ? await latestBodyweight(workout.userId, database) : null
  const previous = await lastSessions(workout.userId, [exerciseId], workoutId, database)
  const lastWeight = previous.get(exerciseId)?.sets.at(-1)?.weightKg ?? null
  await insertSets(
    workoutId,
    [1, 2, 3].map((setNumber) => ({
      exerciseId,
      dayExerciseId: null,
      exercisePosition: position,
      setNumber,
      kind: "working" as const,
      targetReps: null,
      targetWeightKg: lastWeight,
      weightKg: lastWeight ?? (exercise.isBodyweight ? 0 : null),
      bodyweightKg,
      reps: null,
      done: false,
      groupKey: null,
    })),
    database
  )
  return { position }
}

export async function removeExerciseFromWorkout(
  actorId: string,
  workoutId: string,
  position: number,
  database: FitnessDb = db
) {
  await workoutFor(actorId, workoutId, database, { forChange: true })
  await database
    .delete(fitnessWorkoutSets)
    .where(and(eq(fitnessWorkoutSets.workoutId, workoutId), eq(fitnessWorkoutSets.exercisePosition, position)))
}

/**
 * Swaps the lift at one place in today's workout for another. With
 * `changePlan`, the plan's own exercise changes too, so later workouts use it.
 */
export async function swapExercise(
  actorId: string,
  workoutId: string,
  input: { position: number; exerciseId: string; changePlan: boolean },
  database: FitnessDb = db
) {
  const workout = await workoutFor(actorId, workoutId, database, { forChange: true })
  const exercise = await liftForWorkout(workout, input.exerciseId, database)
  const bodyweightKg = exercise.isBodyweight ? await latestBodyweight(workout.userId, database) : null
  const sets = await database
    .select()
    .from(fitnessWorkoutSets)
    .where(and(eq(fitnessWorkoutSets.workoutId, workoutId), eq(fitnessWorkoutSets.exercisePosition, input.position)))
  if (sets.length === 0) throw new Error(FITNESS_ERRORS.setNotFound)
  await database
    .update(fitnessWorkoutSets)
    .set({
      exerciseId: exercise.id,
      bodyweightKg,
      ...(exercise.isBodyweight ? { weightKg: 0, targetWeightKg: 0 } : {}),
      updatedAt: now(),
    })
    .where(and(eq(fitnessWorkoutSets.workoutId, workoutId), eq(fitnessWorkoutSets.exercisePosition, input.position)))
  const dayExerciseId = sets[0].dayExerciseId
  if (input.changePlan && dayExerciseId) {
    await database
      .update(fitnessDayExercises)
      .set({ exerciseId: exercise.id, missStreak: 0 })
      .where(eq(fitnessDayExercises.id, dayExerciseId))
  }
}

export type PersonalRecord = {
  exerciseId: string
  exerciseName: string
  kind: "heaviest" | "oneRepMax" | "mostReps"
  /** The weight on the bar, plus bodyweight for a bodyweight lift. */
  weightKg: number
  reps: number
  previousKg: number | null
  previousReps: number | null
}

/** What a set really moved: the bar, or bodyweight plus what was added. */
function loadOf(set: Pick<SetRow, "weightKg" | "bodyweightKg">) {
  return (set.weightKg ?? 0) + (set.bodyweightKg ?? 0)
}

/** The best numbers in a list of done working sets. */
export function bestNumbers(sets: Pick<SetRow, "weightKg" | "bodyweightKg" | "reps">[]) {
  let heaviest = 0
  let oneRepMax = 0
  let mostReps = 0
  let mostRepsWeight = 0
  for (const set of sets) {
    const load = loadOf(set)
    const reps = set.reps ?? 0
    if (reps <= 0) continue
    heaviest = Math.max(heaviest, load)
    oneRepMax = Math.max(oneRepMax, estimateOneRepMax(load, reps))
    if (reps > mostReps || (reps === mostReps && load > mostRepsWeight)) {
      mostReps = reps
      mostRepsWeight = load
    }
  }
  return { heaviest, oneRepMax, mostReps, mostRepsWeight }
}

/**
 * The records this workout broke. A lift needs earlier history to beat: the
 * first time a lift is logged sets the mark, it does not break one.
 */
async function recordsIn(workout: WorkoutRow, database: FitnessDb): Promise<PersonalRecord[]> {
  const sets = await database
    .select()
    .from(fitnessWorkoutSets)
    .where(
      and(
        eq(fitnessWorkoutSets.workoutId, workout.id),
        eq(fitnessWorkoutSets.kind, "working"),
        eq(fitnessWorkoutSets.done, true)
      )
    )
  const exerciseIds = [...new Set(sets.map((set) => set.exerciseId))]
  const names = await exercisesById(exerciseIds, database)
  const records: PersonalRecord[] = []
  for (const exerciseId of exerciseIds) {
    const before = await database
      .select({
        weightKg: fitnessWorkoutSets.weightKg,
        bodyweightKg: fitnessWorkoutSets.bodyweightKg,
        reps: fitnessWorkoutSets.reps,
      })
      .from(fitnessWorkoutSets)
      .innerJoin(fitnessWorkouts, eq(fitnessWorkouts.id, fitnessWorkoutSets.workoutId))
      .where(
        and(
          eq(fitnessWorkouts.userId, workout.userId),
          isNotNull(fitnessWorkouts.finishedAt),
          ne(fitnessWorkouts.id, workout.id),
          eq(fitnessWorkoutSets.exerciseId, exerciseId),
          eq(fitnessWorkoutSets.kind, "working"),
          eq(fitnessWorkoutSets.done, true)
        )
      )
    if (before.length === 0) continue
    const old = bestNumbers(before)
    const fresh = bestNumbers(sets.filter((set) => set.exerciseId === exerciseId))
    const name = names.get(exerciseId)?.name ?? "Exercise"
    if (fresh.heaviest > old.heaviest + 1e-9) {
      records.push({
        exerciseId,
        exerciseName: name,
        kind: "heaviest",
        weightKg: fresh.heaviest,
        reps: 0,
        previousKg: old.heaviest,
        previousReps: null,
      })
    }
    if (fresh.oneRepMax > old.oneRepMax + 1e-9) {
      records.push({
        exerciseId,
        exerciseName: name,
        kind: "oneRepMax",
        weightKg: fresh.oneRepMax,
        reps: 0,
        previousKg: old.oneRepMax,
        previousReps: null,
      })
    }
    if (fresh.mostReps > old.mostReps && fresh.mostRepsWeight >= old.mostRepsWeight - 1e-9) {
      records.push({
        exerciseId,
        exerciseName: name,
        kind: "mostReps",
        weightKg: fresh.mostRepsWeight,
        reps: fresh.mostReps,
        previousKg: null,
        previousReps: old.mostReps,
      })
    }
  }
  return records
}

type WeightChange = { exerciseName: string; fromKg: number; toKg: number }

export type FinishSummary = {
  workoutId: string
  minutes: number
  setsDone: number
  totalKg: number
  records: PersonalRecord[]
  weightChanges: WeightChange[]
}

/**
 * Applies the program's weight rules to each plan lift in this workout. A
 * light week, or a program with automatic increases off, changes nothing.
 */
async function applyProgression(workout: WorkoutRow, database: FitnessDb): Promise<WeightChange[]> {
  if (!workout.programId || workout.lightWeek || workout.source !== "day") return []
  const [strength] = await database
    .select()
    .from(fitnessStrengthSettings)
    .where(eq(fitnessStrengthSettings.programId, workout.programId))
    .limit(1)
  if (!strength?.autoIncrease) return []
  const profile = await preferencesFor(workout.userId, database)
  const sets = await database
    .select()
    .from(fitnessWorkoutSets)
    .where(
      and(
        eq(fitnessWorkoutSets.workoutId, workout.id),
        eq(fitnessWorkoutSets.kind, "working"),
        isNotNull(fitnessWorkoutSets.dayExerciseId)
      )
    )
  const planIds = [...new Set(sets.map((set) => set.dayExerciseId as string))]
  if (planIds.length === 0) return []
  const plans = await database.select().from(fitnessDayExercises).where(inArray(fitnessDayExercises.id, planIds))
  const names = await exercisesById(plans.map((plan) => plan.exerciseId), database)
  const changes: WeightChange[] = []
  for (const plan of plans) {
    const mine = sets.filter((set) => set.dayExerciseId === plan.id && set.exerciseId === plan.exerciseId)
    if (mine.length === 0) continue
    const allRepsHit = mine.every(
      (set) =>
        set.done &&
        (set.reps ?? 0) >= (set.targetReps ?? plan.reps) &&
        (set.weightKg ?? 0) + 1e-9 >= (set.targetWeightKg ?? plan.weightKg)
    )
    const next = nextWeight(
      { weightKg: plan.weightKg, missStreak: plan.missStreak },
      allRepsHit,
      {
        ...DEFAULT_PROGRESSION,
        increaseKg: strength.increaseKg,
        missesBeforeDrop: strength.missesBeforeDrop,
        dropPercent: strength.dropPercent,
      },
      profile.stepKg
    )
    await database
      .update(fitnessDayExercises)
      .set({ weightKg: next.weightKg, missStreak: next.missStreak })
      .where(eq(fitnessDayExercises.id, plan.id))
    if (Math.abs(next.weightKg - plan.weightKg) > 1e-9) {
      changes.push({
        exerciseName: names.get(plan.exerciseId)?.name ?? "Exercise",
        fromKg: plan.weightKg,
        toKg: next.weightKg,
      })
    }
  }
  return changes
}

const RECORD_WORDS: Record<PersonalRecord["kind"], string> = {
  heaviest: "heaviest",
  oneRepMax: "best estimated one-rep max",
  mostReps: "most reps",
}

/**
 * Finishes the workout: marks its calendar day done, moves next session's
 * weights by the program's rules, and puts a notice in the bell for each
 * record broken.
 */
export async function finishWorkout(
  actorId: string,
  workoutId: string,
  input: { effort: number | null; note: string },
  database: FitnessDb = db
): Promise<FinishSummary> {
  const workout = await workoutFor(actorId, workoutId, database, { forChange: true })
  if (workout.finishedAt) throw new Error(FITNESS_ERRORS.workoutFinished)
  // A workout with nothing ticked has nothing to keep. Leaving it throws it
  // away instead (Tyler, 18 Oct 2026), so finishing one is refused.
  const [ticked] = await database
    .select({ id: fitnessWorkoutSets.id })
    .from(fitnessWorkoutSets)
    .where(and(eq(fitnessWorkoutSets.workoutId, workoutId), eq(fitnessWorkoutSets.done, true)))
    .limit(1)
  if (!ticked) throw new Error(FITNESS_ERRORS.nothingLogged)
  const finishedAt = now()
  await database
    .update(fitnessWorkouts)
    .set({ finishedAt, effort: input.effort, note: input.note.trim() })
    .where(eq(fitnessWorkouts.id, workoutId))
  if (workout.scheduledId) {
    await database
      .update(fitnessScheduledWorkouts)
      .set({ status: "done", workoutId })
      .where(eq(fitnessScheduledWorkouts.id, workout.scheduledId))
  }
  const finished = { ...workout, finishedAt }
  const weightChanges = await applyProgression(finished, database)
  const records = await recordsIn(finished, database)
  const profile = await preferencesFor(workout.userId, database)
  for (const record of records) {
    const figure =
      record.kind === "mostReps"
        ? `${record.reps} reps at ${formatWeight(record.weightKg, profile.unit)}`
        : formatWeight(record.weightKg, profile.unit)
    await sendFitnessNotice(
      {
        recipientUserId: workout.userId,
        kind: "record",
        message: `New record: ${record.exerciseName}, ${figure}`,
        detail: `Your ${RECORD_WORDS[record.kind]} on ${record.exerciseName}.`,
        href: workout.programId ? `/programs/${workout.programId}?view=progress&pick=${record.exerciseId}` : "/programs",
      },
      database
    )
  }
  const done = await database
    .select()
    .from(fitnessWorkoutSets)
    .where(
      and(
        eq(fitnessWorkoutSets.workoutId, workoutId),
        eq(fitnessWorkoutSets.done, true),
        eq(fitnessWorkoutSets.kind, "working")
      )
    )
  return {
    workoutId,
    minutes: Math.max(1, Math.round((finishedAt.getTime() - workout.startedAt.getTime()) / 60000)),
    setsDone: done.length,
    totalKg: done.reduce((sum, set) => sum + loadOf(set) * (set.reps ?? 0), 0),
    records,
    weightChanges,
  }
}

/** Notes and the effort score can change after a workout is finished. */
export async function saveWorkoutNotes(
  actorId: string,
  workoutId: string,
  input: { effort?: number | null; note?: string; name?: string },
  database: FitnessDb = db
) {
  await workoutFor(actorId, workoutId, database, { forChange: true })
  await database
    .update(fitnessWorkouts)
    .set({
      ...(input.effort !== undefined ? { effort: input.effort } : {}),
      ...(input.note !== undefined ? { note: input.note.trim() } : {}),
      ...(input.name !== undefined && input.name.trim() ? { name: input.name.trim() } : {}),
    })
    .where(eq(fitnessWorkouts.id, workoutId))
}

/** Deletes a workout. Its calendar day goes back to planned. */
export async function deleteWorkout(actorId: string, workoutId: string, database: FitnessDb = db) {
  const workout = await workoutFor(actorId, workoutId, database, { forChange: true })
  if (workout.scheduledId) {
    await database
      .update(fitnessScheduledWorkouts)
      .set({ status: "planned", workoutId: null })
      .where(eq(fitnessScheduledWorkouts.id, workout.scheduledId))
  }
  await database.delete(fitnessWorkouts).where(eq(fitnessWorkouts.id, workoutId))
}

export type HistoryRow = {
  id: string
  /** The program it was logged in, or null for one logged before programs had workouts. */
  programId: string | null
  name: string
  day: Day
  source: WorkoutRow["source"]
  finished: boolean
  minutes: number | null
  setsDone: number
  totalKg: number
  effort: number | null
  note: string
  exerciseNames: string[]
}

/** Every workout with at least one ticked set, newest first, unfinished ones included. */
export async function loadHistory(
  actorId: string,
  personId: string,
  database: FitnessDb = db,
  { limit = 200 }: { limit?: number } = {}
): Promise<HistoryRow[]> {
  if (!(await canReachPerson(actorId, personId, database))) throw new Error(FITNESS_ERRORS.workoutNotFound)
  const workouts = await database
    .select()
    .from(fitnessWorkouts)
    .where(eq(fitnessWorkouts.userId, personId))
    .orderBy(desc(fitnessWorkouts.day), desc(fitnessWorkouts.startedAt))
    .limit(limit)
  if (workouts.length === 0) return []
  const sets = await database
    .select()
    .from(fitnessWorkoutSets)
    .where(inArray(fitnessWorkoutSets.workoutId, workouts.map((workout) => workout.id)))
    .orderBy(asc(fitnessWorkoutSets.exercisePosition))
  const names = await exercisesById(sets.map((set) => set.exerciseId), database)
  // History is what was done: a workout with no set ticked is left out. One
  // still open is offered as "Pick up" instead.
  const ticked = new Set(sets.filter((set) => set.done).map((set) => set.workoutId))
  return workouts.filter((workout) => ticked.has(workout.id)).map((workout) => {
    const mine = sets.filter((set) => set.workoutId === workout.id)
    const done = mine.filter((set) => set.done && set.kind === "working")
    return {
      id: workout.id,
      programId: workout.programId,
      name: workout.name,
      day: workout.day,
      source: workout.source,
      finished: Boolean(workout.finishedAt),
      minutes: workout.finishedAt
        ? Math.max(1, Math.round((workout.finishedAt.getTime() - workout.startedAt.getTime()) / 60000))
        : null,
      setsDone: done.length,
      totalKg: done.reduce((sum, set) => sum + loadOf(set) * (set.reps ?? 0), 0),
      effort: workout.effort,
      note: workout.note,
      exerciseNames: [...new Set(mine.map((set) => names.get(set.exerciseId)?.name ?? "Exercise"))],
    }
  })
}

/** True for a workout with at least one set ticked: one worth picking up again. */
export function hasTickedSet(database: FitnessDb = db) {
  return exists(
    database
      .select({ id: fitnessWorkoutSets.id })
      .from(fitnessWorkoutSets)
      .where(and(eq(fitnessWorkoutSets.workoutId, fitnessWorkouts.id), eq(fitnessWorkoutSets.done, true)))
  )
}

/**
 * The person's unfinished workout started most recently, so the app can offer
 * to pick it up. One with nothing ticked isn't offered: there is nothing in it
 * to carry on (Tyler, 18 Oct 2026).
 */
export async function openWorkout(userId: string, database: FitnessDb = db) {
  const [row] = await database
    .select({ id: fitnessWorkouts.id, name: fitnessWorkouts.name, day: fitnessWorkouts.day, programId: fitnessWorkouts.programId })
    .from(fitnessWorkouts)
    .where(and(eq(fitnessWorkouts.userId, userId), isNull(fitnessWorkouts.finishedAt), hasTickedSet(database)))
    .orderBy(desc(fitnessWorkouts.startedAt))
    .limit(1)
  return row ?? null
}

/** How long a started workout with nothing ticked is kept before it is cleared away. */
const UNTOUCHED_WORKOUT_HOURS = 6

/**
 * Clears away a person's unfinished workouts that have nothing ticked and
 * were started over six hours ago: a Start pressed and then left some other
 * way than the back arrow, which throws one away at once. Their calendar
 * dates go back to planned. Nothing logged is ever touched.
 */
export async function discardUntouchedWorkouts(userId: string, database: FitnessDb = db, at: Date = now()) {
  const before = new Date(at.getTime() - UNTOUCHED_WORKOUT_HOURS * 3_600_000)
  const gone = await database
    .delete(fitnessWorkouts)
    .where(
      and(
        eq(fitnessWorkouts.userId, userId),
        isNull(fitnessWorkouts.finishedAt),
        lt(fitnessWorkouts.startedAt, before),
        not(hasTickedSet(database))
      )
    )
    .returning({ id: fitnessWorkouts.id })
  if (gone.length === 0) return 0
  await database
    .update(fitnessScheduledWorkouts)
    .set({ workoutId: null })
    .where(inArray(fitnessScheduledWorkouts.workoutId, gone.map((row) => row.id)))
  return gone.length
}
