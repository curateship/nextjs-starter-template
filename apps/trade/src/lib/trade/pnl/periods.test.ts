import { describe, expect, it } from "vitest"

import {
  dayKeyOf,
  dayStart,
  daysOfMonth,
  earliestMonth,
  hourOf,
  periodStart,
  weekdayColumn,
} from "@/lib/trade/pnl/periods"

// 5 September 2026 at 14:30 in Toronto (EDT, UTC-4) is 18:30 UTC.
const SAT_5_SEP = Date.UTC(2026, 8, 5, 18, 30)

describe("P&L day boundaries", () => {
  it("puts a fill just after midnight UTC on the Toronto evening before", () => {
    // 00:30 UTC on 2 September is 20:30 on 1 September in Toronto.
    expect(dayKeyOf(Date.UTC(2026, 8, 2, 0, 30))).toBe("2026-09-01")
    expect(hourOf(Date.UTC(2026, 8, 2, 0, 30))).toBe(20)
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

describe("P&L periods", () => {
  it("this week starts on the most recent Monday", () => {
    expect(periodStart("week", SAT_5_SEP)).toBe(dayStart("2026-08-31"))
  })

  it("this month starts on the first", () => {
    expect(periodStart("month", SAT_5_SEP)).toBe(dayStart("2026-09-01"))
  })

  it("three months never reaches back before records begin on 20 August 2026", () => {
    // July 1 would be the natural start; records begin on 20 August.
    expect(periodStart("quarter", SAT_5_SEP)).toBe(dayStart("2026-08-20"))
    expect(earliestMonth()).toEqual({ year: 2026, month: 8 })
  })

  it("three months covers this month and the two whole months before it", () => {
    const dec = Date.UTC(2026, 11, 10, 12)
    expect(periodStart("quarter", dec)).toBe(dayStart("2026-10-01"))
  })
})
