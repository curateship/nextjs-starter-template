import { describe, expect, it } from "vitest"

import {
  targetPeriodEnd,
  targetPeriodStart,
  targetProgressLabel,
} from "@/lib/pomodoro/project-targets"

describe("project target periods", () => {
  it("runs a week from Monday to the next Monday", () => {
    expect(targetPeriodStart("week", "2026-10-07")).toBe("2026-10-05")
    expect(targetPeriodEnd("week", "2026-10-11")).toBe("2026-10-12")
  })

  it("runs a month to the first of the next, across a year end", () => {
    expect(targetPeriodStart("month", "2026-12-31")).toBe("2026-12-01")
    expect(targetPeriodEnd("month", "2026-12-31")).toBe("2027-01-01")
    expect(targetPeriodEnd("month", "2026-02-10")).toBe("2026-03-01")
  })

  it("reads 4 hours against a 10-hour week as 4h of 10h", () => {
    expect(targetProgressLabel(4 * 3_600, 10, "week")).toBe("4h of 10h this week")
    expect(targetProgressLabel(25 * 60, 40, "month")).toBe("25m of 40h this month")
  })
})
