import { describe, expect, it } from "vitest"

import {
  dailyRate,
  growForwards,
  isLosingDay,
  lengthInDays,
  losingDayCount,
  maxLength,
  neededGain,
} from "./compound-growth"

describe("growing forwards", () => {
  it("turns $1,000 at 1% a day for 365 days into $37,783", () => {
    const result = growForwards({
      start: 1000,
      dailyRate: dailyRate(1, "day"),
      days: 365,
      monthlyAdd: 0,
    })
    expect(Math.round(result.end)).toBe(37783)
    expect(result.putIn).toBe(1000)
    expect(Math.round(result.made)).toBe(36783)
  })

  it("gives the same year whether the gain is per day, week or month", () => {
    // 1% a day is 7.21% a week and 35.4% a month once compounded.
    const perWeek = (Math.pow(1.01, 7) - 1) * 100
    const perMonth = (Math.pow(1.01, 365 / 12) - 1) * 100
    const byWeek = growForwards({
      start: 1000,
      dailyRate: dailyRate(perWeek, "week"),
      days: 365,
      monthlyAdd: 0,
    })
    const byMonth = growForwards({
      start: 1000,
      dailyRate: dailyRate(perMonth, "month"),
      days: 365,
      monthlyAdd: 0,
    })
    expect(byWeek.end).toBeCloseTo(37783.43, 1)
    expect(byMonth.end).toBeCloseTo(37783.43, 1)
  })

  it("adds the monthly money at the end of each of the 12 months", () => {
    const result = growForwards({
      start: 1000,
      dailyRate: 0,
      days: lengthInDays(1, "years"),
      monthlyAdd: 100,
    })
    expect(result.putIn).toBe(2200)
    expect(result.end).toBe(2200)
    expect(result.made).toBe(0)
    expect(result.rows.map((row) => row.month)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ])
  })

  it("ends on the last day when the length stops part-way into a month", () => {
    const result = growForwards({
      start: 1000,
      dailyRate: 0.01,
      days: 45,
      monthlyAdd: 0,
    })
    expect(result.rows.map((row) => row.day)).toEqual([0, 30, 45])
    expect(result.rows.at(-1)?.balance).toBeCloseTo(1000 * 1.01 ** 45, 6)
  })

  it("turns 40 losing days in 100 into about $2,037 after a year", () => {
    const result = growForwards({
      start: 1000,
      dailyRate: 0.01,
      days: 365,
      monthlyAdd: 0,
      losingDays: { per100: 40, lossPercent: 1 },
    })
    // 146 of the 365 days lose 1% and 219 gain 1%.
    expect(result.end).toBeCloseTo(1000 * 1.01 ** 219 * 0.99 ** 146, 6)
    expect(Math.round(result.end)).toBe(2038)
  })

  it("drops to nothing when a losing day takes 100%", () => {
    const result = growForwards({
      start: 1000,
      dailyRate: 0.01,
      days: 30,
      monthlyAdd: 0,
      losingDays: { per100: 10, lossPercent: 100 },
    })
    expect(result.end).toBe(0)
  })
})

describe("spreading the losing days", () => {
  it("puts exactly 40 losing days in every 100", () => {
    const days = Array.from({ length: 100 }, (_, index) =>
      isLosingDay(index, 40)
    )
    expect(days.filter(Boolean)).toHaveLength(40)
    expect(days.slice(0, 5)).toEqual([false, false, true, false, true])
    expect(losingDayCount(365, 40)).toBe(146)
  })

  it("has no losing day at 0 and every day losing at 100", () => {
    expect(isLosingDay(7, 0)).toBe(false)
    expect(isLosingDay(7, 100)).toBe(true)
  })
})

describe("working backwards", () => {
  it("needs 1.27% a day to turn $1,000 into $100,000 in 365 days", () => {
    const needed = neededGain({ start: 1000, goal: 100_000, days: 365 })
    expect(needed).not.toBeNull()
    expect((needed!.perGainingDay * 100).toFixed(2)).toBe("1.27")
    expect(needed!.perWeek).toBeCloseTo((1 + needed!.perGainingDay) ** 7 - 1)
  })

  it("asks more of each gaining day once losing days are mixed in", () => {
    const smooth = neededGain({ start: 1000, goal: 100_000, days: 365 })!
    const bumpy = neededGain({
      start: 1000,
      goal: 100_000,
      days: 365,
      losingDays: { per100: 40, lossPercent: 1 },
    })!
    expect(bumpy.perGainingDay).toBeGreaterThan(smooth.perGainingDay)
    // Growing forwards at that gain reaches the goal.
    const check = growForwards({
      start: 1000,
      dailyRate: bumpy.perGainingDay,
      days: 365,
      monthlyAdd: 0,
      losingDays: { per100: 40, lossPercent: 1 },
    })
    expect(check.end).toBeCloseTo(100_000, 4)
  })

  it("refuses a goal no gaining day can reach", () => {
    expect(
      neededGain({
        start: 1000,
        goal: 2000,
        days: 30,
        losingDays: { per100: 100, lossPercent: 1 },
      })
    ).toBeNull()
    expect(
      neededGain({
        start: 1000,
        goal: 2000,
        days: 30,
        losingDays: { per100: 20, lossPercent: 100 },
      })
    ).toBeNull()
  })
})

describe("lengths", () => {
  it("counts a year as 365 days and stops every unit at fifty years", () => {
    expect(lengthInDays(1, "years")).toBe(365)
    expect(lengthInDays(2, "weeks")).toBe(14)
    expect(lengthInDays(6, "months")).toBe(183)
    expect(maxLength("years")).toBe(50)
    expect(maxLength("days")).toBe(18250)
  })
})

describe("chart points", () => {
  it("keeps the chart to a few hundred points, first and last day included", () => {
    const result = growForwards({
      start: 1000,
      dailyRate: 0.001,
      days: 18250,
      monthlyAdd: 0,
    })
    expect(result.points.length).toBeLessThanOrEqual(242)
    expect(result.points[0].day).toBe(0)
    expect(result.points.at(-1)?.day).toBe(18250)
    expect(result.points.at(-1)?.balance).toBe(result.end)
  })
})
