import { describe, expect, it } from "vitest"

import { isPlannableFutureDay, planningDays } from "@/lib/pomodoro/plan-ahead"

describe("planning ahead", () => {
  it("offers today and the next six days, across a month end", () => {
    expect(planningDays("2026-10-28")).toEqual([
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ])
  })

  it("accepts only tomorrow to six days ahead as a future day", () => {
    expect(isPlannableFutureDay("2026-10-07", "2026-10-07")).toBe(false)
    expect(isPlannableFutureDay("2026-10-07", "2026-10-06")).toBe(false)
    expect(isPlannableFutureDay("2026-10-07", "2026-10-08")).toBe(true)
    expect(isPlannableFutureDay("2026-10-07", "2026-10-13")).toBe(true)
    expect(isPlannableFutureDay("2026-10-07", "2026-10-14")).toBe(false)
  })
})
