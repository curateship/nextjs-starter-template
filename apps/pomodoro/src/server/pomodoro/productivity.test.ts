import { describe, expect, it } from "vitest"

import {
  buildFocusSummary,
  calculateFocusStreaks,
} from "@/server/pomodoro/productivity"

// Pure day arithmetic on yyyy-mm-dd strings — the old app's rule of working
// streaks out in JS, not SQL, so no test needs timezone data.
describe("focus streaks", () => {
  it("counts consecutive days up to today", () => {
    expect(
      calculateFocusStreaks(
        ["2026-09-22", "2026-09-23", "2026-09-24"],
        "2026-09-24"
      )
    ).toEqual({ currentStreak: 3, bestStreak: 3 })
  })

  it("keeps yesterday's streak current until today ends without a focus", () => {
    expect(
      calculateFocusStreaks(["2026-09-22", "2026-09-23"], "2026-09-24")
    ).toEqual({ currentStreak: 2, bestStreak: 2 })
  })

  it("resets the current streak after a missed day, keeping the best", () => {
    expect(
      calculateFocusStreaks(
        ["2026-09-18", "2026-09-19", "2026-09-20", "2026-09-24"],
        "2026-09-24"
      )
    ).toEqual({ currentStreak: 1, bestStreak: 3 })
    expect(
      calculateFocusStreaks(["2026-09-18", "2026-09-19"], "2026-09-24")
    ).toEqual({ currentStreak: 0, bestStreak: 2 })
  })

  it("spans a month boundary and ignores future or invalid dates", () => {
    expect(
      calculateFocusStreaks(
        ["2026-08-31", "2026-09-01", "2026-09-31", "not-a-date"],
        "2026-09-01"
      )
    ).toEqual({ currentStreak: 2, bestStreak: 2 })
  })
})

describe("the daily goal summary", () => {
  const days = [
    { localDate: "2026-09-23", focusSessions: 2 },
    { localDate: "2026-09-24", focusSessions: 4 },
  ]

  it("reports today's count against the goal", () => {
    expect(buildFocusSummary(days, "2026-09-24", 4)).toEqual({
      currentStreak: 2,
      bestStreak: 2,
      todayCompletedSessions: 4,
      dailyGoalSessions: 4,
      goalProgress: 1,
      goalCompleted: true,
    })
  })

  it("shows partial progress before the goal", () => {
    const summary = buildFocusSummary(days, "2026-09-23", 4)
    expect(summary.todayCompletedSessions).toBe(2)
    expect(summary.goalProgress).toBe(0.5)
    expect(summary.goalCompleted).toBe(false)
  })
})
