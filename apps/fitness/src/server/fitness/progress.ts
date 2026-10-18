import { and, asc, desc, eq, isNotNull } from "drizzle-orm"

import { addDays, weekStart, type Day } from "@/lib/fitness/dates"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { fullyPausedWeeks, weeklyStreak, weightTrend } from "@/lib/fitness/progress"
import { estimateOneRepMax } from "@/lib/fitness/weights"
import { db } from "@/server/db"
import { canReachPerson, type FitnessDb } from "@/server/fitness/access"
import { pausesFor, todayFor } from "@/server/fitness/calendar"
import { exercisesById } from "@/server/fitness/exercises"
import { preferencesFor } from "@/server/fitness/profile"
import { fitnessWeighIns, fitnessWorkoutSets, fitnessWorkouts } from "@/server/fitness/schema"
import { bestNumbers } from "@/server/fitness/workouts"

async function reach(actorId: string, personId: string, database: FitnessDb) {
  if (!(await canReachPerson(actorId, personId, database))) throw new Error(FITNESS_ERRORS.workoutNotFound)
}

/** Every done working set the person has logged, with its day. */
async function loggedSets(personId: string, database: FitnessDb, exerciseId?: string) {
  return database
    .select({
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
    .orderBy(asc(fitnessWorkouts.day))
}

export type LiftRecord = {
  exerciseId: string
  name: string
  muscles: string[]
  /** The routine type the lift belongs to, so a program shows only its own. */
  routineType: string
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

export type LiftPoint = { day: Day; oneRepMaxKg: number; heaviestKg: number; volumeKg: number }

/** One lift's estimated one-rep max for each day it was trained. */
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
    const point = byDay.get(set.day) ?? { day: set.day, oneRepMaxKg: 0, heaviestKg: 0, volumeKg: 0 }
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
  const { streak, thisWeek } = weeklyStreak({
    workoutDays: rows.map((row) => row.day),
    goal: profile.weeklyGoal,
    today,
    pausedWeeks,
  })
  return { goal: profile.weeklyGoal, thisWeek, streak }
}
