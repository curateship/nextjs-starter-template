import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { cardDayOf, dailySkySchema, greetingOf, partOfDay, skyPhase, streakOf, DEFAULT_HOURS, type StreakDay } from "@/lib/project/daily-card"
import { noticeKindFromWords, routineReminderHeading } from "@/lib/project/notices"
import { PERSONAL_PROJECT_ID } from "@/lib/project/rules"
import type { CustomShellDb } from "@/server/db"
import { inTeam } from "@/server/project/access"
import { setAdminTimeZone } from "@/server/project/admin-dashboard"
import {
  addReadyRoutines,
  createHabit,
  forgetWeather,
  loadDailyCard,
  loadDailyWeather,
  loadMonthOfTicks,
  loadYearOfRatings,
  markMilestoneShown,
  markSleep,
  orderHabits,
  restoreHabit,
  retireHabit,
  saveDailyCity,
  saveDailyHours,
  saveJournalRating,
  saveJournalText,
  saveOwnWords,
  saveSectionOrder,
  searchJournal,
  setHabitCount,
} from "@/server/project/daily-card"
import { addProjectMember, createProject } from "@/server/project/projects"
import { sendRoutineReminders } from "@/server/project/reminder-jobs"
import {
  projectHabitDays,
  projectMeetingPeople,
  projectMeetings,
  projectTeamHolidays,
  projectTimeOff,
} from "@/server/project/schema"
import { createTask, setTaskStatus } from "@/server/project/tasks"
import { startClock } from "@/server/project/task-clock"
import { insertSiteAdmin, startTeam } from "@/server/project/test-people"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/*
 * The Daily card (workspace/tasks/Daily card/01-daily-card.md, Tyler,
 * 29 Oct 2026). Everyone has one; the habits, streaks and journal are the
 * site admin's alone. 2 March 2099 is a Monday; every zone here is UTC.
 */
const MONDAY = "2099-03-02"
const at = (day: string, time: string) => new Date(`${day}T${time}:00Z`)
const NINE = at(MONDAY, "09:00")

let client: PGlite
let database: CustomShellDb
let tyler: CustomShellUser
let ben: CustomShellUser
let teamId: string
let website: string

const actor = (user: CustomShellUser) => ({ id: user.id, name: user.name, currentWorkspaceId: user.currentWorkspaceId })
const habit = (name: string, overrides: Partial<Parameters<typeof createHabit>[1]> = {}) => ({
  name,
  part: "morning" as const,
  icon: null,
  target: 1,
  days: [],
  atTime: null,
  ...overrides,
})

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  tyler = await insertSiteAdmin(database, { name: "Tyler Pham" })
  ben = await insertUser(database, { name: "Ben Tester", email: "ben@example.test" })
  teamId = (await startTeam(database, [ben], { name: "Acme", admin: tyler })).team.id
  website = (await inTeam(teamId, () => createProject(tyler.id, { name: "Website", color: "blue", description: "" }, database))).id
  await addProjectMember(tyler.id, website, ben.id, database)
  await setAdminTimeZone(tyler.id, "UTC", database)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  forgetWeather()
  await client.close()
})

describe("the rules", () => {
  it("splits the day at the person's own hours, with night running past midnight", () => {
    expect(partOfDay("04:59", DEFAULT_HOURS)).toBe("night")
    expect(partOfDay("05:00", DEFAULT_HOURS)).toBe("morning")
    expect(partOfDay("12:00", DEFAULT_HOURS)).toBe("afternoon")
    expect(partOfDay("18:00", DEFAULT_HOURS)).toBe("night")
    expect(cardDayOf(MONDAY, "01:00", DEFAULT_HOURS)).toBe("2099-03-01")
    expect(cardDayOf(MONDAY, "06:00", DEFAULT_HOURS)).toBe(MONDAY)
  })

  it("draws a sunrise, gold and a sunset at the edges of the parts", () => {
    expect(skyPhase("05:30", DEFAULT_HOURS)).toBe("sunrise")
    expect(skyPhase("09:00", DEFAULT_HOURS)).toBe("day")
    expect(skyPhase("16:45", DEFAULT_HOURS)).toBe("golden")
    expect(skyPhase("18:30", DEFAULT_HOURS)).toBe("sunset")
    expect(skyPhase("23:00", DEFAULT_HOURS)).toBe("night")
  })

  it("greets by first name and day", () => {
    expect(greetingOf("Tyler", "morning", "2099-03-05", false)).toBe("Good morning Tyler, it's Thursday")
    expect(greetingOf("Tyler", "night", MONDAY, false)).toBe("Good evening Tyler, time to wind down")
    expect(greetingOf("", "afternoon", MONDAY, false)).toBe("Good afternoon")
  })

  it("forgives one missed day a week and breaks on the second", () => {
    const days: Record<string, StreakDay> = {
      "2099-03-02": "done",
      "2099-03-03": "missed",
      "2099-03-04": "done",
      "2099-03-05": "done",
    }
    const dayIs = (day: string) => days[day] ?? "missed"
    expect(streakOf("2099-03-02", "2099-03-05", dayIs)).toEqual({ current: 3, best: 3 })
    days["2099-03-06"] = "missed"
    days["2099-03-07"] = "done"
    expect(streakOf("2099-03-02", "2099-03-07", dayIs)).toEqual({ current: 1, best: 3 })
  })

  it("never breaks a streak on today, still in progress", () => {
    expect(streakOf("2099-03-02", "2099-03-03", (day) => (day === "2099-03-02" ? "done" : "missed")).current).toBe(1)
  })

  it("takes only a web or site address for an own sky photo", () => {
    const sky = (morning: string) => dailySkySchema.safeParse({ sky: "own", own: { morning, afternoon: "", night: "" } }).success
    expect(sky("")).toBe(true)
    expect(sky("https://cdn.example.test/sky.jpg")).toBe(true)
    expect(sky("/uploads/sky.jpg")).toBe(true)
    expect(sky("javascript:alert(1)")).toBe(false)
    expect(sky("data:image/svg+xml,<svg/>")).toBe(false)
  })
})

describe("everyone's card", () => {
  it("gives an employee their own hours, meetings and finished work, and none of the site admin's parts", async () => {
    const meeting = "meeting-1"
    await database.insert(projectMeetings).values({
      id: meeting,
      teamId,
      title: "Standup",
      color: "blue",
      day: MONDAY,
      startTime: "10:00",
      endTime: "10:15",
      timeZone: "UTC",
      createdAt: NINE,
      updatedAt: NINE,
    })
    await database.insert(projectMeetingPeople).values({ meetingId: meeting, userId: ben.id })
    await database.insert(projectMeetings).values({
      id: "meeting-2",
      teamId,
      title: "Not for Ben",
      color: "red",
      day: MONDAY,
      startTime: "11:00",
      endTime: "11:30",
      timeZone: "UTC",
      createdAt: NINE,
      updatedAt: NINE,
    })
    const { id: taskId } = await createTask(actor(ben), { projectId: website, title: "Homepage", notes: "", assigneeUserId: ben.id, dueDate: null, steps: [] }, database)
    await startClock(actor(ben), taskId, database, at(MONDAY, "08:00"))

    const card = await loadDailyCard(ben.id, database, NINE)
    expect(card.firstName).toBe("Ben")
    expect(card.siteAdmin).toBe(false)
    expect(card.admin).toBeNull()
    expect(card.settings.hours).toEqual(DEFAULT_HOURS)
    expect(card.meetings.map((m) => m.title)).toEqual(["Standup"])
    expect(card.clock.seconds).toBe(3600)
    expect(card.clock.running?.title).toBe("Homepage")
    expect(card.dayOff).toBeNull()

    await setTaskStatus(actor(ben), { taskId, status: "done", stuckReason: null }, database)
    expect((await loadDailyCard(ben.id, database)).finishedToday.map((task) => task.title)).toEqual(["Homepage"])
  })

  it("says enjoy your day off on time off, and names a team holiday", async () => {
    await database.insert(projectTimeOff).values({ id: "off", teamId, userId: ben.id, firstDay: MONDAY, lastDay: MONDAY, createdAt: NINE })
    expect((await loadDailyCard(ben.id, database, NINE)).dayOff).toBe("Enjoy your day off")
    await database.insert(projectTeamHolidays).values({ id: "h", teamId, day: "2099-03-03", name: "Founders Day", createdAt: NINE })
    expect((await loadDailyCard(ben.id, database, at("2099-03-03", "09:00"))).dayOff).toBe("Enjoy Founders Day")
  })

  it("keeps each person's own hours, in order", async () => {
    await saveDailyHours(ben.id, { morning: "06:30", afternoon: "13:00", night: "20:00" }, database)
    const card = await loadDailyCard(ben.id, database, at(MONDAY, "06:00"))
    expect(card.settings.hours.morning).toBe("06:30")
    // Before Ben's morning starts, it is still Sunday night on his card.
    expect(card.cardDay).toBe("2099-03-01")
  })

  it("refuses an employee the habits and the journal", async () => {
    await expect(createHabit(ben.id, habit("Walk"), database)).rejects.toThrow("Only the site admin")
    await expect(saveJournalText(ben.id, { day: MONDAY, field: "win", text: "x" }, database, NINE)).rejects.toThrow("Only the site admin")
    await expect(searchJournal(ben.id, "x", database)).rejects.toThrow("Only the site admin")
  })
})

describe("the site admin's habits", () => {
  it("ticks today and yesterday, never earlier, and counts a habit with a number", async () => {
    const { id: walk } = await createHabit(tyler.id, habit("Walk"), database, at("2099-02-20", "09:00"))
    const { id: water } = await createHabit(tyler.id, habit("Water", { target: 8 }), database, at("2099-02-20", "09:00"))
    await setHabitCount(tyler.id, { habitId: walk, day: MONDAY, count: 1 }, database, NINE)
    await setHabitCount(tyler.id, { habitId: walk, day: "2099-03-01", count: 1 }, database, NINE)
    await expect(setHabitCount(tyler.id, { habitId: walk, day: "2099-02-28", count: 1 }, database, NINE)).rejects.toThrow(
      "Only today and yesterday"
    )
    await setHabitCount(tyler.id, { habitId: water, day: MONDAY, count: 20 }, database, NINE)
    const card = await loadDailyCard(tyler.id, database, NINE)
    const shown = Object.fromEntries(card.admin!.habits.map((h) => [h.name, h]))
    expect(shown.Walk.count).toBe(1)
    expect(shown.Walk.streak.current).toBe(2)
    // Counted up to its number and no further.
    expect(shown.Water.count).toBe(8)
  })

  it("counts a finished day only when every habit set that day is ticked, and a day off never breaks it", async () => {
    const { id: walk } = await createHabit(tyler.id, habit("Walk"), database, at("2099-02-27", "09:00"))
    const { id: gym } = await createHabit(tyler.id, habit("Gym", { days: [1] }), database, at("2099-02-27", "09:00"))
    for (const day of ["2099-02-27", "2099-02-28", MONDAY]) {
      await database.insert(projectHabitDays).values({ habitId: walk, day, count: 1 })
    }
    await database.insert(projectHabitDays).values({ habitId: gym, day: MONDAY, count: 1 })
    let card = await loadDailyCard(tyler.id, database, NINE)
    // Sunday 1 March was missed, and forgiven as the week's one grace day.
    expect(card.admin!.finished.current).toBe(3)
    expect(card.admin!.habits.find((h) => h.name === "Gym")!.setToday).toBe(true)

    await database.insert(projectTimeOff).values({ id: "away", teamId, userId: tyler.id, firstDay: "2099-03-03", lastDay: "2099-03-03", createdAt: NINE })
    await database.insert(projectHabitDays).values({ habitId: walk, day: "2099-03-04", count: 1 })
    card = await loadDailyCard(tyler.id, database, at("2099-03-04", "09:00"))
    expect(card.admin!.habits.find((h) => h.name === "Walk")!.streak.current).toBe(4)
  })

  it("celebrates 7 days once", async () => {
    const { id } = await createHabit(tyler.id, habit("Read"), database, at("2099-02-24", "09:00"))
    for (let day = 24; day <= 28; day += 1) await database.insert(projectHabitDays).values({ habitId: id, day: `2099-02-${day}`, count: 1 })
    await database.insert(projectHabitDays).values({ habitId: id, day: "2099-03-01", count: 1 })
    await database.insert(projectHabitDays).values({ habitId: id, day: MONDAY, count: 1 })
    const card = await loadDailyCard(tyler.id, database, NINE)
    expect(card.admin!.milestone).toBe("finished:7")
    await markMilestoneShown(tyler.id, "finished:7", database)
    expect((await loadDailyCard(tyler.id, database, NINE)).admin!.milestone).toBe(`habit:${id}:7`)
  })

  it("retires a habit, keeps its ticks, and brings it back last in its part", async () => {
    await addReadyRoutines(tyler.id, database, NINE)
    let card = await loadDailyCard(tyler.id, database, NINE)
    const morning = card.admin!.habits.filter((h) => h.part === "morning")
    expect(morning.map((h) => h.name)).toEqual(["Drink water", "Stretch", "Plan the day"])
    await setHabitCount(tyler.id, { habitId: morning[0].id, day: MONDAY, count: 1 }, database, NINE)
    await retireHabit(tyler.id, morning[0].id, database, NINE)
    card = await loadDailyCard(tyler.id, database, NINE)
    expect(card.admin!.retired.map((h) => h.name)).toEqual(["Drink water"])
    expect((await loadMonthOfTicks(tyler.id, "2099-03", database, NINE)).habits.find((h) => h.name === "Drink water")?.cells[1]).toBe("done")
    await orderHabits(tyler.id, "morning", [morning[2].id, morning[1].id], database)
    await restoreHabit(tyler.id, morning[0].id, database, NINE)
    card = await loadDailyCard(tyler.id, database, NINE)
    expect(card.admin!.habits.filter((h) => h.part === "morning").map((h) => h.name)).toEqual(["Plan the day", "Stretch", "Drink water"])
  })
})

describe("the site admin's journal", () => {
  it("keeps the site admin's section order, and refuses it from anyone else", async () => {
    expect((await loadDailyCard(tyler.id, database, NINE)).settings.sections[0]).toBe("line")
    const order = ["routine", "journal", "deepWork", "meeting", "line", "progress", "windDown"] as const
    await saveSectionOrder(tyler.id, [...order], database)
    expect((await loadDailyCard(tyler.id, database, NINE)).settings.sections).toEqual([...order])
    await expect(saveSectionOrder(ben.id, [...order], database)).rejects.toThrow()
  })

  it("shows no line or question of its own, only the site admin's", async () => {
    let card = await loadDailyCard(tyler.id, database, NINE)
    expect(card.admin!.line).toBe("")
    expect(card.admin!.question).toBe("")
    await saveOwnWords(tyler.id, "lines", ["Ship one thing"], database)
    await saveOwnWords(tyler.id, "questions", ["What surprised you?"], database)
    card = await loadDailyCard(tyler.id, database, NINE)
    expect(card.admin!.line).toBe("Ship one thing")
    expect(card.admin!.question).toBe("What surprised you?")
  })

  it("saves today's words and tomorrow's intention, and nothing for a day gone", async () => {
    await saveJournalText(tyler.id, { day: MONDAY, field: "intention", text: "Finish the homepage" }, database, NINE)
    await saveJournalText(tyler.id, { day: "2099-03-03", field: "intention", text: "Call Hart Dental" }, database, NINE)
    await saveJournalText(tyler.id, { day: MONDAY, field: "answer", text: "The walk", question: "What gave you energy today?" }, database, NINE)
    await saveJournalRating(tyler.id, { day: MONDAY, rating: 4 }, database, NINE)
    await expect(saveJournalText(tyler.id, { day: "2099-03-01", field: "win", text: "late" }, database, NINE)).rejects.toThrow(
      "That day has passed"
    )
    await expect(saveJournalText(tyler.id, { day: "2099-03-03", field: "win", text: "early" }, database, NINE)).rejects.toThrow(
      "That day has passed"
    )
    const card = await loadDailyCard(tyler.id, database, NINE)
    expect(card.admin!.today.intention).toBe("Finish the homepage")
    expect(card.admin!.tomorrowIntention).toBe("Call Hart Dental")
    expect(card.admin!.today.rating).toBe(4)
    expect(card.admin!.question).toBe("What gave you energy today?")
    expect(card.admin!.trend.at(-1)).toEqual({ day: MONDAY, rating: 4 })
    expect((await loadYearOfRatings(tyler.id, 2099, database)).ratings).toEqual({ [MONDAY]: 4 })
  })

  it("starts the day once, on the card's day, even past midnight", async () => {
    await markSleep(tyler.id, "up", database, at("2099-03-03", "01:30"))
    expect((await loadDailyCard(tyler.id, database, at("2099-03-03", "02:00"))).admin!.today.upAt).not.toBeNull()
    // Before morning starts it is still Monday on the card, so Tuesday has not started.
    expect((await loadDailyCard(tyler.id, database, at("2099-03-03", "08:00"))).admin!.today.upAt).toBeNull()
  })

  it("finds words, treating % and _ as plain letters", async () => {
    await saveJournalText(tyler.id, { day: MONDAY, field: "win", text: "Sent 100% of the invoices" }, database, NINE)
    await saveJournalText(tyler.id, { day: MONDAY, field: "note", text: "A slow start" }, database, NINE)
    expect(await searchJournal(tyler.id, "100%", database)).toEqual([{ day: MONDAY, field: "win", text: "Sent 100% of the invoices" }])
    expect(await searchJournal(tyler.id, "_", database)).toEqual([])
  })

  it("looks a year back on this day", async () => {
    await saveJournalText(tyler.id, { day: "2098-03-02", field: "win", text: "Moved into the new office" }, database, at("2098-03-02", "09:00"))
    expect((await loadDailyCard(tyler.id, database, NINE)).admin!.onThisDay).toEqual({ day: "2098-03-02", text: "Moved into the new office" })
  })

  it("puts tomorrow's meetings, due dates and days off on the night card", async () => {
    await database.insert(projectMeetings).values({
      id: "m",
      teamId,
      title: "Planning",
      color: "blue",
      day: "2099-03-03",
      startTime: "10:00",
      endTime: "11:00",
      timeZone: "UTC",
      createdAt: NINE,
      updatedAt: NINE,
    })
    await createTask(actor(ben), { projectId: website, title: "Launch", notes: "", assigneeUserId: ben.id, dueDate: "2099-03-03", steps: [] }, database)
    await createTask(actor(tyler), { projectId: PERSONAL_PROJECT_ID, title: "Send the contract", notes: "", assigneeUserId: tyler.id, dueDate: "2099-03-03", steps: [] }, database)
    await database.insert(projectTimeOff).values({ id: "o", teamId, userId: ben.id, firstDay: "2099-03-03", lastDay: "2099-03-04", createdAt: NINE })
    const tomorrow = (await loadDailyCard(tyler.id, database, at(MONDAY, "20:00"))).admin!.tomorrow
    expect(tomorrow.meetings.map((m) => m.title)).toEqual(["Planning"])
    expect(tomorrow.due.map((t) => t.title).sort()).toEqual(["Launch", "Send the contract"])
    expect(tomorrow.away).toEqual([{ name: "Ben Tester", teamName: "Acme" }])
  })
})

describe("the routine's bell reminder", () => {
  it("rings once after its time while habits are left, never hours late, and never on a day off", async () => {
    await createHabit(tyler.id, habit("Stretch"), database, at("2099-03-01", "09:00"))
    // Sunday's morning reminder had its hour; at night it stays quiet.
    await sendRoutineReminders(database, at("2099-03-01", "20:00"))
    await sendRoutineReminders(database, at(MONDAY, "09:59"))
    await sendRoutineReminders(database, at(MONDAY, "10:00"))
    await sendRoutineReminders(database, at(MONDAY, "10:01"))
    const sent = await database.select().from(customShellNotifications).where(eq(customShellNotifications.recipientUserId, tyler.id))
    expect(sent.map((notice) => [notice.message, notice.detail])).toEqual([["Your morning routine isn't done yet", "Still to do: Stretch"]])
    expect(noticeKindFromWords({ type: "app_activity", message: routineReminderHeading("morning") })).toBe("routine_reminder")

    await database.insert(projectTimeOff).values({ id: "x", teamId, userId: tyler.id, firstDay: "2099-03-03", lastDay: "2099-03-03", createdAt: NINE })
    await sendRoutineReminders(database, at("2099-03-03", "11:00"))
    expect(await database.select().from(customShellNotifications).where(eq(customShellNotifications.recipientUserId, tyler.id))).toHaveLength(1)
  })
})

describe("the weather", () => {
  it("finds the city once, then keeps its weather for 30 minutes, and goes quiet when the service fails", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("geocoding")) {
        return new Response(JSON.stringify({ results: [{ name: "Toronto", admin1: "Ontario", latitude: 43.7, longitude: -79.42 }] }))
      }
      return new Response(JSON.stringify({ current: { temperature_2m: 11.6, weather_code: 61 } }))
    })
    vi.stubGlobal("fetch", fetchMock)
    expect(await saveDailyCity(ben.id, "toronto", database)).toEqual({ city: "Toronto, Ontario" })
    expect(await loadDailyWeather(ben.id, database, 0)).toEqual({ city: "Toronto, Ontario", temperature: 12, kind: "rain" })
    await loadDailyWeather(ben.id, database, 60_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })))
    expect(await loadDailyWeather(ben.id, database, 31 * 60_000)).toBeNull()
    await expect(saveDailyCity(ben.id, "Nowhere", database)).rejects.toThrow("weather service")
  })
})
