import { describe, expect, it } from "vitest"

import {
  addMonths,
  daysCovered,
  formatMonthLabel,
  isValidDateString,
  monthMatrix,
  parseYearMonth,
  toDateString,
  toMonthString,
} from "@/lib/events/calendar-grid"

/**
 * Copied with the helpers from the old Directory app's
 * `lib/utils/calendar-grid.test.ts`, plus the "2026-09" month addresses the
 * Events page uses.
 */

describe("days", () => {
  it("accepts real dates and refuses malformed or impossible ones", () => {
    expect(isValidDateString("2026-07-25")).toBe(true)
    expect(isValidDateString("2026-02-28")).toBe(true)
    expect(isValidDateString("2026-02-30")).toBe(false)
    expect(isValidDateString("2026-13-01")).toBe(false)
    expect(isValidDateString("2026-7-5")).toBe(false)
    expect(isValidDateString("not-a-date")).toBe(false)
    expect(isValidDateString(undefined)).toBe(false)
    expect(isValidDateString(20260725)).toBe(false)
  })
})

describe("months", () => {
  it("roll over year boundaries in both directions", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({
      year: 2027,
      month: 1,
    })
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
    })
    expect(addMonths({ year: 2026, month: 6 }, 8)).toEqual({
      year: 2027,
      month: 2,
    })
    expect(addMonths({ year: 2026, month: 3 }, -14)).toEqual({
      year: 2025,
      month: 1,
    })
  })

  it("read from a day or a month address, and round-trip", () => {
    expect(parseYearMonth("2026-07-25")).toEqual({ year: 2026, month: 7 })
    expect(parseYearMonth("2026-10")).toEqual({ year: 2026, month: 10 })
    expect(parseYearMonth("2026-13")).toBeNull()
    expect(parseYearMonth("bad")).toBeNull()
    expect(parseYearMonth(undefined)).toBeNull()
    expect(toDateString(2026, 7, 5)).toBe("2026-07-05")
    expect(toMonthString({ year: 2026, month: 7 })).toBe("2026-07")
  })

  it("have a label", () => {
    expect(formatMonthLabel({ year: 2026, month: 7 })).toBe("July 2026")
  })
})

describe("the grid", () => {
  it("is whole weeks starting on Sunday and covering every day", () => {
    const cells = monthMatrix({ year: 2026, month: 7 })

    expect(cells.length % 7).toBe(0)
    expect(new Date(`${cells[0]?.date}T00:00:00Z`).getUTCDay()).toBe(0)

    const inMonth = cells
      .filter((cell) => cell.inCurrentMonth)
      .map((cell) => cell.date)
    expect(inMonth).toHaveLength(31)
    expect(inMonth[0]).toBe("2026-07-01")
    expect(inMonth[30]).toBe("2026-07-31")
    expect(new Set(inMonth).size).toBe(31)
  })

  it("places the 1st at its real weekday", () => {
    const cells = monthMatrix({ year: 2026, month: 2 })
    const firstIndex = cells.findIndex((cell) => cell.date === "2026-02-01")
    expect(firstIndex).toBe(new Date("2026-02-01T00:00:00Z").getUTCDay())
  })
})

describe("the days an event covers", () => {
  it("is the start day alone with no end day, or an end on the same day", () => {
    expect(daysCovered("2026-10-03", null, "2026-09-27", "2026-11-07")).toEqual(
      ["2026-10-03"]
    )
    expect(
      daysCovered("2026-10-03", "2026-10-03", "2026-09-27", "2026-11-07")
    ).toEqual(["2026-10-03"])
  })

  it("is every day from the first to the last", () => {
    expect(
      daysCovered("2026-10-02", "2026-10-04", "2026-09-27", "2026-11-07")
    ).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"])
  })

  it("crosses the end of a month and keeps to the window it is asked about", () => {
    // October's grid runs 27 Sep to 7 Nov, November's 1 Nov to 5 Dec.
    const october = daysCovered(
      "2026-10-30",
      "2026-11-02",
      "2026-09-27",
      "2026-10-31"
    )
    const november = daysCovered(
      "2026-10-30",
      "2026-11-02",
      "2026-11-01",
      "2026-12-05"
    )
    expect(october).toEqual(["2026-10-30", "2026-10-31"])
    expect(november).toEqual(["2026-11-01", "2026-11-02"])
  })

  it("is empty for an event outside the window", () => {
    expect(
      daysCovered("2026-12-24", "2026-12-26", "2026-09-27", "2026-11-07")
    ).toEqual([])
  })
})
