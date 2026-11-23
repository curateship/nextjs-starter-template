import { and, asc, eq, inArray, max } from "drizzle-orm"

import { weekOrder } from "@/lib/fitness/dates"
import { defaultRange } from "@/lib/fitness/calisthenics"
import { groupedIds, orderByBodyPart } from "@/lib/fitness/day-order"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { PLAN_TEMPLATES, TEMPLATE_START_SHARE, type ExperienceId, type GoalId } from "@/lib/fitness/templates"
import { estimateOneRepMax, roundToStep } from "@/lib/fitness/weights"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { programFor, type FitnessDb, type FitnessProgram } from "@/server/fitness/access"
import { rescheduleFromToday, todayFor } from "@/server/fitness/calendar"
import { builtInBySlug, exerciseForRoutine } from "@/server/fitness/exercises"
import { preferencesFor } from "@/server/fitness/profile"
import {
  fitnessBaselineLifts,
  fitnessBaselines,
  fitnessCalisthenicsSettings,
  fitnessWeekDays,
  fitnessDayExercises,
  fitnessExercises,
  fitnessStrengthSettings,
} from "@/server/fitness/schema"

export type StrengthSettings = Omit<typeof fitnessStrengthSettings.$inferSelect, "programId" | "scheduledThrough">

export type DayExercise = {
  id: string
  exerciseId: string
  position: number
  sets: number
  reps: number
  weightKg: number
  restSeconds: number
  groupKey: string | null
  missStreak: number
  /** A Calisthenics move's rep range; `reps` is the target inside it. Null for a strength lift. */
  repsMin: number | null
  repsMax: number | null
  /** Calisthenics: good sessions in a row toward the step up. */
  goodStreak: number
}

/** Calisthenics' own rules for one program: whether moves step up by themselves, and after how many good sessions. */
export type CalisthenicsSettings = { autoStepUp: boolean; sessionsToStep: number }

export const DEFAULT_CALISTHENICS: CalisthenicsSettings = { autoStepUp: true, sessionsToStep: 1 }

/** One weekday that holds a workout. A weekday with no entry is a rest day. */
export type WeekDay = { id: string; name: string; weekday: number; exercises: DayExercise[] }

export type Baseline = {
  bodyweightKg: number | null
  heightCm: number | null
  chestCm: number | null
  waistCm: number | null
  hipsCm: number | null
  armCm: number | null
  thighCm: number | null
  goal: GoalId | null
  experience: ExperienceId | null
  equipment: string[]
  lifts: { exerciseId: string; weightKg: number; reps: number; oneRepMaxKg: number }[]
}

export async function loadStrengthSettings(programId: string, database: FitnessDb = db): Promise<StrengthSettings> {
  const [strength] = await database
    .select()
    .from(fitnessStrengthSettings)
    .where(eq(fitnessStrengthSettings.programId, programId))
    .limit(1)
  const { programId: _id, scheduledThrough: _through, ...settings } = strength
  return settings
}

/**
 * Saves one day's exercises in the order the Day view shows them, body part
 * by body part with a superset kept together (`orderByBodyPart`), and returns
 * them in that order. Every change that adds, swaps or reorders a day's
 * exercises ends here, and a workout starts from it, so the numbers on the
 * Day view, the saved order and the workout always agree. A day saved before
 * 20 Oct 2026 in another order is put right the first time it is touched.
 */
export async function settleDayOrder(dayId: string, database: FitnessDb = db) {
  const rows = await database
    .select()
    .from(fitnessDayExercises)
    .where(eq(fitnessDayExercises.dayId, dayId))
    .orderBy(asc(fitnessDayExercises.position))
  if (rows.length < 2) return rows
  const library = await database
    .select({ id: fitnessExercises.id, muscles: fitnessExercises.muscles })
    .from(fitnessExercises)
    .where(inArray(fitnessExercises.id, [...new Set(rows.map((row) => row.exerciseId))]))
  const muscles = new Map(library.map((entry) => [entry.id, entry.muscles]))
  const order = groupedIds(orderByBodyPart(rows, (exerciseId) => muscles.get(exerciseId) ?? []))
  const byId = new Map(rows.map((row) => [row.id, row]))
  const settled = order.map((id, position) => ({ ...byId.get(id)!, position }))
  for (const row of settled) {
    if (byId.get(row.id)!.position !== row.position) {
      await database.update(fitnessDayExercises).set({ position: row.position }).where(eq(fitnessDayExercises.id, row.id))
    }
  }
  return settled
}

/** The program's week, Monday first. Rest days have no entry. */
export async function loadWeek(programId: string, database: FitnessDb = db): Promise<WeekDay[]> {
  const days = (
    await database.select().from(fitnessWeekDays).where(eq(fitnessWeekDays.programId, programId))
  ).sort((a, b) => weekOrder(a.weekday) - weekOrder(b.weekday))
  if (days.length === 0) return []
  const exercises = await database
    .select()
    .from(fitnessDayExercises)
    .where(inArray(fitnessDayExercises.dayId, days.map((day) => day.id)))
    .orderBy(asc(fitnessDayExercises.position))
  return days.map((day) => ({
    id: day.id,
    name: day.name,
    weekday: day.weekday,
    exercises: exercises
      .filter((exercise) => exercise.dayId === day.id)
      .map(({ dayId: _day, ...exercise }) => exercise),
  }))
}

export async function loadBaseline(programId: string, database: FitnessDb = db): Promise<Baseline> {
  const [row] = await database
    .select()
    .from(fitnessBaselines)
    .where(eq(fitnessBaselines.programId, programId))
    .limit(1)
  const lifts = await database
    .select()
    .from(fitnessBaselineLifts)
    .where(eq(fitnessBaselineLifts.programId, programId))
  return {
    bodyweightKg: row?.bodyweightKg ?? null,
    heightCm: row?.heightCm ?? null,
    chestCm: row?.chestCm ?? null,
    waistCm: row?.waistCm ?? null,
    hipsCm: row?.hipsCm ?? null,
    armCm: row?.armCm ?? null,
    thighCm: row?.thighCm ?? null,
    goal: (row?.goal as GoalId | null) ?? null,
    experience: (row?.experience as ExperienceId | null) ?? null,
    equipment: row?.equipment ?? [],
    lifts: lifts.map((lift) => ({
      exerciseId: lift.exerciseId,
      weightKg: lift.weightKg,
      reps: lift.reps,
      oneRepMaxKg: estimateOneRepMax(lift.weightKg, lift.reps),
    })),
  }
}

export async function loadCalisthenicsSettings(
  programId: string,
  database: FitnessDb = db
): Promise<CalisthenicsSettings> {
  const [row] = await database
    .select()
    .from(fitnessCalisthenicsSettings)
    .where(eq(fitnessCalisthenicsSettings.programId, programId))
    .limit(1)
  return row ? { autoStepUp: row.autoStepUp, sessionsToStep: row.sessionsToStep } : DEFAULT_CALISTHENICS
}

export async function saveCalisthenicsSettings(
  actorId: string,
  programId: string,
  change: Partial<CalisthenicsSettings>,
  database: FitnessDb = db
) {
  await programFor(actorId, programId, database, { forChange: true })
  const settings = { ...(await loadCalisthenicsSettings(programId, database)), ...change }
  await database
    .insert(fitnessCalisthenicsSettings)
    .values({ programId, ...settings })
    .onConflictDoUpdate({ target: fitnessCalisthenicsSettings.programId, set: settings })
  return settings
}

/**
 * A Calisthenics move's range and target, kept in order: the bottom never
 * above the top, and the target inside them. Raising the bottom past the top
 * takes the top with it.
 */
export function settleRange(reps: number, repsMin: number, repsMax: number) {
  const top = Math.max(repsMin, repsMax)
  return { reps: Math.min(top, Math.max(repsMin, reps)), repsMin, repsMax: top }
}

export type StrengthSettingsChange = Partial<{
  autoIncrease: boolean
  increaseKg: number
  missesBeforeDrop: number
  dropPercent: number
  blockWeeks: number
  lightWeekPercent: number
}>

/** Saves the weight rules and the training blocks. */
export async function saveStrengthSettings(
  actorId: string,
  programId: string,
  change: StrengthSettingsChange,
  database: FitnessDb = db
) {
  await programFor(actorId, programId, database, { forChange: true })
  await database
    .update(fitnessStrengthSettings)
    .set(change)
    .where(eq(fitnessStrengthSettings.programId, programId))
  return loadStrengthSettings(programId, database)
}

export type BaselineChange = Partial<Omit<Baseline, "lifts">>

export async function saveBaseline(
  actorId: string,
  programId: string,
  change: BaselineChange,
  database: FitnessDb = db
) {
  await programFor(actorId, programId, database, { forChange: true })
  await database
    .update(fitnessBaselines)
    .set({ ...change, updatedAt: now() })
    .where(eq(fitnessBaselines.programId, programId))
  return loadBaseline(programId, database)
}

/** A best lift on day one, as "100 kg once" or "80 kg for 5". */
export async function saveBaselineLift(
  actorId: string,
  programId: string,
  lift: { exerciseId: string; weightKg: number; reps: number },
  database: FitnessDb = db
) {
  const program = await programFor(actorId, programId, database, { forChange: true })
  await exerciseForRoutine(program.userId, lift.exerciseId, program.routineType, database)
  await database
    .insert(fitnessBaselineLifts)
    .values({ programId, ...lift })
    .onConflictDoUpdate({
      target: [fitnessBaselineLifts.programId, fitnessBaselineLifts.exerciseId],
      set: { weightKg: lift.weightKg, reps: lift.reps },
    })
  return loadBaseline(programId, database)
}

export async function removeBaselineLift(
  actorId: string,
  programId: string,
  exerciseId: string,
  database: FitnessDb = db
) {
  await programFor(actorId, programId, database, { forChange: true })
  await database
    .delete(fitnessBaselineLifts)
    .where(and(eq(fitnessBaselineLifts.programId, programId), eq(fitnessBaselineLifts.exerciseId, exerciseId)))
  return loadBaseline(programId, database)
}

async function dayFor(actorId: string, dayId: string, database: FitnessDb, forChange = true) {
  const [day] = await database.select().from(fitnessWeekDays).where(eq(fitnessWeekDays.id, dayId)).limit(1)
  if (!day) throw new Error(FITNESS_ERRORS.weekDayNotFound)
  const program = await programFor(actorId, day.programId, database, { forChange })
  return { day, program }
}

async function relayCalendar(program: FitnessProgram, database: FitnessDb) {
  await rescheduleFromToday(program.id, await todayFor(program.userId, database), database)
}

/**
 * Makes a weekday a workout day with this name, or renames it when it already
 * is one. The calendar is laid out again from today.
 */
export async function setWeekDay(
  actorId: string,
  programId: string,
  weekday: number,
  name: string,
  database: FitnessDb = db
) {
  const program = await programFor(actorId, programId, database, { forChange: true })
  const trimmed = name.trim()
  if (!trimmed) throw new Error(FITNESS_ERRORS.nameNeeded)
  const [existing] = await database
    .select({ id: fitnessWeekDays.id })
    .from(fitnessWeekDays)
    .where(and(eq(fitnessWeekDays.programId, programId), eq(fitnessWeekDays.weekday, weekday)))
    .limit(1)
  if (existing) {
    await database.update(fitnessWeekDays).set({ name: trimmed }).where(eq(fitnessWeekDays.id, existing.id))
    return { id: existing.id }
  }
  const id = uuid()
  await database.insert(fitnessWeekDays).values({ id, programId, name: trimmed, weekday })
  await relayCalendar(program, database)
  return { id }
}

/** Makes a weekday a rest day. Its exercises and planned dates go; logged workouts stay. */
export async function restWeekDay(actorId: string, dayId: string, database: FitnessDb = db) {
  const { program } = await dayFor(actorId, dayId, database)
  await database.delete(fitnessWeekDays).where(eq(fitnessWeekDays.id, dayId))
  await relayCalendar(program, database)
}

/**
 * Copies one day's exercises onto another weekday, replacing whatever was
 * there, so a week of Mon A, Wed B, Fri A is built from two days of typing.
 */
export async function copyWeekDay(actorId: string, dayId: string, toWeekday: number, database: FitnessDb = db) {
  const { day, program } = await dayFor(actorId, dayId, database)
  if (day.weekday === toWeekday) return { id: day.id }
  const target = await setWeekDay(actorId, program.id, toWeekday, day.name, database)
  const source = await database
    .select()
    .from(fitnessDayExercises)
    .where(eq(fitnessDayExercises.dayId, day.id))
    .orderBy(asc(fitnessDayExercises.position))
  await database.delete(fitnessDayExercises).where(eq(fitnessDayExercises.dayId, target.id))
  const groups = new Map<string, string>()
  const rows = source.map((exercise) => {
    const groupKey = exercise.groupKey ? (groups.get(exercise.groupKey) ?? uuid()) : null
    if (exercise.groupKey && groupKey) groups.set(exercise.groupKey, groupKey)
    return { ...exercise, id: uuid(), dayId: target.id, groupKey, missStreak: 0, goodStreak: 0 }
  })
  if (rows.length) await database.insert(fitnessDayExercises).values(rows)
  await settleDayOrder(target.id, database)
  return target
}

type DayExerciseInput = {
  sets: number
  reps: number
  weightKg: number
  restSeconds: number
  /** Calisthenics only: the rep range. Without one, a move gets its target up to four more. */
  repsMin?: number | null
  repsMax?: number | null
}

export async function addDayExercise(
  actorId: string,
  dayId: string,
  exerciseId: string,
  input: DayExerciseInput,
  database: FitnessDb = db
) {
  const { program } = await dayFor(actorId, dayId, database)
  await exerciseForRoutine(program.userId, exerciseId, program.routineType, database)
  const [{ last }] = await database
    .select({ last: max(fitnessDayExercises.position) })
    .from(fitnessDayExercises)
    .where(eq(fitnessDayExercises.dayId, dayId))
  const id = uuid()
  // A Calisthenics move counts no weight and lives in a rep range.
  const counted =
    program.routineType === "calisthenics"
      ? {
          ...input,
          weightKg: 0,
          ...settleRange(input.reps, input.repsMin ?? input.reps, input.repsMax ?? defaultRange(input.reps).repsMax),
        }
      : { ...input, repsMin: null, repsMax: null }
  await database.insert(fitnessDayExercises).values({
    id,
    dayId,
    exerciseId,
    position: (last ?? -1) + 1,
    ...counted,
    groupKey: null,
    missStreak: 0,
  })
  await settleDayOrder(dayId, database)
  return { id }
}

async function dayExerciseFor(actorId: string, dayExerciseId: string, database: FitnessDb) {
  const [row] = await database
    .select()
    .from(fitnessDayExercises)
    .where(eq(fitnessDayExercises.id, dayExerciseId))
    .limit(1)
  if (!row) throw new Error(FITNESS_ERRORS.planExerciseNotFound)
  const { program } = await dayFor(actorId, row.dayId, database)
  return { row, program }
}

export async function updateDayExercise(
  actorId: string,
  dayExerciseId: string,
  change: Partial<DayExerciseInput & { exerciseId: string }>,
  database: FitnessDb = db
) {
  const { row, program } = await dayExerciseFor(actorId, dayExerciseId, database)
  if (change.exerciseId) await exerciseForRoutine(program.userId, change.exerciseId, program.routineType, database)
  const counted =
    program.routineType === "calisthenics"
      ? {
          ...change,
          weightKg: 0,
          ...settleRange(
            change.reps ?? row.reps,
            change.repsMin ?? row.repsMin ?? row.reps,
            change.repsMax ?? row.repsMax ?? defaultRange(row.reps).repsMax
          ),
          // Another move, or a new range, starts its run of good sessions again.
          ...(change.exerciseId || change.repsMin !== undefined || change.repsMax !== undefined ? { goodStreak: 0 } : {}),
        }
      : { ...change, repsMin: undefined, repsMax: undefined }
  await database
    .update(fitnessDayExercises)
    .set({ ...counted, ...(change.weightKg !== undefined ? { missStreak: 0 } : {}) })
    .where(eq(fitnessDayExercises.id, dayExerciseId))
  // A swap can move the lift to another body part.
  if (change.exerciseId) await settleDayOrder(row.dayId, database)
}

export async function removeDayExercise(actorId: string, dayExerciseId: string, database: FitnessDb = db) {
  await dayExerciseFor(actorId, dayExerciseId, database)
  await database.delete(fitnessDayExercises).where(eq(fitnessDayExercises.id, dayExerciseId))
}

export async function reorderDayExercises(
  actorId: string,
  dayId: string,
  ids: string[],
  database: FitnessDb = db
) {
  await dayFor(actorId, dayId, database)
  const rows = await database
    .select({ id: fitnessDayExercises.id })
    .from(fitnessDayExercises)
    .where(eq(fitnessDayExercises.dayId, dayId))
  const known = new Set(rows.map((row) => row.id))
  for (const [position, id] of ids.filter((id) => known.has(id)).entries()) {
    await database.update(fitnessDayExercises).set({ position }).where(eq(fitnessDayExercises.id, id))
  }
  // An order sent from an older screen, or across body parts, is put back into body part order.
  await settleDayOrder(dayId, database)
}

/**
 * Joins an exercise to the one above it as a superset, or takes it out.
 * Joined exercises share one group, so three in a row make a circuit.
 *
 * Taking a lift out of the middle of a circuit splits it in two: the lifts
 * above keep the group and the lifts below get one of their own, so the two
 * ends never stay joined behind a lift that isn't. A lift left on its own
 * loses its group altogether. Joining a lift that already leads a group below
 * brings that whole group along.
 */
export async function setSuperset(
  actorId: string,
  dayExerciseId: string,
  joined: boolean,
  database: FitnessDb = db
) {
  const { row } = await dayExerciseFor(actorId, dayExerciseId, database)
  // "The one above" is the one above on the Day view.
  const siblings = await settleDayOrder(row.dayId, database)
  const index = siblings.findIndex((sibling) => sibling.id === row.id)
  /** The run of neighbours sharing `key`, walking from `from` in `step` direction. */
  const run = (from: number, step: 1 | -1, key: string | null) => {
    const ids: string[] = []
    for (let at = from; key && at >= 0 && at < siblings.length && siblings[at].groupKey === key; at += step) {
      ids.push(siblings[at].id)
    }
    return ids
  }
  const setKey = async (ids: string[], groupKey: string | null) => {
    if (ids.length === 0) return
    await database.update(fitnessDayExercises).set({ groupKey }).where(inArray(fitnessDayExercises.id, ids))
  }

  if (!joined) {
    const above = run(index - 1, -1, row.groupKey)
    const below = run(index + 1, 1, row.groupKey)
    await setKey([row.id], null)
    if (above.length === 1) await setKey(above, null)
    await setKey(below, below.length > 1 ? uuid() : null)
    return
  }
  const above = index > 0 ? siblings[index - 1] : null
  if (!above) return
  const groupKey = above.groupKey ?? uuid()
  const following = run(index + 1, 1, row.groupKey)
  await setKey([above.id, row.id, ...following], groupKey)
  await settleDayOrder(row.dayId, database)
}

/**
 * Replaces the program's week with a starter template and lays the calendar
 * out again. Each lift starts at 75 out of 100 of the lifter's estimated
 * one-rep max from their starting data, rounded to their plates, or empty
 * when they gave none for that lift.
 */
export async function applyTemplate(
  actorId: string,
  programId: string,
  templateId: string,
  database: FitnessDb = db
) {
  const program = await programFor(actorId, programId, database, { forChange: true })
  const template = PLAN_TEMPLATES.find(
    (candidate) => candidate.id === templateId && candidate.routineType === program.routineType
  )
  if (!template) throw new Error(FITNESS_ERRORS.templateNotFound)
  const bySlug = await builtInBySlug(database)
  const baseline = await loadBaseline(programId, database)
  const profile = await preferencesFor(program.userId, database)
  const startWeight = (exerciseId: string) => {
    const lift = baseline.lifts.find((candidate) => candidate.exerciseId === exerciseId)
    return lift ? roundToStep(lift.oneRepMaxKg * TEMPLATE_START_SHARE, profile.stepKg) : 0
  }
  await database.delete(fitnessWeekDays).where(eq(fitnessWeekDays.programId, programId))
  for (const day of template.days) {
    const dayId = uuid()
    await database.insert(fitnessWeekDays).values({ id: dayId, programId, name: day.name, weekday: day.weekday })
    const groups = new Map<string, string>()
    const rows = day.exercises.flatMap((exercise, position) => {
      const found = bySlug.get(exercise.slug)
      if (!found) return []
      const groupKey = exercise.group ? (groups.get(exercise.group) ?? uuid()) : null
      if (exercise.group && groupKey) groups.set(exercise.group, groupKey)
      return [
        {
          id: uuid(),
          dayId: dayId,
          exerciseId: found.id,
          position,
          sets: exercise.sets,
          reps: exercise.reps,
          repsMin: exercise.repsMax ? exercise.reps : null,
          repsMax: exercise.repsMax ?? null,
          // A bodyweight lift's weight is only what hangs from the belt; a Calisthenics move counts none.
          weightKg: found.isBodyweight || template.routineType === "calisthenics" ? 0 : startWeight(found.id),
          restSeconds: exercise.restSeconds,
          groupKey,
          missStreak: 0,
        },
      ]
    })
    if (rows.length > 0) await database.insert(fitnessDayExercises).values(rows)
    await settleDayOrder(dayId, database)
  }
  await relayCalendar(program, database)
}
