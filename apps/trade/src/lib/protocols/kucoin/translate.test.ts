import { describe, expect, it } from "vitest"

import {
  coinsOf,
  kucoinIntervalMs,
  lotsOf,
  sizeStepOf,
  toKucoinBar,
  toKucoinFigures,
  toKucoinPushedBar,
} from "@/lib/protocols/kucoin/translate"

/**
 * KuCoin's lot maths, which is the thing this exchange does differently from
 * every other one here. The app asks for coins; KuCoin trades whole contracts
 * worth `multiplier` coins each — a thousandth of a Bitcoin, but ten whole
 * XRP and a hundred DOGE. Read that wrong in either direction and an order is
 * out by a factor of a hundred.
 */

/** Real rules, taken from the live exchange on 19 Aug 2026. */
const BTC = { multiplier: 0.001, lotSize: 1 }
const XRP = { multiplier: 10, lotSize: 1 }
const DOGE = { multiplier: 100, lotSize: 1 }

describe("coins to contracts", () => {
  it("floors to whole contracts", () => {
    // A tenth of a Bitcoin is a hundred contracts of a thousandth each.
    expect(lotsOf(0.1, BTC)).toBe(100)
    // Two hundred and fifty XRP is twenty-five contracts, and the leftover
    // five coins are dropped rather than rounded up into money nobody offered.
    expect(lotsOf(255, XRP)).toBe(25)
  })

  it("survives float dust rather than losing a whole contract to it", () => {
    // 0.3 / 0.001 is 299.99999999999994 in floating point, and flooring that
    // without the guard would place 299 contracts instead of 300.
    expect(lotsOf(0.3, BTC)).toBe(300)
    expect(lotsOf(0.07, BTC)).toBe(70)
  })

  it("answers zero when the order is smaller than one contract", () => {
    // Fifty DOGE on a market that trades a hundred at a time is not a small
    // order — it is no order, and the caller must refuse it out loud.
    expect(lotsOf(50, DOGE)).toBe(0)
    expect(lotsOf(0.0005, BTC)).toBe(0)
    expect(lotsOf(0, BTC)).toBe(0)
  })

  it("comes back the other way as coins", () => {
    expect(coinsOf(100, BTC)).toBeCloseTo(0.1, 12)
    expect(coinsOf(25, XRP)).toBe(250)
  })

  it("states the coin-size step a market really has", () => {
    expect(sizeStepOf(BTC)).toBe(0.001)
    expect(sizeStepOf(DOGE)).toBe(100)
  })
})

describe("KuCoin figures", () => {
  it("reads a contract row into the app's units", () => {
    const figures = toKucoinFigures({
      markPrice: 69037.8,
      priceChgPct: 0.0685,
      turnoverOf24h: 950865861,
      openInterest: "28224344",
      fundingFeeRate: -8.3e-5,
      fundingRateGranularity: 28_800_000,
      multiplier: 0.001,
    })
    expect(figures?.price).toBe(69037.8)
    // Already a fraction on KuCoin — never divided again.
    expect(figures?.change24h).toBe(0.0685)
    expect(figures?.volume24hUsd).toBe(950_865_861)
    // The eight-hour rate as the hourly one the app speaks everywhere.
    expect(figures?.fundingHourly).toBeCloseTo(-8.3e-5 / 8, 12)
    // Open interest is a count of CONTRACTS: 28,224,344 × 0.001 BTC × price.
    expect(figures?.openInterestUsd).toBeCloseTo(28_224_344 * 0.001 * 69_037.8, 2)
  })

  it("refuses a row with no readable price rather than inventing zero", () => {
    expect(toKucoinFigures({ markPrice: "" })).toBeNull()
  })
})

describe("KuCoin bars", () => {
  it("reads the exchange's row order, in milliseconds already", () => {
    // [time, open, high, low, close, volume, turnover]
    expect(
      toKucoinBar([1787094000000, 64612.4, 64752.5, 64604.6, 64697.5, 30829, 1])
    ).toEqual({
      openTime: 1787094000000,
      open: 64612.4,
      high: 64752.5,
      low: 64604.6,
      close: 64697.5,
      volume: 30829,
    })
  })

  it("drops a row it cannot read instead of drawing half a bar", () => {
    expect(toKucoinBar([1787094000000, "x"])).toBeNull()
    expect(toKucoinBar("junk")).toBeNull()
  })

  it("reads a PUSHED candle with the socket's own shape, not the REST one", () => {
    // Taken off the live socket on 19 Aug 2026. The time is SECONDS as a
    // string, and the order is open, CLOSE, HIGH, LOW — not the REST order.
    // Read the REST way it produced a bar dated 1970 whose low sat above its
    // high, and the chart drew it as a spike from nowhere to today's price.
    const pushed = [
      "1787184780",
      "2256.87",
      "2256.05",
      "2256.87",
      "2256.05",
      "5145.6384",
      "228",
    ]
    expect(toKucoinPushedBar(pushed)).toEqual({
      openTime: 1_787_184_780_000,
      open: 2256.87,
      high: 2256.87,
      low: 2256.05,
      close: 2256.05,
      volume: 5145.6384,
    })

    // The bar it must never be again: 1970, and low above high.
    const wrong = toKucoinBar(pushed)
    expect(wrong?.openTime).not.toBe(1_787_184_780_000)
    expect((wrong?.low ?? 0) > (wrong?.high ?? 0)).toBe(true)
  })

  it("keeps a pushed bar's high above its low on a real move", () => {
    // A minute that ran up: open 100, close 110, high 112, low 99.
    expect(toKucoinPushedBar(["1787184780", "100", "110", "112", "99", "5"])).toEqual(
      {
        openTime: 1_787_184_780_000,
        open: 100,
        high: 112,
        low: 99,
        close: 110,
        volume: 5,
      }
    )
  })
})

describe("KuCoin timeframes", () => {
  it("maps every chart timeframe to a real granularity", () => {
    expect(kucoinIntervalMs("1m")).toBe(60_000)
    expect(kucoinIntervalMs("4h")).toBe(4 * 3_600_000)
    expect(kucoinIntervalMs("1d")).toBe(24 * 3_600_000)
  })
})
