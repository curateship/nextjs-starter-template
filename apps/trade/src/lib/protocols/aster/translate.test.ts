import { describe, expect, it } from "vitest"

import {
  ASTER_INTERVALS,
  asterIntervalMs,
  roundAsterPx,
  toAsterBar,
  toAsterPushedFigures,
  toAsterTickerFigures,
} from "@/lib/protocols/aster/translate"

describe("Aster price rules", () => {
  it("snaps an odd tick without leaving float dust", () => {
    expect(roundAsterPx(97.38, null, 0.25)).toBe(97.5)
    expect(roundAsterPx(0.123456, null, 0.0001)).toBe(0.1235)
  })

  it("leaves the price alone when the market stated no tick", () => {
    expect(roundAsterPx(12.3456, null, null)).toBe(12.3456)
  })
})

describe("Aster candles and pushed figures", () => {
  it("reads the documented kline row", () => {
    expect(
      toAsterBar([
        1_787_370_000_000,
        "100",
        "105",
        "98",
        "104",
        "12.5",
        1_787_370_059_999,
      ])
    ).toEqual({
      openTime: 1_787_370_000_000,
      open: 100,
      high: 105,
      low: 98,
      close: 104,
      volume: 12.5,
    })
  })

  it("drops a half-readable bar", () => {
    expect(toAsterBar([1_787_370_000_000, "bad"])).toBeNull()
  })

  it("joins the mark price to the ticker's daily figures", () => {
    const ticker = toAsterTickerFigures({
      c: "1.75",
      P: "4.25",
      q: "120000",
    })
    expect(toAsterPushedFigures("2.5", ticker)).toEqual({
      price: 2.5,
      change24h: 0.0425,
      volume24hUsd: 120_000,
      fundingHourly: null,
      openInterestUsd: null,
    })
  })

  it("never publishes the ticker's last trade as the price", () => {
    const ticker = toAsterTickerFigures({ c: "1.75", P: "1", q: "20" })
    expect(toAsterPushedFigures("2.5", ticker)?.price).toBe(2.5)
    expect(toAsterPushedFigures(null, ticker)).toBeNull()
    expect(toAsterPushedFigures("2.5", null)).toBeNull()
  })
})

describe("Aster timeframes", () => {
  it("maps every chart timeframe exactly", () => {
    expect(Object.keys(ASTER_INTERVALS)).toEqual([
      "1m",
      "5m",
      "15m",
      "1h",
      "4h",
      "1d",
    ])
    expect(asterIntervalMs("4h")).toBe(14_400_000)
    expect(asterIntervalMs("1d")).toBe(86_400_000)
  })
})
