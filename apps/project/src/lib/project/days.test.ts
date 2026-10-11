import { describe, expect, it } from "vitest"

import { addDays, clockLabel, isRealDay, localNow, momentOf } from "@/lib/project/days"

describe("a person's day", () => {
  it("reads the day and time in the person's own zone", () => {
    const at = new Date("2099-03-06T23:30:00Z")
    expect(localNow(at, "UTC")).toEqual({ day: "2099-03-06", time: "23:30", weekday: 5 })
    expect(localNow(at, "Asia/Tokyo")).toEqual({ day: "2099-03-07", time: "08:30", weekday: 6 })
  })

  it("finds 9:00 on a day, either side of a clock change", () => {
    // New York moves its clocks forward on 9 March 2025.
    expect(momentOf("2025-03-08", "09:00", "America/New_York").toISOString()).toBe("2025-03-08T14:00:00.000Z")
    expect(momentOf("2025-03-10", "09:00", "America/New_York").toISOString()).toBe("2025-03-10T13:00:00.000Z")
    expect(momentOf("2025-03-10", "09:00", "Asia/Kolkata").toISOString()).toBe("2025-03-10T03:30:00.000Z")
  })

  it("steps days across months and tells real days from impossible ones", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(isRealDay("2026-02-28")).toBe(true)
    expect(isRealDay("2026-02-31")).toBe(false)
    expect(isRealDay("2026-13-01")).toBe(false)
    expect(isRealDay("not a day")).toBe(false)
  })

  it("writes a stored time the way people read it", () => {
    expect(clockLabel("09:00")).toBe("9:00 AM")
    expect(clockLabel("00:05")).toBe("12:05 AM")
    expect(clockLabel("17:30")).toBe("5:30 PM")
  })
})
