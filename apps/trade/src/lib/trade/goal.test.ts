import { describe, expect, it } from "vitest"

import {
  DEFAULT_GOAL,
  goalLabel,
  goalTone,
  goalRemaining,
  goalSource,
  goalTarget,
  readGoal,
  shortGoalLabel,
  type Goal,
  type GoalProgress,
} from "@/lib/trade/goal"

const GOAL: Goal = { on: true, mode: "percent", percent: 0.1, dollars: 25 }

function progress(patch: Partial<GoalProgress> = {}): GoalProgress {
  return {
    made: 5,
    target: 25,
    walletsWorth: 25_000,
    openProfit: 0,
    missingVenues: [],
    unpricedFills: 0,
    ...patch,
  }
}

describe("reading a saved goal", () => {
  it("takes a whole saved goal as written", () => {
    expect(readGoal(GOAL)).toEqual(GOAL)
  })

  it("fills in what an older row never held", () => {
    expect(readGoal({ on: true, percent: 0.5 })).toEqual({
      ...DEFAULT_GOAL,
      on: true,
      percent: 0.5,
    })
  })

  it("reads nothing, and junk, as the goal switched off", () => {
    expect(readGoal(null)).toEqual(DEFAULT_GOAL)
    expect(readGoal("0.1%")).toEqual(DEFAULT_GOAL)
    expect(DEFAULT_GOAL.on).toBe(false)
  })

  it("ignores one field saved outside its limits and keeps the rest", () => {
    expect(readGoal({ ...GOAL, percent: 400 })).toEqual({
      ...GOAL,
      percent: DEFAULT_GOAL.percent,
    })
  })
})

describe("today's target", () => {
  it("is the percent of what the wallets are worth", () => {
    expect(goalTarget(GOAL, 25_000)).toBe(25)
  })

  it("is the fixed amount when that is how it was set", () => {
    expect(goalTarget({ ...GOAL, mode: "dollars", dollars: 40 }, 25_000)).toBe(
      40
    )
  })

  it("is unknown when no wallet answered", () => {
    expect(goalTarget(GOAL, null)).toBeNull()
    expect(goalTarget(GOAL, 0)).toBeNull()
  })
})

describe("what the header says", () => {
  it("reads made first, then today's target", () => {
    expect(shortGoalLabel(progress())).toBe("$5/$25")
    expect(goalLabel(progress())).toBe("Goal: $5 of $25")
  })

  it("draws a dash for a figure that never arrived", () => {
    expect(shortGoalLabel(progress({ made: null, target: null }))).toBe("—/—")
    expect(goalLabel(progress({ made: null, target: null }))).toBe(
      "Goal: — of —"
    )
  })

  it("keeps a losing day's minus sign", () => {
    expect(shortGoalLabel(progress({ made: -12 }))).toBe("-$12/$25")
  })
})

describe("how the day is going", () => {
  it("is green once the target is reached", () => {
    expect(goalTone(progress({ made: 25 }))).toBe("made")
    expect(goalTone(progress({ made: 24 }))).toBeNull()
  })

  it("is red on a day that is down", () => {
    expect(goalTone(progress({ made: -12 }))).toBe("lost")
  })

  it("leaves a printed zero alone, however small the loss behind it", () => {
    expect(goalTone(progress({ made: -0.004 }))).toBeNull()
    expect(goalTone(progress({ made: 0 }))).toBeNull()
  })

  it("colours nothing while a figure is unknown", () => {
    expect(goalTone(progress({ made: null }))).toBeNull()
    expect(goalTone(progress({ target: null }))).toBeNull()
  })

  it("says what is left, and never less than nothing", () => {
    expect(goalRemaining(progress())).toBe(20)
    expect(goalRemaining(progress({ made: 31 }))).toBe(0)
    expect(goalRemaining(progress({ made: null }))).toBeNull()
  })
})

describe("where the target came from", () => {
  it("names the percent and the wallet total", () => {
    expect(goalSource(GOAL, 25_000)).toBe(
      "0.1% of $25,000, what your wallets are worth now."
    )
  })

  it("says so when no wallet answered", () => {
    expect(goalSource(GOAL, null)).toContain("No wallet answered")
  })

  it("names the amount when the goal is a fixed one", () => {
    expect(goalSource({ ...GOAL, mode: "dollars" }, 25_000)).toBe(
      "$25 a day, the amount you set."
    )
  })
})
