import { describe, expect, it } from "vitest"

import { bodyweightPace } from "@/lib/fitness/bodyweight-target"
import { checkInWeek } from "@/lib/fitness/check-in"
import { addDays } from "@/lib/fitness/dates"
import { missingBodyParts, missingLine } from "@/lib/fitness/missing-muscles"
import { weeklyStreak } from "@/lib/fitness/progress"
import { displayStatus, programEndDay, programWeekOf } from "@/lib/fitness/schedule"

// Mondays in 2099, so nothing here turns stale with the real date.
const MONDAY = "2099-01-05"

describe("skipping a day", () => {
  it("is neither done nor missed", () => {
    expect(displayStatus("planned", "2099-01-05", "2099-01-06", null, true)).toBe("skipped")
    expect(displayStatus("planned", "2099-01-07", "2099-01-06", null, true)).toBe("skipped")
    expect(displayStatus("done", "2099-01-05", "2099-01-06", null, true)).toBe("done")
  })

  it("comes off that week's goal, so two workouts and a skip keep a goal of 3", () => {
    const thisMonday = addDays(MONDAY, 14)
    const workoutDays = [MONDAY, addDays(MONDAY, 2), addDays(MONDAY, 4), addDays(MONDAY, 7), addDays(MONDAY, 9)]
    const without = weeklyStreak({ workoutDays, goal: 3, today: thisMonday, pausedWeeks: new Set() })
    expect(without.streak).toBe(0)
    const skipped = weeklyStreak({
      workoutDays,
      goal: 3,
      today: thisMonday,
      pausedWeeks: new Set(),
      skippedDays: [addDays(MONDAY, 11)],
    })
    expect(skipped.streak).toBe(2)
    expect(skipped.weekGoal).toBe(3)
  })

  it("lowers this week's goal and counts a fully skipped week like a pause", () => {
    const thisMonday = addDays(MONDAY, 14)
    const result = weeklyStreak({
      workoutDays: [MONDAY, addDays(MONDAY, 2), addDays(MONDAY, 4), thisMonday],
      goal: 3,
      today: thisMonday,
      pausedWeeks: new Set(),
      skippedDays: [addDays(MONDAY, 7), addDays(MONDAY, 9), addDays(MONDAY, 11), addDays(thisMonday, 2)],
    })
    expect(result.weekGoal).toBe(2)
    expect(result.streak).toBe(1)
  })
})

describe("program length", () => {
  it("ends twelve weeks from the start and counts the week", () => {
    expect(programEndDay(MONDAY, 12)).toBe("2099-03-29")
    expect(programEndDay(MONDAY, null)).toBeNull()
    expect(programWeekOf(MONDAY, MONDAY)).toBe(1)
    expect(programWeekOf(MONDAY, addDays(MONDAY, 29))).toBe(5)
  })
})

describe("weekly check-in", () => {
  it("is this week's from Sunday and still last week's until the next Sunday", () => {
    expect(checkInWeek("2099-01-11")).toBe("2099-01-05")
    expect(checkInWeek("2099-01-12")).toBe("2099-01-05")
    expect(checkInWeek("2099-01-17")).toBe("2099-01-05")
    expect(checkInWeek("2099-01-18")).toBe("2099-01-12")
  })
})

describe("target bodyweight pace", () => {
  const trend = (start: number, perDay: number, days: number) =>
    Array.from({ length: days }, (_, index) => ({ day: addDays(MONDAY, index), averageKg: start + perDay * index }))

  it("works out the weekly pace and the weeks to go", () => {
    // 82 kg down 0.4 kg a week for 28 days: 80.4 kg, 3.4 kg from 77 kg.
    const pace = bodyweightPace(trend(82, -0.4 / 7, 29), 77)
    expect(pace?.kind).toBe("toward")
    if (pace?.kind !== "toward") return
    expect(pace.kgPerWeek).toBeCloseTo(-0.4, 5)
    expect(pace.weeks).toBe(9)
  })

  it("says so when it's going the wrong way, holding steady, too soon or there", () => {
    expect(bodyweightPace(trend(80, 0.1, 21), 75)?.kind).toBe("away")
    expect(bodyweightPace(trend(80, 0, 21), 75)?.kind).toBe("steady")
    expect(bodyweightPace(trend(80, -0.1, 10), 75)?.kind).toBe("tooSoon")
    expect(bodyweightPace(trend(75.3, 0, 3), 75)?.kind).toBe("onTarget")
    expect(bodyweightPace([], 75)).toBeNull()
  })
})

describe("missing muscle warning", () => {
  const usualLegs = { sets: { quads: 6, chest: 6 } }

  it("names a body part with no sets this week and none planned", () => {
    const parts = missingBodyParts({ weeks: [usualLegs, usualLegs, { sets: { chest: 3 } }], plannedMuscles: [] })
    expect(parts).toEqual(["legs"])
    expect(missingLine(parts)).toBe("No leg sets this week, and none planned.")
  })

  it("stays quiet when a planned workout still covers it, or there isn't two weeks of history", () => {
    expect(missingBodyParts({ weeks: [usualLegs, usualLegs, { sets: {} }], plannedMuscles: ["quads", "chest"] })).toEqual([])
    expect(missingBodyParts({ weeks: [usualLegs, { sets: {} }], plannedMuscles: [] })).toEqual([])
  })

  it("leaves out a body part that usually gets under 4 sets, and names several in one line", () => {
    const usual: Record<string, number> = { calves: 3, lats: 8, chest: 5 }
    const weeks = [{ sets: usual }, { sets: usual }, { sets: {} }]
    const parts = missingBodyParts({ weeks, plannedMuscles: [] })
    expect(parts).toEqual(["back", "chest"])
    expect(missingLine(parts)).toBe("No back or chest sets this week, and none planned.")
  })
})
