import { describe, expect, it } from "vitest"

import { isLongRangeReport, reportRanges, resolveReportRange } from "@/lib/pomodoro/focus-history"

describe("resolveReportRange", () => {
  it("puts Today first and makes it one day", () => {
    expect(reportRanges[0]).toBe("today")
    expect(resolveReportRange("today", "2026-10-19")).toEqual({
      startDate: "2026-10-19",
      endDate: "2026-10-19",
    })
  })

  it("keeps Today free", () => {
    expect(isLongRangeReport("today")).toBe(false)
  })

  it("leaves 7 days as the last seven dates", () => {
    expect(resolveReportRange("7d", "2026-10-19")).toEqual({
      startDate: "2026-10-13",
      endDate: "2026-10-19",
    })
  })
})
