import { describe, expect, it } from "vitest"

import { formatFocusDuration, resolveReportRange, shiftLocalDate } from "@/lib/focus-history"

describe("shiftLocalDate", () => {
  it("moves across month, year, and leap boundaries", () => {
    expect(shiftLocalDate("2026-07-16", 1)).toBe("2026-07-17")
    expect(shiftLocalDate("2026-07-01", -1)).toBe("2026-06-30")
    expect(shiftLocalDate("2026-01-01", -1)).toBe("2025-12-31")
    expect(shiftLocalDate("2024-02-28", 1)).toBe("2024-02-29")
    expect(shiftLocalDate("2025-02-28", 1)).toBe("2025-03-01")
  })

  it("rejects malformed dates", () => {
    expect(() => shiftLocalDate("yesterday", 1)).toThrow("INVALID_LOCAL_DATE")
  })
})

describe("resolveReportRange", () => {
  it("resolves every range to bounded local dates", () => {
    expect(resolveReportRange("7d", "2026-07-16")).toEqual({ startDate: "2026-07-10", endDate: "2026-07-16" })
    expect(resolveReportRange("30d", "2026-07-16")).toEqual({ startDate: "2026-06-17", endDate: "2026-07-16" })
    expect(resolveReportRange("12m", "2026-07-16")).toEqual({ startDate: "2025-08-01", endDate: "2026-07-16" })
    expect(resolveReportRange("year", "2026-07-16")).toEqual({ startDate: "2026-01-01", endDate: "2026-07-16" })
  })

  it("handles year starts and January twelve-month windows", () => {
    expect(resolveReportRange("year", "2026-01-01")).toEqual({ startDate: "2026-01-01", endDate: "2026-01-01" })
    expect(resolveReportRange("12m", "2026-01-31")).toEqual({ startDate: "2025-02-01", endDate: "2026-01-31" })
  })
})

describe("formatFocusDuration", () => {
  it("formats zero, minutes, and hour totals", () => {
    expect(formatFocusDuration(0)).toBe("0m")
    expect(formatFocusDuration(59)).toBe("0m")
    expect(formatFocusDuration(1_500)).toBe("25m")
    expect(formatFocusDuration(3_600)).toBe("1h 00m")
    expect(formatFocusDuration(4_920)).toBe("1h 22m")
  })
})
