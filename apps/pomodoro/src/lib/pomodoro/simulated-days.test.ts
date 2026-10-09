import { describe, expect, it } from "vitest"

import {
  drawHabits,
  planSimulatedDay,
  readSessionKey,
  seededRandom,
  sessionKey,
  shiftDate,
  zonedInstant,
  type SimulatedHabits,
} from "@/lib/pomodoro/simulated-days"
import { SIMULATED_PLACES, handleWord } from "@/lib/pomodoro/simulated-people"

/**
 * The made-up members' working day, as pure arithmetic: the same inputs give
 * the same day, a day never passes the cap, the past is never perfect, and
 * every city works in its own daytime.
 */

const TITLES = ["Draft the Q3 deck", "Reply to Ana's notes", "Chapter 4 edits"]

function habitsFor(overrides: Partial<SimulatedHabits> = {}): SimulatedHabits {
  return {
    timezone: "Europe/Berlin",
    city: "Berlin",
    startHour: 9,
    hoursADay: 3,
    daysOff: [],
    sessionMinutes: [20, 55],
    breakMinutes: [5, 20],
    historyDays: 90,
    taskTitles: TITLES,
    ...overrides,
  }
}

/** Working days only: the off days are part of the design, not a failure. */
function workingDays(userId: string, habits: SimulatedHabits, cap: number, from: string, count: number) {
  return Array.from({ length: count }, (_, index) =>
    planSimulatedDay(userId, habits, shiftDate(from, index), cap)
  ).filter((plan) => plan.sessions.length)
}

const minutesOf = (plan: { sessions: Array<{ minutes: number }> }) =>
  plan.sessions.reduce((sum, session) => sum + session.minutes, 0)

describe("a made-up member's day", () => {
  it("is the same day every time it is asked for", () => {
    const habits = habitsFor()
    expect(planSimulatedDay("a", habits, "2099-03-04", 3)).toEqual(
      planSimulatedDay("a", habits, "2099-03-04", 3)
    )
    expect(planSimulatedDay("a", habits, "2099-03-04", 3)).not.toEqual(
      planSimulatedDay("b", habits, "2099-03-04", 3)
    )
  })

  it("lands between 2.5 and 3.5 hours for a three-hour habit, and never above the cap", () => {
    for (const userId of ["one", "two", "three", "four", "five"]) {
      for (const plan of workingDays(userId, habitsFor(), 3, "2099-01-01", 120)) {
        const hours = minutesOf(plan) / 60
        expect(hours).toBeGreaterThanOrEqual(2.5)
        expect(hours).toBeLessThanOrEqual(3)
      }
      for (const plan of workingDays(userId, habitsFor(), 4, "2099-01-01", 120)) {
        const hours = minutesOf(plan) / 60
        expect(hours).toBeGreaterThanOrEqual(2.5)
        expect(hours).toBeLessThanOrEqual(3.5)
      }
    }
  })

  it("never plans more than a low cap, whatever the habit says", () => {
    for (const plan of workingDays("capped", habitsFor({ hoursADay: 4 }), 1, "2099-01-01", 60))
      expect(minutesOf(plan)).toBeLessThanOrEqual(60)
  })

  it("draws sessions of different lengths, never back-to-back twenty-fives", () => {
    const days = workingDays("lengths", habitsFor(), 3, "2099-01-01", 30)
    for (const plan of days) {
      expect(new Set(plan.sessions.map((session) => session.minutes)).size).toBeGreaterThanOrEqual(3)
      for (let index = 1; index < plan.sessions.length; index += 1) {
        const before = plan.sessions[index - 1]
        const after = plan.sessions[index]
        expect(after.startsAt.getTime()).toBeGreaterThan(before.startsAt.getTime() + before.minutes * 60_000)
      }
    }
  })

  it("leaves the habit's days off empty", () => {
    const habits = habitsFor({ daysOff: [0, 6] })
    // 2099-01-03 is a Saturday and 2099-01-04 a Sunday.
    expect(planSimulatedDay("weekend", habits, "2099-01-03", 3).sessions).toEqual([])
    expect(planSimulatedDay("weekend", habits, "2099-01-04", 3).sessions).toEqual([])
  })

  it("gives one to three tasks, each with at least one session", () => {
    for (const plan of workingDays("tasks", habitsFor(), 3, "2099-01-01", 40)) {
      expect(plan.tasks.length).toBeGreaterThanOrEqual(1)
      expect(plan.tasks.length).toBeLessThanOrEqual(3)
      for (const task of plan.tasks)
        expect(plan.sessions.some((session) => session.taskIndex === task.index)).toBe(true)
    }
  })

  it("keeps at most half the accounts on an unbroken streak over three months", () => {
    let unbroken = 0
    for (let index = 0; index < 40; index += 1) {
      const userId = `account-${index}`
      const place = SIMULATED_PLACES[index % SIMULATED_PLACES.length]
      const habits = drawHabits(seededRandom("habit", userId), place, TITLES, 90)
      const days = Array.from({ length: 90 }, (_, day) =>
        planSimulatedDay(userId, habits, shiftDate("2099-02-01", day), 3)
      )
      if (days.every((plan) => plan.sessions.length)) unbroken += 1
    }
    expect(unbroken).toBeLessThanOrEqual(20)
  })

  it("works in every city's own daytime", () => {
    for (const place of SIMULATED_PLACES) {
      for (let index = 0; index < 5; index += 1) {
        const userId = `${place.city}-${index}`
        const habits = drawHabits(seededRandom("habit", userId), place, TITLES, 90)
        for (const plan of workingDays(userId, habits, 4, "2099-03-01", 40)) {
          for (const session of plan.sessions) {
            const hour = Number(
              new Intl.DateTimeFormat("en-GB", {
                timeZone: place.timezone,
                hour: "2-digit",
                hourCycle: "h23",
              }).format(session.startsAt)
            )
            expect(hour).toBeGreaterThanOrEqual(6)
            expect(hour).toBeLessThan(23)
          }
        }
      }
    }
  })
})

describe("local clocks", () => {
  it("finds the moment a local clock reads a time, across a clock change", () => {
    expect(zonedInstant("2099-07-01", 9 * 60, "Asia/Tokyo").toISOString()).toBe("2099-07-01T00:00:00.000Z")
    expect(zonedInstant("2099-01-15", 9 * 60, "America/New_York").toISOString()).toBe("2099-01-15T14:00:00.000Z")
    expect(zonedInstant("2099-07-15", 9 * 60, "America/New_York").toISOString()).toBe("2099-07-15T13:00:00.000Z")
  })

  it("names each planned session once", () => {
    expect(readSessionKey(sessionKey("2099-01-02", 3))).toEqual({ localDate: "2099-01-02", index: 3 })
    expect(readSessionKey("a-browser-key")).toBeNull()
  })
})

describe("the bundled people", () => {
  it("turn names into handle words", () => {
    expect(handleWord("Ayşe")).toBe("ayse")
    expect(handleWord("Yılmaz")).toBe("yilmaz")
    expect(handleWord("Dela Cruz")).toBe("delacruz")
    expect(handleWord("Ji-woo")).toBe("jiwoo")
  })

  it("have enough names in every place for the dial's two hundred", () => {
    const total = SIMULATED_PLACES.reduce(
      (sum, place) => sum + place.firstNames.length * place.lastNames.length,
      0
    )
    expect(total).toBeGreaterThan(200)
    for (const place of SIMULATED_PLACES) expect(() => new Intl.DateTimeFormat("en", { timeZone: place.timezone })).not.toThrow()
  })
})
