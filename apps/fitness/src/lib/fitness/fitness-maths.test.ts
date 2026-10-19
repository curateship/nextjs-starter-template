import { describe, expect, it } from "vitest"

import { addDays, weekStart } from "@/lib/fitness/dates"
import { EXERCISE_CATALOG } from "@/lib/fitness/exercise-catalog"
import { DEFAULT_APP_SETTINGS } from "@/lib/fitness/app-settings"
import { platesFor, warmUpSets } from "@/lib/fitness/plates"

const DEFAULT_PLATES_KG = DEFAULT_APP_SETTINGS.units.platesKg
import {
  DEFAULT_PROGRESSION,
  fullyPausedWeeks,
  nextWeight,
  weeklyStreak,
  weightTrend,
} from "@/lib/fitness/progress"
import { displayStatus, fillSchedule, isLightWeek } from "@/lib/fitness/schedule"
import { estimateOneRepMax, formatWeight, fromKg, toKg } from "@/lib/fitness/weights"

describe("weights", () => {
  it("estimates 80 kg for 5 reps as about 93 kg", () => {
    expect(estimateOneRepMax(80, 5)).toBeCloseTo(93.33, 2)
    expect(estimateOneRepMax(100, 1)).toBe(100)
    expect(estimateOneRepMax(100, 0)).toBe(0)
  })

  it("converts pounds both ways without drifting", () => {
    expect(fromKg(toKg(225, "lb"), "lb")).toBeCloseTo(225, 9)
    expect(formatWeight(100, "lb")).toBe("220.5 lb")
    expect(formatWeight(92.5, "kg")).toBe("92.5 kg")
    expect(formatWeight(100, "kg")).toBe("100 kg")
  })
})

describe("plates", () => {
  it("loads 100 kg on a 20 kg bar as 25 + 15 a side", () => {
    expect(platesFor(100, 20, DEFAULT_PLATES_KG)).toEqual({
      perSide: [25, 15],
      loadedKg: 100,
      short: false,
    })
  })

  it("says so when the plates cannot make the weight", () => {
    const load = platesFor(101, 20, DEFAULT_PLATES_KG)
    expect(load.loadedKg).toBe(100)
    expect(load.short).toBe(true)
  })

  it("ramps up from the empty bar and never repeats a weight", () => {
    expect(warmUpSets(100, 20, DEFAULT_PLATES_KG)).toEqual([
      { weightKg: 20, reps: 10 },
      { weightKg: 40, reps: 5 },
      { weightKg: 60, reps: 3 },
      { weightKg: 80, reps: 2 },
    ])
    expect(warmUpSets(20, 20, DEFAULT_PLATES_KG)).toEqual([])
    const light = warmUpSets(30, 20, DEFAULT_PLATES_KG)
    expect(new Set(light.map((set) => set.weightKg)).size).toBe(light.length)
  })
})

describe("schedule", () => {
  // 2099-01-05 is a Monday.
  const monday = "2099-01-05"

  const week = new Map([
    [1, "push"],
    [3, "pull"],
    [5, "legs"],
  ])

  it("repeats the week: Push every Monday, Pull every Wednesday, Legs every Friday", () => {
    const entries = fillSchedule({ from: monday, to: addDays(monday, 13), week, taken: new Set(), pause: null })
    expect(entries.map((entry) => [entry.day, entry.dayId])).toEqual([
      ["2099-01-05", "push"],
      ["2099-01-07", "pull"],
      ["2099-01-09", "legs"],
      ["2099-01-12", "push"],
      ["2099-01-14", "pull"],
      ["2099-01-16", "legs"],
    ])
  })

  it("leaves paused days and days already taken alone", () => {
    const entries = fillSchedule({
      from: monday,
      to: addDays(monday, 13),
      week,
      taken: new Set(["2099-01-14"]),
      pause: { from: monday, until: addDays(monday, 6) },
    })
    expect(entries.map((entry) => entry.day)).toEqual(["2099-01-12", "2099-01-16"])
  })

  it("shows a past planned day as missed and a paused one as paused", () => {
    expect(displayStatus("planned", "2099-01-05", "2099-01-06", null)).toBe("missed")
    expect(displayStatus("planned", "2099-01-07", "2099-01-06", null)).toBe("planned")
    expect(displayStatus("done", "2099-01-05", "2099-01-06", null)).toBe("done")
    expect(
      displayStatus("planned", "2099-01-05", "2099-01-06", { from: "2099-01-01", until: null })
    ).toBe("paused")
  })

  it("makes every fourth week light in four-week blocks", () => {
    expect(isLightWeek(addDays(monday, 7 * 3), monday, 4)).toBe(true)
    expect(isLightWeek(addDays(monday, 7 * 2), monday, 4)).toBe(false)
    expect(isLightWeek(addDays(monday, 7 * 7), monday, 4)).toBe(true)
    expect(isLightWeek(addDays(monday, 7 * 3), monday, 0)).toBe(false)
  })
})

describe("progression", () => {
  it("adds 2.5 kg after a clean session", () => {
    expect(nextWeight({ weightKg: 100, missStreak: 1 }, true, DEFAULT_PROGRESSION, 2.5)).toEqual({
      weightKg: 102.5,
      missStreak: 0,
    })
  })

  it("drops a 100 kg squat to 90 kg after three misses", () => {
    let state = { weightKg: 100, missStreak: 0 }
    state = nextWeight(state, false, DEFAULT_PROGRESSION, 2.5)
    state = nextWeight(state, false, DEFAULT_PROGRESSION, 2.5)
    expect(state).toEqual({ weightKg: 100, missStreak: 2 })
    state = nextWeight(state, false, DEFAULT_PROGRESSION, 2.5)
    expect(state).toEqual({ weightKg: 90, missStreak: 0 })
  })
})

describe("weigh-in trend", () => {
  it("averages the seven days ending on each weigh-in", () => {
    const trend = weightTrend([
      { day: "2099-01-01", weightKg: 80 },
      { day: "2099-01-02", weightKg: 82 },
      { day: "2099-01-09", weightKg: 79 },
    ])
    expect(trend.map((point) => point.averageKg)).toEqual([80, 81, 79])
  })
})

describe("weekly streak", () => {
  const thisMonday = "2099-01-19"
  const days = (monday: string, count: number) =>
    Array.from({ length: count }, (_, index) => addDays(monday, index))

  it("counts weeks in a row at or above the goal", () => {
    const workoutDays = [
      ...days("2099-01-05", 3),
      ...days("2099-01-12", 3),
      ...days(thisMonday, 1),
    ]
    expect(
      weeklyStreak({ workoutDays, goal: 3, today: thisMonday, pausedWeeks: new Set() })
    ).toEqual({ streak: 2, thisWeek: 1 })
  })

  it("resets after a short week and skips a paused one", () => {
    const workoutDays = [...days("2099-01-05", 3), ...days(thisMonday, 3)]
    expect(
      weeklyStreak({ workoutDays, goal: 3, today: thisMonday, pausedWeeks: new Set() }).streak
    ).toBe(1)
    expect(
      weeklyStreak({
        workoutDays,
        goal: 3,
        today: thisMonday,
        pausedWeeks: new Set(["2099-01-12"]),
      }).streak
    ).toBe(2)
  })

  it("lists only the weeks a pause covered from Monday to Sunday", () => {
    expect(fullyPausedWeeks("2099-01-06", "2099-01-25")).toEqual(["2099-01-12", "2099-01-19"])
    expect(weekStart("2099-01-11")).toBe("2099-01-05")
  })
})

describe("exercise catalog", () => {
  it("has about a hundred lifts with unique slugs", () => {
    expect(EXERCISE_CATALOG.length).toBeGreaterThanOrEqual(95)
    const slugs = EXERCISE_CATALOG.map((exercise) => exercise.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
