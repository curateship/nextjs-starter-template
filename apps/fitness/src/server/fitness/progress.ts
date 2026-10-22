import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm"

import { measureOf, type SetMeasure } from "@/lib/fitness/calisthenics"
import { addDays, weekStart, type Day } from "@/lib/fitness/dates"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { fullyPausedWeeks, weeklyStreak, weightTrend } from "@/lib/fitness/progress"
import { estimateOneRepMax } from "@/lib/fitness/weights"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { canReachPerson, type FitnessDb } from "@/server/fitness/access"
import { pausesFor, todayFor } from "@/server/fitness/calendar"
import { exercisesById } from "@/server/fitness/exercises"
import { canSeePhotos } from "@/server/fitness/photos"
import { preferencesFor, profileFor } from "@/server/fitness/profile"
import {
  fitnessPhotoSessions,
  fitnessProfiles,
  fitnessPrograms,
  fitnessScheduledWorkouts,
  fitnessWeighIns,
  fitnessWorkoutSets,
  fitnessWorkouts,
} from "@/server/fitness/schema"
import { bestNumbers, type PersonalRecord } from "@/server/fitness/workouts"

async function reach(actorId: string, personId: string, database: FitnessDb) {
  if (!(await canReachPerson(actorId, personId, database))) throw new Error(FITNESS_ERRORS.workoutNotFound)
}

/** Every done working set the person has logged, with its day. */
async function loggedSets(personId: string, database: FitnessDb, exerciseId?: string) {
  return database
    .select({
      workoutId: fitnessWorkouts.id,
      day: fitnessWorkouts.day,
      exerciseId: fitnessWorkoutSets.exerciseId,
      weightKg: fitnessWorkoutSets.weightKg,
      bodyweightKg: fitnessWorkoutSets.bodyweightKg,
      reps: fitnessWorkoutSets.reps,
    })
    .from(fitnessWorkoutSets)
    .innerJoin(fitnessWorkouts, eq(fitnessWorkouts.id, fitnessWorkoutSets.workoutId))
    .where(
      and(
        eq(fitnessWorkouts.userId, personId),
        isNotNull(fitnessWorkouts.finishedAt),
        eq(fitnessWorkoutSets.kind, "working"),
        eq(fitnessWorkoutSets.done, true),
        ...(exerciseId ? [eq(fitnessWorkoutSets.exerciseId, exerciseId)] : [])
      )
    )
    .orderBy(asc(fitnessWorkouts.day), asc(fitnessWorkouts.finishedAt), asc(fitnessWorkouts.id))
}

export type LiftRecord = {
  exerciseId: string
  name: string
  muscles: string[]
  /** The routine type the lift belongs to, so a program shows only its own. */
  routineType: string
  /** What its sets count: weight and reps, reps alone, or seconds. */
  measure: SetMeasure
  /** A built-in move's slug, for finding the hardest version reached in its ladder. */
  slug: string | null
  sessions: number
  lastDay: Day
  heaviestKg: number
  oneRepMaxKg: number
  mostReps: number
  mostRepsAtKg: number
}

/** One row per lift the person has logged, with their best numbers on it. */
export async function loadRecords(actorId: string, personId: string, database: FitnessDb = db): Promise<LiftRecord[]> {
  await reach(actorId, personId, database)
  const sets = await loggedSets(personId, database)
  const names = await exercisesById(sets.map((set) => set.exerciseId), database)
  const byExercise = new Map<string, typeof sets>()
  for (const set of sets) byExercise.set(set.exerciseId, [...(byExercise.get(set.exerciseId) ?? []), set])
  return [...byExercise.entries()]
    .map(([exerciseId, mine]) => {
      const best = bestNumbers(mine)
      return {
        exerciseId,
        name: names.get(exerciseId)?.name ?? "Exercise",
        muscles: names.get(exerciseId)?.muscles ?? [],
        routineType: names.get(exerciseId)?.routineType ?? "strength",
        measure: measureOf(names.get(exerciseId)),
        slug: names.get(exerciseId)?.slug ?? null,
        sessions: new Set(mine.map((set) => set.day)).size,
        lastDay: mine[mine.length - 1].day,
        heaviestKg: best.heaviest,
        oneRepMaxKg: best.oneRepMax,
        mostReps: best.mostReps,
        mostRepsAtKg: best.mostRepsWeight,
      }
    })
    .sort((a, b) => b.lastDay.localeCompare(a.lastDay) || a.name.localeCompare(b.name))
}

export type RecordBroken = {
  day: Day
  exerciseId: string
  name: string
  routineType: string
  measure: SetMeasure
  kind: PersonalRecord["kind"]
  /** The new mark: the weight for heaviest and one-rep max, the weight the reps were at for most reps. */
  weightKg: number
  reps: number
  previousKg: number | null
  previousReps: number | null
}

/**
 * Every time a record was broken, newest first (Tyler, 21 Oct 2026). The
 * person's finished working sets are walked in the order they were logged,
 * workout by workout, keeping each lift's best so far with `bestNumbers`, the
 * same as the record notices: heaviest, best one-rep max and most reps. The
 * first time a lift is logged sets the mark; it doesn't break one. Nothing is
 * stored.
 */
export async function loadRecordTimeline(
  actorId: string,
  personId: string,
  database: FitnessDb = db,
  { limit = 200, routineType }: { limit?: number; routineType?: string } = {}
): Promise<RecordBroken[]> {
  await reach(actorId, personId, database)
  const sets = await loggedSets(personId, database)
  const names = await exercisesById(sets.map((set) => set.exerciseId), database)
  const best = new Map<string, ReturnType<typeof bestNumbers>>()
  const broken: RecordBroken[] = []
  const workouts: { day: Day; sets: typeof sets }[] = []
  for (const set of sets) {
    const last = workouts[workouts.length - 1]
    if (last && last.sets[0].workoutId === set.workoutId) last.sets.push(set)
    else workouts.push({ day: set.day, sets: [set] })
  }
  for (const workout of workouts) {
    for (const exerciseId of new Set(workout.sets.map((set) => set.exerciseId))) {
      const fresh = bestNumbers(workout.sets.filter((set) => set.exerciseId === exerciseId))
      const old = best.get(exerciseId)
      const lift = names.get(exerciseId)
      const base = {
        day: workout.day,
        exerciseId,
        name: lift?.name ?? "Exercise",
        routineType: lift?.routineType ?? "strength",
        measure: measureOf(lift),
      }
      if (old) {
        if (fresh.heaviest > old.heaviest + 1e-9) {
          broken.push({ ...base, kind: "heaviest", weightKg: fresh.heaviest, reps: 0, previousKg: old.heaviest, previousReps: null })
        }
        if (fresh.oneRepMax > old.oneRepMax + 1e-9) {
          broken.push({ ...base, kind: "oneRepMax", weightKg: fresh.oneRepMax, reps: 0, previousKg: old.oneRepMax, previousReps: null })
        }
        if (fresh.mostReps > old.mostReps && fresh.mostRepsWeight >= old.mostRepsWeight - 1e-9) {
          broken.push({
            ...base,
            kind: "mostReps",
            weightKg: fresh.mostRepsWeight,
            reps: fresh.mostReps,
            previousKg: null,
            previousReps: old.mostReps,
          })
        }
      }
      best.set(exerciseId, old ? mergeBest(old, fresh) : fresh)
    }
  }
  // One routine type's records, cut to the newest only after that, so another type's never crowd them out.
  return broken
    .filter((record) => !routineType || record.routineType === routineType)
    .reverse()
    .slice(0, limit)
}

/** The best of two sets of best numbers, picked the way `bestNumbers` picks within one list. */
function mergeBest(a: ReturnType<typeof bestNumbers>, b: ReturnType<typeof bestNumbers>): ReturnType<typeof bestNumbers> {
  const reps = b.mostReps > a.mostReps || (b.mostReps === a.mostReps && b.mostRepsWeight > a.mostRepsWeight) ? b : a
  return {
    heaviest: Math.max(a.heaviest, b.heaviest),
    oneRepMax: Math.max(a.oneRepMax, b.oneRepMax),
    mostReps: reps.mostReps,
    mostRepsWeight: reps.mostRepsWeight,
  }
}

export type LiftPoint = { day: Day; oneRepMaxKg: number; heaviestKg: number; volumeKg: number; mostReps: number }

/** One lift's estimated one-rep max, heaviest and most reps for each day it was trained. */
export async function loadLiftHistory(
  actorId: string,
  personId: string,
  exerciseId: string,
  database: FitnessDb = db
): Promise<LiftPoint[]> {
  await reach(actorId, personId, database)
  const sets = await loggedSets(personId, database, exerciseId)
  const byDay = new Map<Day, LiftPoint>()
  for (const set of sets) {
    const load = (set.weightKg ?? 0) + (set.bodyweightKg ?? 0)
    const reps = set.reps ?? 0
    if (reps <= 0) continue
    const point = byDay.get(set.day) ?? { day: set.day, oneRepMaxKg: 0, heaviestKg: 0, volumeKg: 0, mostReps: 0 }
    point.mostReps = Math.max(point.mostReps, reps)
    point.oneRepMaxKg = Math.max(point.oneRepMaxKg, estimateOneRepMax(load, reps))
    point.heaviestKg = Math.max(point.heaviestKg, load)
    point.volumeKg += load * reps
    byDay.set(set.day, point)
  }
  return [...byDay.values()]
}

export type MuscleWeek = { week: Day; sets: Record<string, number> }

/**
 * Working sets per muscle for each of the last `weeks` weeks. A set counts
 * once for its lift's main muscle, so a bench press set is a chest set.
 */
export async function loadWeeklySets(
  actorId: string,
  personId: string,
  weeks: number,
  database: FitnessDb = db
): Promise<MuscleWeek[]> {
  await reach(actorId, personId, database)
  const today = await todayFor(personId, database)
  const first = addDays(weekStart(today), -7 * (weeks - 1))
  const sets = (await loggedSets(personId, database)).filter((set) => set.day >= first)
  const names = await exercisesById(sets.map((set) => set.exerciseId), database)
  const result: MuscleWeek[] = Array.from({ length: weeks }, (_, index) => ({
    week: addDays(first, index * 7),
    sets: {},
  }))
  for (const set of sets) {
    const muscle = names.get(set.exerciseId)?.muscles[0]
    if (!muscle) continue
    const week = result.find((entry) => entry.week === weekStart(set.day))
    if (week) week.sets[muscle] = (week.sets[muscle] ?? 0) + 1
  }
  return result
}

export async function loadWeighIns(actorId: string, personId: string, database: FitnessDb = db) {
  await reach(actorId, personId, database)
  const rows = await database
    .select({ day: fitnessWeighIns.day, weightKg: fitnessWeighIns.weightKg })
    .from(fitnessWeighIns)
    .where(eq(fitnessWeighIns.userId, personId))
    .orderBy(asc(fitnessWeighIns.day))
  return weightTrend(rows)
}

export type MeasurementDay = {
  day: Day
  chestCm: number | null
  waistCm: number | null
  hipsCm: number | null
  armCm: number | null
  thighCm: number | null
}

/**
 * The tape measurements from every photo day, oldest first, for the
 * Measurements chart. They live on the photo days, so a coach sees them only
 * when the person switched photos on for that coach; anyone else gets null.
 */
export async function loadMeasurements(
  actorId: string,
  personId: string,
  database: FitnessDb = db
): Promise<MeasurementDay[] | null> {
  if (!(await canSeePhotos(actorId, personId, database))) return null
  return database
    .select({
      day: fitnessPhotoSessions.day,
      chestCm: fitnessPhotoSessions.chestCm,
      waistCm: fitnessPhotoSessions.waistCm,
      hipsCm: fitnessPhotoSessions.hipsCm,
      armCm: fitnessPhotoSessions.armCm,
      thighCm: fitnessPhotoSessions.thighCm,
    })
    .from(fitnessPhotoSessions)
    .where(eq(fitnessPhotoSessions.userId, personId))
    .orderBy(asc(fitnessPhotoSessions.day))
}

/** The person's target bodyweight, or null without one. A coach reads it. */
export async function loadTargetWeight(actorId: string, personId: string, database: FitnessDb = db) {
  await reach(actorId, personId, database)
  return (await profileFor(personId, database)).targetWeightKg
}

/** Sets or clears the person's own target bodyweight. */
export async function saveTargetWeight(userId: string, targetWeightKg: number | null, database: FitnessDb = db) {
  await profileFor(userId, database)
  await database
    .update(fitnessProfiles)
    .set({ targetWeightKg, updatedAt: now() })
    .where(eq(fitnessProfiles.userId, userId))
}

/** One weigh-in per day. A second one the same day replaces the first. */
export async function saveWeighIn(userId: string, input: { day: Day; weightKg: number }, database: FitnessDb = db) {
  await database
    .insert(fitnessWeighIns)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: [fitnessWeighIns.userId, fitnessWeighIns.day], set: { weightKg: input.weightKg } })
}

export async function deleteWeighIn(userId: string, day: Day, database: FitnessDb = db) {
  await database.delete(fitnessWeighIns).where(and(eq(fitnessWeighIns.userId, userId), eq(fitnessWeighIns.day, day)))
}

/**
 * This week's finished workouts against the weekly goal, and the run of weeks
 * it was hit. With a program, only that program's workouts count, which is
 * what its own dashboard shows; without one, every workout the person logged.
 */
export async function loadWeeklyGoal(personId: string, database: FitnessDb = db, programId?: string) {
  const profile = await preferencesFor(personId, database)
  const today = await todayFor(personId, database)
  const rows = await database
    .select({ day: fitnessWorkouts.day })
    .from(fitnessWorkouts)
    .where(
      and(
        eq(fitnessWorkouts.userId, personId),
        isNotNull(fitnessWorkouts.finishedAt),
        programId ? eq(fitnessWorkouts.programId, programId) : undefined
      )
    )
    .orderBy(desc(fitnessWorkouts.day))
    .limit(2000)
  const pausedWeeks = new Set<Day>()
  // One program's goal skips only that program's paused weeks.
  for (const pause of await pausesFor(personId, database, programId)) {
    for (const week of fullyPausedWeeks(pause.fromDay, pause.untilDay ?? addDays(today, 7))) pausedWeeks.add(week)
  }
  const skipped = await database
    .select({ day: fitnessScheduledWorkouts.day })
    .from(fitnessScheduledWorkouts)
    .innerJoin(fitnessPrograms, eq(fitnessPrograms.id, fitnessScheduledWorkouts.programId))
    .where(
      and(
        eq(fitnessPrograms.userId, personId),
        isNotNull(fitnessScheduledWorkouts.skippedAt),
        isNull(fitnessPrograms.archivedAt),
        programId ? eq(fitnessScheduledWorkouts.programId, programId) : undefined
      )
    )
  const { streak, thisWeek, weekGoal } = weeklyStreak({
    workoutDays: rows.map((row) => row.day),
    goal: profile.weeklyGoal,
    today,
    pausedWeeks,
    skippedDays: skipped.map((row) => row.day),
  })
  // This week's goal, less any day skipped on purpose.
  return { goal: weekGoal, thisWeek, streak }
}
