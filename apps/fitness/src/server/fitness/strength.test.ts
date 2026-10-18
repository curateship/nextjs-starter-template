import type { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { addDays } from "@/lib/fitness/dates"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import type { CustomShellDb } from "@/server/db"
import {
  loadCalendar,
  moveScheduled,
  pauseProgram,
  resumeProgram,
  todayFor,
} from "@/server/fitness/calendar"
import { builtInBySlug, listExercises, swapsFor, avoidExercise } from "@/server/fitness/exercises"
import { applyTemplate, copyWeekDay, loadWeek, restWeekDay, saveBaselineLift, saveStrengthSettings, setWeekDay } from "@/server/fitness/week"
import { createProgram, listPrograms } from "@/server/fitness/programs"
import { fitnessNoticeLinks, fitnessDayExercises, fitnessScheduledWorkouts } from "@/server/fitness/schema"
import {
  finishWorkout,
  discardUntouchedWorkouts,
  loadHistory,
  loadWorkout,
  openWorkout,
  saveSet,
  startWorkout,
  type WorkoutView,
} from "@/server/fitness/workouts"
import { saveAppSetting } from "@/server/fitness/app-settings"
import { DEFAULT_APP_SETTINGS } from "@/lib/fitness/app-settings"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
})

afterEach(async () => {
  await client.close()
})

async function fiveByFive() {
  const { id } = await createProgram(anna.id, anna.id, { name: "Get strong", routineType: "strength" }, database)
  const lifts = await builtInBySlug(database)
  await saveBaselineLift(anna.id, id, { exerciseId: lifts.get("back-squat")!.id, weightKg: 100, reps: 1 }, database)
  await applyTemplate(anna.id, id, "five-by-five", database)
  return { programId: id, lifts }
}

async function doEverySet(workout: WorkoutView, reps?: number) {
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) {
      await saveSet(anna.id, set.id, { done: true, reps: reps ?? set.targetReps }, database)
    }
  }
}

describe("programs", () => {
  it("refuses a routine type that isn't ready", async () => {
    await expect(
      createProgram(anna.id, anna.id, { name: "Bars", routineType: "calisthenics" }, database)
    ).rejects.toThrow(FITNESS_ERRORS.routineTypeNotLive)
  })

  it("makes the first program active and hides it from other people", async () => {
    const { programId } = await fiveByFive()
    const mine = await listPrograms(anna.id, anna.id, database)
    expect(mine).toHaveLength(1)
    expect(mine[0].isActive).toBe(true)
    expect(mine[0].workoutDays).toBe(3)
    await expect(loadCalendar(ben.id, programId, { from: "2000-01-01", to: "2200-01-01" }, database)).rejects.toThrow(
      FITNESS_ERRORS.programNotFound
    )
  })
})

describe("plan and calendar", () => {
  it("starts a template's squat at 75 out of 100 of the starting max", async () => {
    const { programId, lifts } = await fiveByFive()
    const plan = await loadWeek(programId, database)
    const squat = plan[0].exercises.find((exercise) => exercise.exerciseId === lifts.get("back-squat")!.id)
    expect(squat?.weightKg).toBe(75)
    // Bench was not in the starting data, so it starts empty.
    expect(plan[0].exercises[1].weightKg).toBe(0)
  })

  it("repeats the week: Monday A, Wednesday B, Friday A, every week", async () => {
    const { programId } = await fiveByFive()
    const today = await todayFor(anna.id, database)
    const { days } = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 28) }, database)
    expect(days.length).toBeGreaterThanOrEqual(12)
    expect(new Set(days.map((day) => new Date(`${day.day}T00:00:00Z`).getUTCDay()))).toEqual(new Set([1, 3, 5]))
    for (const entry of days) {
      const weekday = new Date(`${entry.day}T00:00:00Z`).getUTCDay()
      expect(entry.dayName).toBe(weekday === 3 ? "Day B" : "Day A")
    }
  })

  it("moves one day only and refuses a day that is taken", async () => {
    const { programId } = await fiveByFive()
    const today = await todayFor(anna.id, database)
    const { days } = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 28) }, database)
    const [first, second] = days
    await expect(moveScheduled(anna.id, first.id, second.day, database)).rejects.toThrow(FITNESS_ERRORS.dayTaken)
    const free = addDays(second.day, 1)
    await moveScheduled(anna.id, first.id, free, database)
    const after = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 28) }, database)
    expect(after.days.find((day) => day.id === first.id)).toMatchObject({ day: free, moved: true })
    expect(after.days.find((day) => day.id === second.id)?.day).toBe(second.day)
  })

  it("a weekday made a rest day leaves the calendar, and a new workout day joins it", async () => {
    const { programId } = await fiveByFive()
    const week = await loadWeek(programId, database)
    await restWeekDay(anna.id, week.find((day) => day.weekday === 5)!.id, database)
    await setWeekDay(anna.id, programId, 6, "Saturday arms", database)
    const today = await todayFor(anna.id, database)
    const { days } = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 28) }, database)
    expect(new Set(days.map((day) => new Date(`${day.day}T00:00:00Z`).getUTCDay()))).toEqual(new Set([1, 3, 6]))
  })

  it("copies a day's exercises onto another weekday", async () => {
    const { programId } = await fiveByFive()
    const week = await loadWeek(programId, database)
    const monday = week.find((day) => day.weekday === 1)!
    await copyWeekDay(anna.id, monday.id, 2, database)
    const after = await loadWeek(programId, database)
    const tuesday = after.find((day) => day.weekday === 2)!
    expect(tuesday.name).toBe(monday.name)
    expect(tuesday.exercises.map((exercise) => exercise.exerciseId)).toEqual(monday.exercises.map((exercise) => exercise.exerciseId))
  })

  it("a pause empties its days and resuming fills them again", async () => {
    const { programId } = await fiveByFive()
    const today = await todayFor(anna.id, database)
    await pauseProgram(anna.id, programId, { fromDay: today, untilDay: null, reason: "injury" }, database)
    const paused = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 28) }, database)
    expect(paused.days).toHaveLength(0)
    expect(paused.pause).toEqual({ from: today, until: null })
    await resumeProgram(anna.id, programId, database)
    const resumed = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 28) }, database)
    expect(resumed.days.length).toBeGreaterThanOrEqual(12)
    expect(resumed.pause).toBeNull()
  })
})

describe("logging", () => {
  async function firstScheduled(programId: string) {
    const today = await todayFor(anna.id, database)
    const { days } = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 28) }, database)
    return days[0]
  }

  it("adds warm-ups, then raises the weight after a clean session", async () => {
    const { programId, lifts } = await fiveByFive()
    const scheduled = await firstScheduled(programId)
    const { id } = await startWorkout(anna.id, { from: "scheduled", scheduledId: scheduled.id }, database)
    const again = await startWorkout(anna.id, { from: "scheduled", scheduledId: scheduled.id }, database)
    expect(again.id).toBe(id)
    const workout = await loadWorkout(anna.id, id, database)
    const squat = workout.exercises[0]
    expect(squat.sets.filter((set) => set.kind === "warmup").map((set) => set.weightKg)).toEqual([20, 30, 45, 60])
    expect(squat.sets.filter((set) => set.kind === "working")).toHaveLength(5)

    await doEverySet(workout)
    const summary = await finishWorkout(anna.id, id, { effort: 7, note: "Felt good" }, database)
    expect(summary.weightChanges).toContainEqual({ exerciseName: "Back squat", fromKg: 75, toKg: 77.5 })

    const [planSquat] = await database
      .select()
      .from(fitnessDayExercises)
      .where(
        and(
          eq(fitnessDayExercises.exerciseId, lifts.get("back-squat")!.id),
          eq(fitnessDayExercises.dayId, scheduled.dayId!)
        )
      )
    expect(planSquat.weightKg).toBe(77.5)
    const [row] = await database
      .select()
      .from(fitnessScheduledWorkouts)
      .where(eq(fitnessScheduledWorkouts.id, scheduled.id))
    expect(row.status).toBe("done")
    const history = await loadHistory(anna.id, anna.id, database)
    expect(history[0]).toMatchObject({ finished: true, effort: 7, note: "Felt good" })
  })

  it("drops the weight after three sessions of missed reps", async () => {
    const { programId, lifts } = await fiveByFive()
    const squatId = lifts.get("back-squat")!.id
    await database.update(fitnessDayExercises).set({ weightKg: 100 }).where(eq(fitnessDayExercises.exerciseId, squatId))
    const plan = await loadWeek(programId, database)
    for (let session = 0; session < 3; session += 1) {
      const { id } = await startWorkout(anna.id, { from: "day", dayId: plan[0].id }, database)
      await doEverySet(await loadWorkout(anna.id, id, database), 3)
      await finishWorkout(anna.id, id, { effort: null, note: "" }, database)
    }
    const [planSquat] = await database
      .select()
      .from(fitnessDayExercises)
      .where(and(eq(fitnessDayExercises.exerciseId, squatId), eq(fitnessDayExercises.dayId, plan[0].id)))
    expect(planSquat.weightKg).toBe(90)
  })

  it("sends a record notice when a lift beats its history", async () => {
    const { programId } = await fiveByFive()
    const plan = await loadWeek(programId, database)
    await saveAppSetting("workouts", { ...DEFAULT_APP_SETTINGS.workouts, warmupsOn: false }, anna.id, database)
    for (const _ of [1, 2]) {
      const { id } = await startWorkout(anna.id, { from: "day", dayId: plan[0].id }, database)
      await doEverySet(await loadWorkout(anna.id, id, database))
      await finishWorkout(anna.id, id, { effort: null, note: "" }, database)
    }
    const notices = await database
      .select({ message: customShellNotifications.message, href: fitnessNoticeLinks.href })
      .from(customShellNotifications)
      .innerJoin(fitnessNoticeLinks, eq(fitnessNoticeLinks.noticeId, customShellNotifications.id))
      .where(eq(customShellNotifications.recipientUserId, anna.id))
    expect(notices.map((notice) => notice.message)).toContain("New record: Back squat, 77.5 kg")
  })

  it("keeps a light week light and its weights where they were", async () => {
    const { programId, lifts } = await fiveByFive()
    // Two-week blocks starting a week ago make this week the light one.
    const today = await todayFor(anna.id, database)
    await saveStrengthSettings(anna.id, programId, { blockWeeks: 2, lightWeekPercent: 60 }, database)
    await database.execute(
      `update fitness_strength_settings set start_day = '${addDays(today, -7)}' where program_id = '${programId}'` as never
    )
    const plan = await loadWeek(programId, database)
    const { id } = await startWorkout(anna.id, { from: "day", dayId: plan[0].id }, database)
    const workout = await loadWorkout(anna.id, id, database)
    expect(workout.lightWeek).toBe(true)
    const squat = workout.exercises.find((exercise) => exercise.exerciseId === lifts.get("back-squat")!.id)!
    expect(squat.sets.find((set) => set.kind === "working")?.weightKg).toBe(45)
    await doEverySet(workout)
    const summary = await finishWorkout(anna.id, id, { effort: null, note: "" }, database)
    expect(summary.weightChanges).toEqual([])
  })
})

describe("a workout with nothing ticked", () => {
  it("can't be finished and stays out of History", async () => {
    const { programId } = await fiveByFive()
    const { id } = await startWorkout(anna.id, { from: "empty", programId }, database)
    await expect(finishWorkout(anna.id, id, { effort: null, note: "" }, database)).rejects.toThrow(
      FITNESS_ERRORS.nothingLogged
    )
    expect((await loadHistory(anna.id, anna.id, database)).map((row) => row.id)).not.toContain(id)
  })

  it("isn't offered to pick up, and is cleared away after six hours", async () => {
    const { programId } = await fiveByFive()
    const { id } = await startWorkout(anna.id, { from: "empty", programId }, database)
    expect(await openWorkout(anna.id, database)).toBeNull()
    expect(await discardUntouchedWorkouts(anna.id, database)).toBe(0)
    const later = new Date(Date.now() + 7 * 3_600_000)
    expect(await discardUntouchedWorkouts(anna.id, database, later)).toBe(1)
    await expect(loadWorkout(anna.id, id, database)).rejects.toThrow(FITNESS_ERRORS.workoutNotFound)
  })

  it("keeps one with a ticked set, however old", async () => {
    const { programId } = await fiveByFive()
    const week = await loadWeek(programId, database)
    const { id } = await startWorkout(anna.id, { from: "day", dayId: week[0].id }, database)
    const workout = await loadWorkout(anna.id, id, database)
    await saveSet(anna.id, workout.exercises[0].sets[0].id, { done: true, reps: 5 }, database)
    expect((await openWorkout(anna.id, database))?.id).toBe(id)
    expect(await discardUntouchedWorkouts(anna.id, database, new Date(Date.now() + 30 * 86_400_000))).toBe(0)
  })

  it("shows in History once a set is ticked, finished or not", async () => {
    const { programId } = await fiveByFive()
    const week = await loadWeek(programId, database)
    const { id } = await startWorkout(anna.id, { from: "day", dayId: week[0].id }, database)
    const workout = await loadWorkout(anna.id, id, database)
    await saveSet(anna.id, workout.exercises[0].sets[0].id, { done: true, reps: 5 }, database)
    expect((await loadHistory(anna.id, anna.id, database)).find((row) => row.id === id)).toMatchObject({ finished: false })
  })
})

describe("swaps and the pain list", () => {
  it("offers lifts for the same muscle and never a painful one", async () => {
    const lifts = await builtInBySlug(database)
    const squat = lifts.get("back-squat")!
    const swaps = await swapsFor(anna.id, squat.id, [], database)
    expect(swaps.map((exercise) => exercise.slug)).toContain("leg-press")
    expect(swaps.map((exercise) => exercise.slug)).not.toContain("bench-press")
    await avoidExercise(anna.id, lifts.get("leg-press")!.id, "Knee", database)
    const after = await swapsFor(anna.id, squat.id, [], database)
    expect(after.map((exercise) => exercise.slug)).not.toContain("leg-press")
    const all = await listExercises(anna.id, database)
    expect(all.find((exercise) => exercise.slug === "leg-press")).toMatchObject({ avoided: true, avoidNote: "Knee" })
  })

  it("keeps to the equipment the person has", async () => {
    const lifts = await builtInBySlug(database)
    const swaps = await swapsFor(anna.id, lifts.get("back-squat")!.id, ["dumbbell"], database)
    expect(swaps.every((exercise) => exercise.equipment.every((item) => item === "dumbbell" || item === "bodyweight"))).toBe(true)
    expect(swaps.map((exercise) => exercise.slug)).toContain("goblet-squat")
  })
})
