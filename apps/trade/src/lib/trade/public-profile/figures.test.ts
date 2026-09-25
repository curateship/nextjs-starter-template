import { describe, expect, it } from "vitest"

import { bucketDays } from "@/lib/trade/pnl/day-buckets"
import { dayKeyOf, dayStart } from "@/lib/trade/pnl/periods"
import {
  publicFigures,
  windowStart,
  worstStretch,
} from "@/lib/trade/public-profile/figures"

// Noon in Toronto on 24 Sep 2026.
const NOW = dayStart("2026-09-24") + 12 * 3_600_000
const DAY = 86_400_000

describe("windowStart", () => {
  it("counts today as the first of the window's days, on the Toronto clock", () => {
    expect(dayKeyOf(windowStart(1, NOW))).toBe("2026-09-24")
    expect(dayKeyOf(windowStart(7, NOW))).toBe("2026-09-18")
    expect(dayKeyOf(windowStart(30, NOW))).toBe("2026-08-26")
    expect(windowStart(30, NOW)).toBe(dayStart("2026-08-26"))
  })
})

describe("publicFigures", () => {
  const fills = [
    { at: NOW - 40 * DAY, money: 500, fee: 5 },
    { at: NOW - 20 * DAY, money: -300, fee: 3 },
    { at: NOW - 2 * DAY, money: 120, fee: 1 },
    { at: NOW - 2 * DAY + 1, money: null, fee: 2 },
  ]
  const trades = [
    { closedAt: NOW - 40 * DAY, pnl: 500 },
    { closedAt: NOW - 20 * DAY, pnl: -300 },
    { closedAt: NOW - 2 * DAY, pnl: 120 },
    { closedAt: NOW - DAY, pnl: 0 },
  ]
  const figures = publicFigures(fills, trades, NOW)

  it("adds each window's priced money and fees, and counts the unpriced apart", () => {
    expect(figures.made["7d"]).toEqual({ money: 120, fees: 3, unpriced: 1 })
    expect(figures.made["30d"]).toEqual({ money: -180, fees: 6, unpriced: 1 })
    expect(figures.made.all).toEqual({ money: 320, fees: 11, unpriced: 1 })
  })

  it("equals the P&L page's month grid summed over the same 30 days", () => {
    const days = bucketDays(fills, trades, windowStart(30, NOW))
    const tiles = [...days.values()].reduce((sum, day) => sum + day.money, 0)
    expect(figures.made["30d"].money).toBe(tiles)
  })

  it("counts trades that made money out of 100; breaking even is not making money", () => {
    expect(figures.closedTrades).toBe(4)
    expect(figures.wonTrades).toBe(2)
    expect(figures.wonPer100).toBe(50)
  })

  it("counts Toronto days with a fill", () => {
    expect(figures.daysTraded).toBe(3)
  })

  it("has no trades-that-made-money figure before the first closed trade", () => {
    expect(publicFigures([], [], NOW).wonPer100).toBeNull()
  })
})

describe("worstStretch", () => {
  const at = (index: number) => NOW - (10 - index) * DAY

  it("finds the biggest fall from a high point and says it recovered", () => {
    const fills = [100, 200, -700, 100, 900].map((money, index) => ({
      at: at(index),
      money,
      fee: 0,
    }))
    // Running total 100, 300, -400, -300, 600: fell from 300 to -400.
    expect(worstStretch(fills)).toEqual({
      from: 300,
      to: -400,
      recovered: true,
    })
  })

  it("says so when the running total never got back to the high point", () => {
    const fills = [500, -200, -100, 50].map((money, index) => ({
      at: at(index),
      money,
      fee: 0,
    }))
    expect(worstStretch(fills)).toEqual({
      from: 500,
      to: 200,
      recovered: false,
    })
  })

  it("keeps the older, bigger fall over a later smaller one", () => {
    const fills = [1000, -600, 700, -100].map((money, index) => ({
      at: at(index),
      money,
      fee: 0,
    }))
    expect(worstStretch(fills)).toEqual({
      from: 1000,
      to: 400,
      recovered: true,
    })
  })

  it("is null when the running total never fell", () => {
    expect(worstStretch([{ at: at(0), money: 10, fee: 0 }])).toBeNull()
  })

  it("leaves unpriced fills out", () => {
    expect(
      worstStretch([
        { at: at(0), money: 100, fee: 0 },
        { at: at(1), money: null, fee: 0 },
      ])
    ).toBeNull()
  })
})
