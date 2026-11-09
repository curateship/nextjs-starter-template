import { describe, expect, it } from "vitest"

import {
  dayKeyOf,
  dayStart,
  daysOfMonth,
  earliestMonth,
  weekdayColumn,
} from "@/lib/trade/pnl/periods"

describe("P&L day boundaries", () => {
  it("puts a fill just after midnight UTC on the Toronto evening before", () => {
    // 00:30 UTC on 2 September is 20:30 on 1 September in Toronto.
    expect(dayKeyOf(Date.UTC(2026, 8, 2, 0, 30))).toBe("2026-09-01")
  })

  it("starts a day at midnight Toronto, four hours after midnight UTC in summer", () => {
    expect(dayStart("2026-09-01")).toBe(Date.UTC(2026, 8, 1, 4, 0))
  })

  it("lists every day of a month and knows which column Monday is", () => {
    expect(daysOfMonth(2026, 9)).toHaveLength(30)
    expect(daysOfMonth(2026, 2)).toHaveLength(28)
    // 7 September 2026 is a Monday; 5 September is a Saturday.
    expect(weekdayColumn("2026-09-07")).toBe(0)
    expect(weekdayColumn("2026-09-05")).toBe(5)
  })
})

describe("P&L month grid range", () => {
  it("never reaches back before records begin in August 2026", () => {
    expect(earliestMonth()).toEqual({ year: 2026, month: 8 })
  })
})
