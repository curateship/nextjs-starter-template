import { describe, expect, it } from "vitest"

import {
  ACHIEVEMENTS,
  achievementProgress,
  earnedAchievementIds,
  findAchievement,
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

describe("how far a locked badge has got", () => {
  it("counts sessions up to what the badge takes", () => {
    const badge = findAchievement("hundred-sessions")!
    expect(
      achievementProgress(badge, { ...NOTHING, focusSessions: 62 }).label
    ).toBe("62 of 100 sessions")
  })

  it("reads as nothing done on a brand new account", () => {
    const badge = findAchievement("ten-sessions")!
    const progress = achievementProgress(badge, NOTHING)
    expect(progress.label).toBe("0 of 10 sessions")
    expect(progress.ratio).toBe(0)
  })

  it("reports a streak as how far you have got", () => {
    const badge = findAchievement("seven-day-streak")!
    expect(achievementProgress(badge, NOTHING).label).toBe("no streak yet")
    expect(
      achievementProgress(badge, { ...NOTHING, bestStreak: 4 }).label
    ).toBe("best so far: 4 of 7 days")
  })

  it("reports focus time in hours and minutes", () => {
    const badge = findAchievement("ten-hours")!
    expect(achievementProgress(badge, NOTHING).label).toBe("0m of 10h")
    expect(
      achievementProgress(badge, {
        ...NOTHING,
        focusSeconds: 6 * 3_600 + 20 * 60,
      }).label
    ).toBe("6h 20m of 10h")
    expect(
      achievementProgress(badge, { ...NOTHING, focusSeconds: 2 * 3_600 }).label
    ).toBe("2h of 10h")
  })

  it("counts tasks up to what the badge takes", () => {
    const badge = findAchievement("fifty-tasks")!
    expect(
      achievementProgress(badge, { ...NOTHING, tasksCompleted: 12 }).label
    ).toBe("12 of 50 tasks")
  })

  // A counter can sit past a threshold while the badge still reads as locked,
  // because the award row is written after the counter moves.
  it("never reads past the threshold, and the bar never overflows", () => {
    const badge = findAchievement("ten-sessions")!
    const progress = achievementProgress(badge, {
      ...NOTHING,
      focusSessions: 40,
    })
    expect(progress.label).toBe("10 of 10 sessions")
    expect(progress.value).toBe(10)
    expect(progress.ratio).toBe(1)
  })

  it("agrees with the award rule on every badge", () => {
    // The progress bar being full and the badge being earned are the same
    // fact read twice; they must never disagree.
    const counters: AchievementCounters = {
      focusSessions: 50,
      focusSeconds: 10 * 3_600,
      tasksCompleted: 3,
      roomsHosted: 0,
      bestStreak: 7,
    }
    const earned = new Set(earnedAchievementIds(counters))
    for (const badge of ACHIEVEMENTS) {
      expect(achievementProgress(badge, counters).ratio === 1).toBe(
        earned.has(badge.id)
      )
    }
  })
})
