import { describe, expect, it } from "vitest"

import {
  DAY_MS,
  firstCloseFrom,
  formatDay,
  gapOn,
  lumpSum,
  splitDaysBetween,
  splitDaysFrom,
  weekdayOf,
  weeklyBuys,
  type WhatIfSeries,
} from "./what-if"

/** Mon 5 Jan 2026. */
const MONDAY = Date.UTC(2026, 0, 5) / DAY_MS

function series(
  closes: Array<[day: number, close: number]>,
  extra: Partial<WhatIfSeries> = {}
): WhatIfSeries {
  return {
    market: { kind: "coin", symbol: "SOL", label: "SOL" },
    source: "Binance",
    days: closes.map(([day]) => day),
    closes: closes.map(([, close]) => close),
    gaps: [],
    splitDays: [],
    ...extra,
  }
}

describe("counting days", () => {
  it("knows 5 Jan 2026 was a Monday", () => {
    expect(weekdayOf(MONDAY)).toBe(1)
    expect(weekdayOf(MONDAY + 6)).toBe(0)
  })

  it("writes a day the same way on every clock", () => {
    expect(formatDay(MONDAY)).toBe("5 Jan 2026")
    expect(formatDay(MONDAY + 6, true)).toBe("Sun 11 Jan 2026")
    expect(formatDay(MONDAY + 262)).toBe("24 Sep 2026")
  })

  it("finds the first close on or after a day", () => {
    const prices = series([
      [MONDAY, 1],
      [MONDAY + 3, 2],
    ])
    expect(firstCloseFrom(prices, MONDAY)).toBe(0)
    expect(firstCloseFrom(prices, MONDAY + 1)).toBe(1)
    expect(firstCloseFrom(prices, MONDAY + 4)).toBe(-1)
  })
})

describe("buying once", () => {
  // The task's own example: $1,000 at $190 is 5.26 SOL, worth $789 at $150.
  it("values the buy at the stored closes", () => {
    const prices = series([
      [MONDAY, 190],
      [MONDAY + 1, 115.9],
      [MONDAY + 2, 150],
    ])
    const result = lumpSum(prices, 1000, MONDAY)!
    expect(result.boughtPrice).toBe(190)
    expect(result.units).toBeCloseTo(5.263158, 6)
    expect(result.worth).toBeCloseTo(789.47, 2)
    expect(result.made).toBeCloseTo(-210.53, 2)
    expect(result.lowest.day).toBe(MONDAY + 1)
    expect(result.lowest.worth).toBeCloseTo(610, 0)
    expect(result.lastDay).toBe(MONDAY + 2)
  })

  it("never calls the start the lowest point unless nothing fell below it", () => {
    const prices = series([
      [MONDAY, 100],
      [MONDAY + 1, 120],
    ])
    expect(lumpSum(prices, 1000, MONDAY)!.lowest).toEqual({
      day: MONDAY,
      worth: 1000,
    })
  })

  it("buys at the next close when the day has none, and names the gap", () => {
    const prices = series(
      [
        [MONDAY, 100],
        [MONDAY + 4, 200],
      ],
      {
        gaps: [
          {
            from: (MONDAY + 1) * DAY_MS,
            to: (MONDAY + 4) * DAY_MS,
            reason: "The exchange had no price for this stretch.",
          },
        ],
      }
    )
    const result = lumpSum(prices, 1000, MONDAY + 2)!
    expect(result.askedDay).toBe(MONDAY + 2)
    expect(result.boughtDay).toBe(MONDAY + 4)
    expect(result.boughtPrice).toBe(200)
    expect(gapOn(prices, MONDAY + 2)?.reason).toBe(
      "The exchange had no price for this stretch."
    )
    expect(gapOn(prices, MONDAY + 4)).toBeNull()
  })

  it("has no answer after the last close", () => {
    expect(lumpSum(series([[MONDAY, 100]]), 1000, MONDAY + 1)).toBeNull()
  })

  // Stored prices before a split are already divided by it, so $1,000 of
  // NVDA at the raw $1,200 before its ten-for-one is 8.33 of today's shares.
  it("counts a stock bought before a split in today's shares", () => {
    const prices = series(
      [
        [MONDAY, 120],
        [MONDAY + 1, 121],
        [MONDAY + 2, 130],
      ],
      { splitDays: [MONDAY + 1] }
    )
    const result = lumpSum(prices, 1000, MONDAY)!
    expect(result.units).toBeCloseTo(8.333, 3)
    expect(result.worth).toBeCloseTo(1083.33, 2)
    expect(splitDaysBetween(prices, MONDAY, MONDAY + 2)).toEqual([MONDAY + 1])
    expect(splitDaysBetween(prices, MONDAY + 1, MONDAY + 2)).toEqual([])
  })

  // TSLA's three-for-one on 25 Aug 2022 is on record three times: twice on
  // the 25th at different hours, and a reversing row on the 26th.
  it("reads one split from its repeated records", () => {
    const day = Date.UTC(2022, 7, 25) / DAY_MS
    const records = [
      { at: day * DAY_MS + 4 * 3_600_000 },
      { at: day * DAY_MS + 13 * 3_600_000 },
      { at: (day + 1) * DAY_MS },
      { at: (day + 700) * DAY_MS },
    ]
    expect(splitDaysFrom(records)).toEqual([day, day + 700])
  })
})

describe("buying every week", () => {
  it("adds up what went in, what it is worth and the average price", () => {
    const prices = series([
      [MONDAY, 100],
      [MONDAY + 3, 150],
      [MONDAY + 7, 50],
      [MONDAY + 14, 100],
      [MONDAY + 15, 80],
    ])
    const result = weeklyBuys(prices, 100, 1, MONDAY)!
    // 1 + 2 + 1 = 4 coins for $300.
    expect(result.buys).toBe(3)
    expect(result.putIn).toBe(300)
    expect(result.units).toBeCloseTo(4, 10)
    expect(result.averagePrice).toBeCloseTo(75, 10)
    expect(result.worth).toBeCloseTo(320, 10)
    expect(result.made).toBeCloseTo(20, 10)
    expect(result.skippedWeeks).toBe(0)
  })

  it("starts on the first chosen weekday on or after the start", () => {
    const prices = series([
      [MONDAY, 100],
      [MONDAY + 2, 100],
      [MONDAY + 9, 100],
    ])
    const result = weeklyBuys(prices, 100, 3, MONDAY)!
    expect(result.firstBuyDay).toBe(MONDAY + 2)
    expect(result.buys).toBe(2)
  })

  it("buys a holiday Monday on Tuesday and counts a week with no close", () => {
    const prices = series([
      [MONDAY + 1, 100],
      [MONDAY + 15, 100],
    ])
    const result = weeklyBuys(prices, 100, 1, MONDAY)!
    expect(result.firstBuyDay).toBe(MONDAY + 1)
    expect(result.buys).toBe(2)
    expect(result.skippedWeeks).toBe(1)
  })

  it("has no answer when no week bought anything", () => {
    expect(weeklyBuys(series([[MONDAY, 100]]), 100, 1, MONDAY + 1)).toBeNull()
  })
})
