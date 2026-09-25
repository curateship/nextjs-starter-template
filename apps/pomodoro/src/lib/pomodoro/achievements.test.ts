import { describe, expect, it } from "vitest"

import {
  ACHIEVEMENTS,
  earnedAchievementIds,
  findAchievement,
  remainingLabel,
  type AchievementCounters,
} from "@/lib/pomodoro/achievements"

const NOTHING: AchievementCounters = {
  focusSessions: 0,
  focusSeconds: 0,
  tasksCompleted: 0,
  roomsHosted: 0,
  bestStreak: 0,
}

describe("the badge list", () => {
  it("has no repeated id, because the id is what is stored", () => {
    const ids = ACHIEVEMENTS.map((badge) => badge.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("earns nothing on a brand new account", () => {
    expect(earnedAchievementIds(NOTHING)).toEqual([])
  })

  it("earns every step of a ladder at once, not only the top one", () => {
    // The 100th session earns the badges for 1, 10, 50 and 100. The award
    // path relies on this: it offers every earned badge and lets the unique
    // index drop the ones already on record.
    const earned = earnedAchievementIds({ ...NOTHING, focusSessions: 100 })
    expect(earned).toContain("first-focus")
    expect(earned).toContain("ten-sessions")
    expect(earned).toContain("fifty-sessions")
    expect(earned).toContain("hundred-sessions")
  })

  it("awards on the threshold, not one past it", () => {
    expect(earnedAchievementIds({ ...NOTHING, focusSessions: 99 })).not.toContain(
      "hundred-sessions"
    )
    expect(earnedAchievementIds({ ...NOTHING, focusSessions: 100 })).toContain(
      "hundred-sessions"
    )
  })

  it("keeps a streak badge once the streak breaks, because best is stored", () => {
    // bestStreak, never currentStreak: a week you ran is a week you ran.
    expect(earnedAchievementIds({ ...NOTHING, bestStreak: 7 })).toContain(
      "seven-day-streak"
    )
  })

  it("counts ten hours in seconds", () => {
    const short = { ...NOTHING, focusSeconds: 10 * 60 * 60 - 1 }
    const exact = { ...NOTHING, focusSeconds: 10 * 60 * 60 }
    expect(earnedAchievementIds(short)).not.toContain("ten-hours")
    expect(earnedAchievementIds(exact)).toContain("ten-hours")
  })
})

describe("what a locked badge still takes", () => {
  it("counts sessions down and gets the singular right", () => {
    const badge = findAchievement("ten-sessions")!
    expect(remainingLabel(badge, { ...NOTHING, focusSessions: 9 })).toBe(
      "1 session to go"
    )
    expect(remainingLabel(badge, { ...NOTHING, focusSessions: 3 })).toBe(
      "7 sessions to go"
    )
  })

  it("reports a streak as how far you have got", () => {
    const badge = findAchievement("seven-day-streak")!
    expect(remainingLabel(badge, NOTHING)).toBe("no streak yet")
    expect(remainingLabel(badge, { ...NOTHING, bestStreak: 1 })).toBe(
      "best so far: 1 day"
    )
    expect(remainingLabel(badge, { ...NOTHING, bestStreak: 4 })).toBe(
      "best so far: 4 days"
    )
  })

  it("reports focus time in hours and minutes", () => {
    const badge = findAchievement("ten-hours")!
    expect(remainingLabel(badge, NOTHING)).toBe("0m of 10h")
    expect(
      remainingLabel(badge, { ...NOTHING, focusSeconds: 6 * 3_600 + 20 * 60 })
    ).toBe("6h 20m of 10h")
    expect(remainingLabel(badge, { ...NOTHING, focusSeconds: 2 * 3_600 })).toBe(
      "2h of 10h"
    )
  })

  it("never counts below zero once the rule is already met", () => {
    const badge = findAchievement("ten-sessions")!
    expect(remainingLabel(badge, { ...NOTHING, focusSessions: 40 })).toBe(
      "0 sessions to go"
    )
  })
})
