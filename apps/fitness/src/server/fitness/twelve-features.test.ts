import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { checkInWeek } from "@/lib/fitness/check-in"
import { addDays, weekStart, weekdayOf } from "@/lib/fitness/dates"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import type { CustomShellDb } from "@/server/db"
import { saveAppSetting } from "@/server/fitness/app-settings"
import { loadCalendar, skipScheduled, todayFor } from "@/server/fitness/calendar"
import { checkInDue, listCheckIns, markCheckInsSeen, saveCheckIn } from "@/server/fitness/check-ins"
import { answerCoach, inviteClient, listClients, setCoachPhotos } from "@/server/fitness/coach"
import { deleteCoachNote, liftNotesFor, loadCoachNotes, saveCoachNote } from "@/server/fitness/coach-notes"
import { builtInBySlug, createExercise } from "@/server/fitness/exercises"
import { createPhotoSession } from "@/server/fitness/photos"
import {
  loadMeasurements,
  loadRecordTimeline,
  loadWeeklyGoal,
  loadWeighIns,
  saveTargetWeight,
  loadTargetWeight,
} from "@/server/fitness/progress"
import { createProgram, runProgramAgain, setProgramWeeks } from "@/server/fitness/programs"
import { missRun, runReminderJobs } from "@/server/fitness/reminders"
import { fitnessScheduledWorkouts, fitnessStrengthSettings } from "@/server/fitness/schema"
import { copyProgramToClient } from "@/server/fitness/sharing"
import { addDayExercise, applyTemplate, loadWeek, saveBaselineLift, setWeekDay } from "@/server/fitness/week"
import { finishWorkout, loadWorkout, saveSet, startWorkout } from "@/server/fitness/workouts"
import { customShellNotifications, customShellUsers, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let coach: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  coach = await insertUser(database, { name: "Cleo", email: "cleo@example.test", role: "coach" })
})

afterEach(async () => {
  await client.close()
})

async function fiveByFive(owner = anna) {
  const { id } = await createProgram(owner.id, owner.id, { name: "Strong", routineType: "strength" }, database)
  await applyTemplate(owner.id, id, "five-by-five", database)
  return id
}

async function linkCoach() {
  await inviteClient(coach.id, "anna@example.test", database)
  await answerCoach(anna.id, coach.id, true, database)
}

async function noticesFor(userId: string) {
  const rows = await database
    .select({ message: customShellNotifications.message })
    .from(customShellNotifications)
    .where(eq(customShellNotifications.recipientUserId, userId))
  return rows.map((row) => row.message ?? "")
}

/** Logs a whole workout of a weekday, every set at its target or at `reps`, and finishes it. */
async function trainDay(programId: string, reps?: number) {
  const [day] = await loadWeek(programId, database)
  const { id } = await startWorkout(anna.id, { from: "day", dayId: day.id }, database)
  const workout = await loadWorkout(anna.id, id, database)
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) await saveSet(anna.id, set.id, { done: true, reps: reps ?? set.targetReps }, database)
  }
  return finishWorkout(anna.id, id, { effort: null, note: "" }, database)
}

const quiet = { remindersOn: false, time: "00:00", channel: "bell" as const, nudgeOn: false, checkInOn: false, photoReminderOn: false }

describe("skipping a day", () => {
  it("is neither done nor missed: no reminder, no nudge, the week's goal drops, and it can be taken back", async () => {
    const programId = await fiveByFive()
    await saveAppSetting("reminders", { ...quiet, remindersOn: true, nudgeOn: true }, anna.id, database)
    const today = await todayFor(anna.id, database)
    const { days } = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 14) }, database)
    const first = days[0]
    await skipScheduled(anna.id, first.id, true, database)
    const after = await loadCalendar(anna.id, programId, { from: first.day, to: first.day }, database)
    expect(after.days[0].status).toBe("skipped")
    await runReminderJobs(database, new Date(`${first.day}T08:00:00Z`))
    await runReminderJobs(database, new Date(`${addDays(first.day, 1)}T08:00:00Z`))
    const notices = await noticesFor(anna.id)
    expect(notices.some((message) => message.startsWith("Workout today"))).toBe(false)
    expect(notices.some((message) => message.startsWith("You missed"))).toBe(false)
    if (weekStart(first.day) === weekStart(today)) {
      expect((await loadWeeklyGoal(anna.id, database, programId)).goal).toBe(2)
    }
    await skipScheduled(anna.id, first.id, false, database)
    const back = await loadCalendar(anna.id, programId, { from: first.day, to: first.day }, database)
    expect(back.days[0].status).not.toBe("skipped")
  })

  it("can't skip a day with a workout on it", async () => {
    const programId = await fiveByFive()
    const today = await todayFor(anna.id, database)
    const { days } = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 14) }, database)
    await startWorkout(anna.id, { from: "scheduled", scheduledId: days[0].id }, database)
    await expect(skipScheduled(anna.id, days[0].id, true, database)).rejects.toThrow(FITNESS_ERRORS.skipHasWorkout)
  })
})

describe("program length", () => {
  it("plans nothing past the last week, and runs again from the coming Monday once over", async () => {
    const programId = await fiveByFive()
    await setProgramWeeks(anna.id, programId, 1, database)
    const today = await todayFor(anna.id, database)
    const { days } = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 40) }, database)
    expect(days.every((entry) => entry.day <= addDays(today, 6))).toBe(true)
    await expect(runProgramAgain(anna.id, programId, database)).rejects.toThrow(FITNESS_ERRORS.programNotOver)

    // Its one week ended last week.
    await database
      .update(fitnessStrengthSettings)
      .set({ startDay: addDays(today, -14) })
      .where(eq(fitnessStrengthSettings.programId, programId))
    await runProgramAgain(anna.id, programId, database)
    const [settings] = await database
      .select({ startDay: fitnessStrengthSettings.startDay })
      .from(fitnessStrengthSettings)
      .where(eq(fitnessStrengthSettings.programId, programId))
    expect(weekdayOf(settings.startDay)).toBe(1)
    expect(settings.startDay >= today).toBe(true)
    // Nothing is planned before week 1 starts.
    const again = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 40) }, database)
    expect(again.days.length).toBeGreaterThan(0)
    expect(again.days.every((entry) => entry.day >= settings.startDay && entry.day <= addDays(settings.startDay, 6))).toBe(true)
  })
})

describe("coach's client overview and the notice after two misses", () => {
  it("tells the coach once for a run of misses, and the table counts the week", async () => {
    const programId = await fiveByFive()
    await linkCoach()
    await saveAppSetting("reminders", quiet, anna.id, database)
    const today = await todayFor(anna.id, database)
    const { days } = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 21) }, database)
    // The day after the second planned workout, both missed.
    await runReminderJobs(database, new Date(`${addDays(days[1].day, 1)}T08:00:00Z`))
    await runReminderJobs(database, new Date(`${addDays(days[1].day, 1)}T08:00:00Z`))
    await runReminderJobs(database, new Date(`${addDays(days[2].day, 1)}T08:00:00Z`))
    const sent = (await noticesFor(coach.id)).filter((message) => message.endsWith(" in a row"))
    expect(sent).toEqual([`Anna missed ${days[0].dayName} and ${days[1].dayName} in a row`])

    const [row] = await listClients(coach.id, database)
    expect(row.overview).toMatchObject({ lastWorkout: null, thisWeek: 0, goal: 3 })
  })

  it("still tells the coach about two misses after a long stretch of skipped days, and once for a long run", async () => {
    const programId = await fiveByFive()
    await linkCoach()
    await saveAppSetting("reminders", quiet, anna.id, database)
    const today = await todayFor(anna.id, database)
    const { days } = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 28) }, database)
    for (const day of days.slice(0, 8)) await skipScheduled(anna.id, day.id, true, database)
    await runReminderJobs(database, new Date(`${addDays(days[9].day, 1)}T08:00:00Z`))
    const missed = async () => (await noticesFor(coach.id)).filter((message) => message.endsWith(" in a row"))
    expect(await missed()).toEqual([`Anna missed ${days[8].dayName} and ${days[9].dayName} in a row`])
    // Every later miss belongs to the same run.
    for (const index of [10, 11]) await runReminderJobs(database, new Date(`${addDays(days[index].day, 1)}T08:00:00Z`))
    expect(await missed()).toHaveLength(1)
    // ...and is stamped, so the job's first look stops picking the program out.
    const rows = await database
      .select({ day: fitnessScheduledWorkouts.day, skippedAt: fitnessScheduledWorkouts.skippedAt, noticed: fitnessScheduledWorkouts.coachNoticedAt })
      .from(fitnessScheduledWorkouts)
      .where(eq(fitnessScheduledWorkouts.programId, programId))
    const missedRows = rows.filter((row) => !row.skippedAt && row.day >= days[8].day && row.day <= days[11].day)
    expect(missedRows).toHaveLength(4)
    expect(missedRows.every((row) => row.noticed)).toBe(true)
  })

  it("passes over a skipped date and stops at a finished one", () => {
    const row = (status: "planned" | "done", skipped = false) => ({ status, skippedAt: skipped ? new Date() : null })
    // Newest first: missed Friday, skipped Wednesday, missed Monday, then a finished workout.
    const recent = [row("planned"), row("planned", true), row("planned"), row("done"), row("planned")]
    expect(missRun(recent)).toEqual([recent[0], recent[2]])
  })
})

describe("weekly check-in", () => {
  it("is only for someone with a coach, saves the weigh-in, tells the coach and marks it read", async () => {
    await expect(
      saveCheckIn(anna.id, { weightKg: 80, sleep: 4, stress: 2, training: 5, note: "Good week" }, database)
    ).rejects.toThrow(FITNESS_ERRORS.checkInNoCoach)
    expect(await checkInDue(anna.id, database)).toBeNull()
    await linkCoach()
    expect(await checkInDue(anna.id, database)).not.toBeNull()
    await saveCheckIn(anna.id, { weightKg: 80, sleep: 4, stress: 2, training: 5, note: "Good week" }, database)
    expect(await checkInDue(anna.id, database)).toBeNull()
    expect((await loadWeighIns(anna.id, anna.id, database)).at(-1)?.weightKg).toBe(80)
    expect(await noticesFor(coach.id)).toContain("Anna sent their check-in")
    expect((await listClients(coach.id, database))[0].overview?.checkInUnread).toBe(true)
    const [checkIn] = await listCheckIns(coach.id, anna.id, database)
    expect(checkIn).toMatchObject({ weightKg: 80, sleep: 4, stress: 2, training: 5, note: "Good week" })
    // Loading them leaves the New mark; the card on screen takes it off.
    expect((await listClients(coach.id, database))[0].overview?.checkInUnread).toBe(true)
    await markCheckInsSeen(coach.id, anna.id, database)
    expect((await listClients(coach.id, database))[0].overview?.checkInUnread).toBe(false)
    // Sending again the same week replaces it and tells the coach nothing new.
    await saveCheckIn(anna.id, { weightKg: 79, sleep: 4, stress: 2, training: 5, note: "Changed" }, database)
    expect((await noticesFor(coach.id)).filter((message) => message === "Anna sent their check-in")).toHaveLength(1)
     expect((await listCheckIns(anna.id, anna.id, database))[0]).toMatchObject({ weightKg: 79, note: "Changed" })
  })

  it("leaves out a coach whose account is being deleted", async () => {
    await linkCoach()
    await database
      .update(customShellUsers)
      .set({ status: "pending_deletion", deletedAt: new Date() })
      .where(eq(customShellUsers.id, coach.id))
    expect(await checkInDue(anna.id, database)).toBeNull()
    await expect(
      saveCheckIn(anna.id, { weightKg: null, sleep: 3, stress: 3, training: 3, note: "" }, database)
    ).rejects.toThrow(FITNESS_ERRORS.checkInNoCoach)
  })

  it("asks on Sunday at the reminder time, once", async () => {
    await linkCoach()
    await saveAppSetting("reminders", { ...quiet, checkInOn: true }, anna.id, database)
    const sunday = addDays(weekStart("2099-01-05"), 6)
    await runReminderJobs(database, new Date(`${addDays(sunday, -1)}T08:00:00Z`))
    await runReminderJobs(database, new Date(`${sunday}T08:00:00Z`))
    await runReminderJobs(database, new Date(`${sunday}T09:00:00Z`))
    expect((await noticesFor(anna.id)).filter((message) => message === "Your weekly check-in")).toHaveLength(1)
  })

  it("doesn't ask someone who already sent this week's", async () => {
    await linkCoach()
    await saveAppSetting("reminders", { ...quiet, checkInOn: true }, anna.id, database)
    await saveCheckIn(anna.id, { weightKg: null, sleep: 4, stress: 2, training: 4, note: "" }, database)
    const sunday = addDays(checkInWeek(await todayFor(anna.id, database)), 6)
    await runReminderJobs(database, new Date(`${sunday}T12:00:00Z`))
    expect(await noticesFor(anna.id)).not.toContain("Your weekly check-in")
  })
})

describe("photo day reminder", () => {
  it("goes out once four weeks after the last photo day, and again after the next one", async () => {
    await saveAppSetting("reminders", { ...quiet, photoReminderOn: true }, anna.id, database)
    const today = await todayFor(anna.id, database)
    const empty = { bodyweightKg: null, chestCm: null, waistCm: null, hipsCm: null, armCm: null, thighCm: null, note: "" }
    await createPhotoSession(anna.id, { ...empty, day: addDays(today, -20) }, database)
    await runReminderJobs(database, new Date())
    expect(await noticesFor(anna.id)).not.toContain("Time for a photo day")
    await runReminderJobs(database, new Date(Date.now() + 9 * 86_400_000))
    await runReminderJobs(database, new Date(Date.now() + 10 * 86_400_000))
    const photoNotices = async () =>
      (await noticesFor(anna.id)).filter((message) => message === "Time for a photo day")
    expect(await photoNotices()).toHaveLength(1)
    // An older photo day added afterwards changes nothing.
    await createPhotoSession(anna.id, { ...empty, day: addDays(today, -40) }, database)
    await runReminderJobs(database, new Date(Date.now() + 11 * 86_400_000))
    expect(await photoNotices()).toHaveLength(1)
    // A newer one starts the next four weeks.
    await createPhotoSession(anna.id, { ...empty, day: addDays(today, -10) }, database)
    await runReminderJobs(database, new Date(Date.now() + 12 * 86_400_000))
    expect(await photoNotices()).toHaveLength(1)
    await runReminderJobs(database, new Date(Date.now() + 19 * 86_400_000))
    expect(await photoNotices()).toHaveLength(2)
  })
})

describe("coach notes", () => {
  it("lets a linked coach note a finished workout and its lifts, and shows the lift note next time", async () => {
    const programId = await fiveByFive()
    await linkCoach()
    const { workoutId } = await trainDay(programId)
    await expect(saveCoachNote(anna.id, { workoutId, position: null, text: "Me" }, database)).rejects.toThrow()
    await saveCoachNote(coach.id, { workoutId, position: null, text: "Strong session" }, database)
    await saveCoachNote(coach.id, { workoutId, position: 0, text: "Keep the chest up" }, database)
    await saveCoachNote(coach.id, { workoutId, position: 0, text: "Keep the chest up, brace" }, database)
    const notes = await loadCoachNotes(anna.id, workoutId, database)
    expect(notes.map((note) => [note.position, note.text, note.mine])).toEqual([
      [null, "Strong session", false],
      [0, "Keep the chest up, brace", false],
    ])
    expect((await noticesFor(anna.id)).filter((message) => message === "Cleo left a note on Day A")).toHaveLength(2)

    const workout = await loadWorkout(anna.id, workoutId, database)
    const lift = workout.exercises[0].exerciseId
    const next = await liftNotesFor(anna.id, anna.id, [lift], "another", database)
    expect(next[lift]).toMatchObject({ coachName: "Cleo", text: "Keep the chest up, brace" })
    await deleteCoachNote(coach.id, notes[0].id, database)
    expect(await loadCoachNotes(coach.id, workoutId, database)).toHaveLength(1)
    await expect(deleteCoachNote(anna.id, notes[1].id, database)).rejects.toThrow(FITNESS_ERRORS.noteNotFound)
  })

  it("refuses a note on an unfinished workout", async () => {
    const programId = await fiveByFive()
    await linkCoach()
    const [day] = await loadWeek(programId, database)
    const { id } = await startWorkout(anna.id, { from: "day", dayId: day.id }, database)
    await expect(saveCoachNote(coach.id, { workoutId: id, position: null, text: "Too soon" }, database)).rejects.toThrow(
      FITNESS_ERRORS.noteNeedsFinish
    )
  })
})

describe("copy a program to a client", () => {
  it("starts heavy lifts from the client's best lifts and leaves out the coach's own", async () => {
    const lifts = await builtInBySlug(database)
    const coachProgram = await fiveByFive(coach)
    const [day] = await loadWeek(coachProgram, database)
    const own = await createExercise(
      coach.id,
      {
        name: "Cleo's carry",
        routineType: "strength",
        muscles: ["forearms"],
        equipment: [],
        movement: "carry",
        isBodyweight: false,
        isTimed: false,
        pictureUrl: null,
      },
      database
    )
    await addDayExercise(coach.id, day.id, own.id, { sets: 3, reps: 10, weightKg: 30, restSeconds: 90 }, database)
    await expect(copyProgramToClient(coach.id, coachProgram, anna.id, database)).rejects.toThrow(FITNESS_ERRORS.notYourClient)

    const annas = await fiveByFive()
    await saveBaselineLift(anna.id, annas, { exerciseId: lifts.get("back-squat")!.id, weightKg: 100, reps: 1 }, database)
    await linkCoach()
    const { id, leftOut } = await copyProgramToClient(coach.id, coachProgram, anna.id, database)
    expect(leftOut).toEqual(["Cleo's carry"])
    const week = await loadWeek(id, database)
    const squat = week[0].exercises.find((exercise) => exercise.exerciseId === lifts.get("back-squat")!.id)
    expect(squat?.weightKg).toBe(75)
    expect(week[0].exercises.find((exercise) => exercise.exerciseId === lifts.get("bench-press")!.id)?.weightKg).toBe(0)
    expect(week[0].exercises.some((exercise) => exercise.exerciseId === own.id)).toBe(false)
  })
})

describe("progress", () => {
  it("lists every record broken, newest first, from the second workout of a lift", async () => {
    const programId = await fiveByFive()
    await trainDay(programId, 5)
    expect(await loadRecordTimeline(anna.id, anna.id, database)).toEqual([])
    await trainDay(programId, 6)
    const broken = await loadRecordTimeline(anna.id, anna.id, database)
    expect(broken.length).toBeGreaterThan(0)
    // The weight rules added 2.5 kg after the first workout, so the second one was heavier too.
    expect(broken.some((record) => record.kind === "heaviest")).toBe(true)
    expect(broken.find((record) => record.kind === "mostReps")).toMatchObject({ reps: 6, previousReps: 5 })
  })

  it("keeps the target bodyweight, and the measurements from a coach without photo access", async () => {
    await linkCoach()
    await saveTargetWeight(anna.id, 75, database)
    expect(await loadTargetWeight(coach.id, anna.id, database)).toBe(75)
    const empty = { bodyweightKg: null, chestCm: null, hipsCm: null, armCm: null, thighCm: null, note: "" }
    await createPhotoSession(anna.id, { ...empty, waistCm: 84, day: "2099-01-05" }, database)
    expect(await loadMeasurements(coach.id, anna.id, database)).toBeNull()
    await setCoachPhotos(anna.id, coach.id, true, database)
    expect((await loadMeasurements(coach.id, anna.id, database))?.[0].waistCm).toBe(84)
  })
})

describe("Calisthenics", () => {
  async function calisthenicsProgram() {
    const { id } = await createProgram(anna.id, anna.id, { name: "Bars", routineType: "calisthenics" }, database)
    await applyTemplate(anna.id, id, "calisthenics-full-body", database)
    return id
  }

  it("refuses a strength template and gives the starter week rep ranges and no weight", async () => {
    const { id } = await createProgram(anna.id, anna.id, { name: "Bars", routineType: "calisthenics" }, database)
    await expect(applyTemplate(anna.id, id, "five-by-five", database)).rejects.toThrow(FITNESS_ERRORS.templateNotFound)
    await applyTemplate(anna.id, id, "calisthenics-full-body", database)
    const [day] = await loadWeek(id, database)
    expect(day.exercises.every((exercise) => exercise.weightKg === 0 && exercise.repsMax !== null)).toBe(true)
  })

  it("logs reps with no weight or warm-ups, then steps a move up after every set at the top", async () => {
    const programId = await calisthenicsProgram()
    const lifts = await builtInBySlug(database)
    const [day] = await loadWeek(programId, database)
    const { id } = await startWorkout(anna.id, { from: "day", dayId: day.id }, database)
    const workout = await loadWorkout(anna.id, id, database)
    expect(workout.exercises.every((exercise) => exercise.sets.every((set) => set.kind === "working"))).toBe(true)
    const pushUps = workout.exercises.find((exercise) => exercise.exerciseId === lifts.get("cal-knee-push-up")!.id)!
    expect(pushUps.measure).toBe("reps")
    expect(workout.exercises.find((exercise) => exercise.exerciseId === lifts.get("cal-plank")!.id)?.measure).toBe("seconds")
    for (const exercise of workout.exercises) {
      for (const set of exercise.sets) {
        const top = exercise.exerciseId === pushUps.exerciseId ? 12 : 9
        await saveSet(anna.id, set.id, { done: true, reps: top }, database)
      }
    }
    const summary = await finishWorkout(anna.id, id, { effort: null, note: "" }, database)
    expect(summary.stepChanges).toContainEqual({ exerciseName: "Knee push-up", toName: "Push-up", reps: 8, measure: "reps" })
    const after = (await loadWeek(programId, database))[0].exercises
    expect(after.some((exercise) => exercise.exerciseId === lifts.get("cal-push-up")!.id && exercise.reps === 8)).toBe(true)
    // The squat's range is 10 to 15: nine reps each time sets next time's target at 10.
    expect(after.find((exercise) => exercise.exerciseId === lifts.get("cal-squat")!.id)?.reps).toBe(10)
  })

  it("refuses a strength lift in a Calisthenics week", async () => {
    const programId = await calisthenicsProgram()
    const lifts = await builtInBySlug(database)
    const { id: dayId } = await setWeekDay(anna.id, programId, 2, "Extra", database)
    await expect(
      addDayExercise(anna.id, dayId, lifts.get("back-squat")!.id, { sets: 3, reps: 5, weightKg: 60, restSeconds: 120 }, database)
    ).rejects.toThrow(FITNESS_ERRORS.wrongRoutineType)
  })
})

describe("the calendar keeps a skipped date when the week is laid out again", () => {
  it("doesn't lay a workout back onto a skipped date", async () => {
    const programId = await fiveByFive()
    const today = await todayFor(anna.id, database)
    const { days } = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 14) }, database)
    await skipScheduled(anna.id, days[1].id, true, database)
    await setWeekDay(anna.id, programId, 2, "Tuesday", database)
    const [row] = await database.select().from(fitnessScheduledWorkouts).where(eq(fitnessScheduledWorkouts.id, days[1].id))
    expect(row.skippedAt).not.toBeNull()
  })
})
