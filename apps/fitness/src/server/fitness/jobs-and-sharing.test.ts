import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { addDays } from "@/lib/fitness/dates"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import type { CustomShellDb } from "@/server/db"
import { canReachPerson } from "@/server/fitness/access"
import { loadCalendar, pauseProgram, todayFor } from "@/server/fitness/calendar"
import { calendarFeedFor } from "@/server/fitness/calendar-feed"
import { answerCoach, inviteClient, removeClients, setCoachPhotos } from "@/server/fitness/coach"
import { builtInBySlug } from "@/server/fitness/exercises"
import { previewImport, runImport } from "@/server/fitness/import"
import { addFitnessNavigation } from "@/server/fitness/navigation"
import { loadHistory } from "@/server/fitness/workouts"
import { canSeePhotos } from "@/server/fitness/photos"
import { applyTemplate, loadWeek } from "@/server/fitness/week"
import { resetCalendarToken } from "@/server/fitness/profile"
import { saveAppSetting } from "@/server/fitness/app-settings"
import { runReminderJobs } from "@/server/fitness/reminders"
import { createProgram, listPrograms } from "@/server/fitness/programs"
import { fitnessNavigationAdded, fitnessScheduledWorkouts } from "@/server/fitness/schema"
import { copySharedProgram, loadSharedProgram, setProgramShared } from "@/server/fitness/sharing"
import { customShellNotifications, customShellSettings, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser
let coach: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  coach = await insertUser(database, { name: "Cleo", email: "cleo@example.test", role: "coach" })
})

afterEach(async () => {
  await client.close()
})

async function annasProgram() {
  const { id } = await createProgram(anna.id, anna.id, { name: "Strong", routineType: "strength" }, database)
  await applyTemplate(anna.id, id, "five-by-five", database)
  return id
}

async function noticesFor(userId: string) {
  return database
    .select({ message: customShellNotifications.message })
    .from(customShellNotifications)
    .where(eq(customShellNotifications.recipientUserId, userId))
}

describe("reminders", () => {
  it("reminds once on a workout day and never on a rest day", async () => {
    const programId = await annasProgram()
    await saveAppSetting("reminders", { remindersOn: true, time: "00:00", channel: "bell", nudgeOn: false }, anna.id, database)
    const today = await todayFor(anna.id, database)
    const { days } = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 14) }, database)
    const workoutDay = days[0].day
    const at = new Date(`${workoutDay}T08:00:00Z`)
    await runReminderJobs(database, at)
    await runReminderJobs(database, at)
    const notices = await noticesFor(anna.id)
    expect(notices.filter((notice) => notice.message?.startsWith("Workout today"))).toHaveLength(1)
    // The day after a workout day in Mon/Wed/Fri is always a rest day or the next workout;
    // a Tuesday or Thursday sends nothing new.
    const restDay = [1, 2, 3, 4, 5, 6].map((offset) => addDays(workoutDay, offset)).find((day) => !days.some((entry) => entry.day === day))!
    await runReminderJobs(database, new Date(`${restDay}T08:00:00Z`))
    expect((await noticesFor(anna.id)).filter((notice) => notice.message?.startsWith("Workout today"))).toHaveLength(1)
  })

  it("nudges once the day after a missed workout", async () => {
    const programId = await annasProgram()
    await saveAppSetting("reminders", { remindersOn: false, time: "00:00", channel: "bell", nudgeOn: true }, anna.id, database)
    const today = await todayFor(anna.id, database)
    const { days } = await loadCalendar(anna.id, programId, { from: today, to: addDays(today, 14) }, database)
    const missed = days[0].day
    const nextDay = new Date(`${addDays(missed, 1)}T08:00:00Z`)
    await runReminderJobs(database, nextDay)
    await runReminderJobs(database, nextDay)
    const nudges = (await noticesFor(anna.id)).filter((notice) => notice.message?.startsWith("You missed"))
    expect(nudges).toHaveLength(1)
    const [row] = await database
      .select()
      .from(fitnessScheduledWorkouts)
      .where(eq(fitnessScheduledWorkouts.day, missed))
    expect(row.nudgedAt).not.toBeNull()
  })

  it("stays quiet during a pause", async () => {
    const programId = await annasProgram()
    await saveAppSetting("reminders", { remindersOn: true, time: "00:00", channel: "bell", nudgeOn: false }, anna.id, database)
    const today = await todayFor(anna.id, database)
    await pauseProgram(anna.id, programId, { fromDay: today, untilDay: null, reason: "holiday" }, database)
    for (let offset = 0; offset < 7; offset += 1) {
      await runReminderJobs(database, new Date(`${addDays(today, offset)}T08:00:00Z`))
    }
    expect(await noticesFor(anna.id)).toHaveLength(0)
  })
})

describe("left menu", () => {
  it("adds the Training section to the members' menu once", async () => {
    await addFitnessNavigation(database)
    await addFitnessNavigation(database)
    const [row] = await database
      .select({ settings: customShellSettings.settings })
      .from(customShellSettings)
      .where(eq(customShellSettings.key, "default"))
    const sections = (row.settings as { memberSections: { id: string }[] }).memberSections
    expect(sections.filter((section) => section.id === "section-fitness")).toHaveLength(1)
    const markers = await database.select().from(fitnessNavigationAdded)
    expect(markers.map((marker) => marker.scope)).toContain("members")
  })
})

describe("calendar feed", () => {
  it("serves the planned workouts to the right secret only", async () => {
    await annasProgram()
    const token = await resetCalendarToken(anna.id, database)
    const feed = await calendarFeedFor(token, database)
    expect(feed).toContain("BEGIN:VCALENDAR")
    expect(feed).toContain("SUMMARY:Day A\\, Strong")
    expect(await calendarFeedFor("0".repeat(48), database)).toBeNull()
    const fresh = await resetCalendarToken(anna.id, database)
    expect(await calendarFeedFor(token, database)).toBeNull()
    expect(await calendarFeedFor(fresh, database)).not.toBeNull()
  })
})

describe("sharing", () => {
  it("shows the plan without weights and copies it into another account", async () => {
    const programId = await annasProgram()
    const { shareCode } = await setProgramShared(anna.id, programId, true, database)
    const shared = await loadSharedProgram(shareCode!, database)
    expect(shared?.days.map((day) => [day.weekday, day.name])).toEqual([[1, "Day A"], [3, "Day B"], [5, "Day A"]])
    expect(JSON.stringify(shared)).not.toContain("weightKg")
    expect(JSON.stringify(shared)).not.toContain("Anna")

    const { id } = await copySharedProgram(ben.id, shareCode!, database)
    const plan = await loadWeek(id, database)
    expect(plan).toHaveLength(3)
    expect(plan.flatMap((day) => day.exercises).every((exercise) => exercise.weightKg === 0)).toBe(true)
    expect((await listPrograms(ben.id, ben.id, database))[0].name).toBe("Strong")

    await setProgramShared(anna.id, programId, false, database)
    expect(await loadSharedProgram(shareCode!, database)).toBeNull()
    await expect(copySharedProgram(ben.id, shareCode!, database)).rejects.toThrow(FITNESS_ERRORS.shareOff)
  })

  it("lets only the owner share, never a linked coach", async () => {
    const programId = await annasProgram()
    await inviteClient(coach.id, "anna@example.test", database)
    await answerCoach(anna.id, coach.id, true, database)
    await expect(setProgramShared(coach.id, programId, true, database)).rejects.toThrow(FITNESS_ERRORS.programNotFound)
  })
})

describe("coaching", () => {
  it("gives a coach nothing until the client says yes, and photos only when switched on", async () => {
    await annasProgram()
    await inviteClient(coach.id, "ANNA@example.test", database)
    expect(await canReachPerson(coach.id, anna.id, database)).toBe(false)
    await expect(listPrograms(coach.id, anna.id, database)).rejects.toThrow(FITNESS_ERRORS.notYourClient)
    expect((await noticesFor(anna.id)).map((notice) => notice.message)).toContain("Cleo wants to coach you")

    await answerCoach(anna.id, coach.id, true, database)
    expect(await canReachPerson(coach.id, anna.id, database)).toBe(true)
    expect(await listPrograms(coach.id, anna.id, database)).toHaveLength(1)
    expect(await canSeePhotos(coach.id, anna.id, database)).toBe(false)
    await setCoachPhotos(anna.id, coach.id, true, database)
    expect(await canSeePhotos(coach.id, anna.id, database)).toBe(true)
    expect(await canReachPerson(ben.id, anna.id, database)).toBe(false)
  })

  it("removes several clients in one go and counts one it isn't linked to", async () => {
    await inviteClient(coach.id, "anna@example.test", database)
    await inviteClient(coach.id, "ben@example.test", database)
    const stranger = await insertUser(database, { name: "Dee", email: "dee@example.test" })
    const { done, kept } = await removeClients(coach.id, [anna.id, ben.id, stranger.id], database)
    expect(done.sort()).toEqual([anna.id, ben.id].sort())
    expect(kept).toEqual([stranger.id])
  })

  it("only a coach can invite, and never themselves", async () => {
    await expect(inviteClient(ben.id, "anna@example.test", database)).rejects.toThrow(FITNESS_ERRORS.notACoach)
    await expect(inviteClient(coach.id, "cleo@example.test", database)).rejects.toThrow(FITNESS_ERRORS.clientNotMember)
    await expect(inviteClient(coach.id, "nobody@example.test", database)).rejects.toThrow(FITNESS_ERRORS.clientNotMember)
  })
})

describe("import", () => {
  const strong = [
    "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE",
    "2099-01-05 07:30:00,Morning,45m,Squat (Barbell),W,60,5,0,0,,,",
    "2099-01-05 07:30:00,Morning,45m,Squat (Barbell),1,100,5,0,0,,,",
    "2099-01-05 07:30:00,Morning,45m,Squat (Barbell),2,100,5,0,0,,,",
    "2099-01-05 07:30:00,Morning,45m,Zercher Squat,1,80,5,0,0,,,",
  ].join("\n")

  it("matches known names, creates the rest, and adds nothing the second time", async () => {
    const lifts = await builtInBySlug(database)
    const programId = await annasProgram()
    const preview = await previewImport(anna.id, { text: strong, unit: "kg", programId }, database)
    expect(preview).toMatchObject({ source: "strong", workouts: 1, sets: 4, alreadyImported: 0 })
    expect(preview.names).toEqual([
      { name: "Squat (Barbell)", exerciseId: lifts.get("back-squat")!.id },
      { name: "Zercher Squat", exerciseId: null },
    ])
    const first = await runImport(anna.id, { text: strong, unit: "kg", programId, matches: preview.names }, database)
    expect(first).toEqual({ imported: 1, skipped: 0 })
    const second = await runImport(anna.id, { text: strong, unit: "kg", programId, matches: preview.names }, database)
    expect(second).toEqual({ imported: 0, skipped: 1 })
    // The imported workout lands in the program the import was started from.
    const rows = await loadHistory(anna.id, anna.id, database)
    expect(rows.map((row) => row.programId)).toEqual([programId])
  })

  it("refuses a file that would add more than 300 new lifts", async () => {
    const programId = await annasProgram()
    const rows = Array.from({ length: 301 }, (_, index) => `2099-01-05 07:30:00,Morning,45m,Made Up Lift ${index},1,50,5,0,0,,,`)
    const text = [strong.split("\n")[0], ...rows].join("\n")
    const preview = await previewImport(anna.id, { text, unit: "kg", programId }, database)
    await expect(runImport(anna.id, { text, unit: "kg", programId, matches: preview.names }, database)).rejects.toThrow(
      FITNESS_ERRORS.importTooManyLifts
    )
  })

  it("refuses an import into somebody else's program", async () => {
    const programId = await annasProgram()
    await expect(previewImport(ben.id, { text: strong, unit: "kg", programId }, database)).rejects.toThrow(
      FITNESS_ERRORS.programNotFound
    )
  })

  it("refuses a file it can't read", async () => {
    const programId = await annasProgram()
    await expect(previewImport(anna.id, { text: "a,b\n1,2", unit: "kg", programId }, database)).rejects.toThrow(
      FITNESS_ERRORS.importUnreadable
    )
  })
})
