import { describe, expect, it } from "vitest"

import {
  LIGHTER_INTERVALS,
  lighterIntervalMs,
  lighterTickFromDecimals,
  roundLighterPx,
  scaleLighterPrice,
  scaleLighterSize,
  toLighterBar,
  toLighterStatsFigures,
  unscaleLighterNumber,
} from "@/lib/protocols/lighter/translate"

describe("Lighter's whole numbers", () => {
  it("scales a price and a size by the market's own decimals", () => {
    // BTC: one decimal place on price, five on size.
    expect(scaleLighterPrice(78_584.1, 1)).toBe(785_841)
    expect(scaleLighterSize(0.0006, 5)).toBe(60)
    // LAUNCHCOIN: six on price, none on size.
    expect(scaleLighterPrice(0.062636, 6)).toBe(62_636)
    expect(scaleLighterSize(100, 0)).toBe(100)
  })

  it("round-trips a market with awkward decimals exactly", () => {
    // The float trap: 1.1 times 100 is 110.00000000000001 in binary, and
    // flooring that sends a different order than the one asked for.
    for (const [value, decimals] of [
      [1.1, 2],
      [9.0112, 4],
      [0.07, 2],
      [78_584.1, 1],
      [1.005, 3],
    ] as const) {
      const whole = scaleLighterPrice(value, decimals)
      expect(whole, `${value} @ ${decimals}`).not.toBeNull()
      expect(Number.isInteger(whole)).toBe(true)
      expect(unscaleLighterNumber(whole as number, decimals)).toBeCloseTo(
        value,
        decimals
      )
    }
  })

  it("refuses a price too big for Lighter's 32-bit field", () => {
    // Lighter takes the price as an unsigned 32-bit integer. A market in the
    // thousands that also allows six decimals overflows it, and an overflowed
    // price is a real order at a wildly wrong price, not a refused one.
    expect(scaleLighterPrice(5_000, 6)).toBeNull()
    expect(scaleLighterPrice(4_294.967_295, 6)).toBe(4_294_967_295)
    expect(scaleLighterPrice(4_294.967_296, 6)).toBeNull()
  })

  it("refuses what it cannot say instead of sending a zero", () => {
    expect(scaleLighterPrice(-1, 2)).toBeNull()
    expect(scaleLighterPrice(Number.NaN, 2)).toBeNull()
    expect(scaleLighterPrice(1, -1)).toBeNull()
    expect(scaleLighterSize(Number.POSITIVE_INFINITY, 2)).toBeNull()
    expect(unscaleLighterNumber("not a number", 2)).toBeNull()
  })

  it("reads Lighter's own whole numbers back", () => {
    expect(unscaleLighterNumber("785841", 1)).toBeCloseTo(78_584.1, 4)
    expect(unscaleLighterNumber(60, 5)).toBeCloseTo(0.0006, 8)
  })
})

describe("Lighter translation", () => {
  it("maps all six app timeframes onto Lighter's own names", () => {
    expect(Object.keys(LIGHTER_INTERVALS)).toEqual([
      "1m",
      "5m",
      "15m",
      "1h",
      "4h",
      "1d",
    ])
    expect(lighterIntervalMs("4h")).toBe(14_400_000)
  })

  it("turns stated price decimals into the tick the chart snaps to", () => {
    expect(lighterTickFromDecimals(1)).toBe(0.1)
    expect(lighterTickFromDecimals(6)).toBe(0.000001)
    expect(lighterTickFromDecimals(0)).toBe(1)
    expect(lighterTickFromDecimals(-1)).toBeNull()
    expect(lighterTickFromDecimals("nonsense")).toBeNull()
  })

  it("snaps a dragged price to the market's stated decimals", () => {
    // BTC states one decimal place, so $78,584.13 is between legal steps.
    expect(roundLighterPx(78_584.13, 5, 0.1)).toBe(78_584.1)
    expect(roundLighterPx(78_584.13, 5, null)).toBe(78_584.13)
  })

  it("reads one candle row and keeps the coin volume", () => {
    // A saved mainnet BTC row from 26 Aug 2026.
    expect(
      toLighterBar({
        t: 1_787_752_800_000,
        o: 78_439.3,
        h: 78_601.4,
        l: 78_264.3,
        c: 78_483.3,
        v: 203.586_330_000_027_97,
        V: 15_978_075.223_912_079,
        i: 28_559_687_281,
      })
    ).toEqual({
      openTime: 1_787_752_800_000,
      open: 78_439.3,
      high: 78_601.4,
      low: 78_264.3,
      close: 78_483.3,
      volume: 203.586_330_000_027_97,
    })
    expect(toLighterBar({ t: 1, o: "bad" })).toBeNull()
    expect(toLighterBar([1, 2, 3, 4, 5, 6])).toBeNull()
  })

  it("translates one pushed market_stats row into live figures", () => {
    // A saved mainnet BTC push from 26 Aug 2026. The socket's open interest
    // is already dollars, its change is a percent, and its funding is the
    // percent charged per hour.
    const row = toLighterStatsFigures({
      symbol: "BTC",
      market_id: 1,
      index_price: "78487.4",
      mark_price: "78473.8",
      last_trade_price: "78483.3",
      open_interest: "151681070.258090",
      current_funding_rate: "0.0012",
      daily_quote_token_volume: 713_579_880.639_136,
      daily_price_change: -1.299_856_116_555_651_7,
    })
    expect(row?.symbol).toBe("BTC")
    expect(row?.marketId).toBe(1)
    expect(row?.figures.price).toBe(78_473.8)
    expect(row?.figures.change24h).toBeCloseTo(-0.012_998_561, 8)
    expect(row?.figures.volume24hUsd).toBeCloseTo(713_579_880.64, 2)
    expect(row?.figures.fundingHourly).toBeCloseTo(0.000_012, 9)
    expect(row?.figures.openInterestUsd).toBeCloseTo(151_681_070.26, 2)
  })

  it("refuses a stats row with no symbol or no usable mark", () => {
    expect(toLighterStatsFigures({ market_id: 1, mark_price: "1" })).toBeNull()
    expect(
      toLighterStatsFigures({ symbol: "BTC", market_id: 1, mark_price: "0" })
    ).toBeNull()
  })
})
