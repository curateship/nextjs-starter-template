import { describe, expect, it } from "vitest"

import {
  phemexFundingSymbol,
  phemexIntervalMs,
  roundPhemexPx,
  toPhemexBar,
  toPhemexFigures,
} from "@/lib/protocols/phemex/translate"

describe("Phemex price rounding", () => {
  it("snaps to the market's own tick, without float dust", () => {
    // 8583.3 / 0.5 lands between ticks; the naive multiply answers
    // 8583.500000000001 and the exchange refuses that string.
    expect(roundPhemexPx(8583.3, null, 0.5)).toBe(8583.5)
    expect(roundPhemexPx(0.123456, null, 0.0001)).toBe(0.1235)
    expect(roundPhemexPx(30000.4, null, 1)).toBe(30000)
  })

  it("leaves a price alone when no tick was carried", () => {
    // An old plan row from before ticks existed: the exchange refuses a bad
    // price out loud, which beats guessing a tick here.
    expect(roundPhemexPx(123.456, 3, null)).toBe(123.456)
  })
})

describe("Phemex figures", () => {
  it("converts the 8-hour funding rate to the app's hourly one", () => {
    const figures = toPhemexFigures({
      markPriceRp: "100",
      openRp: "80",
      turnoverRv: "1000000",
      fundingRateRr: "0.0008",
      openInterestRv: "500000",
    })
    expect(figures).toEqual({
      price: 100,
      change24h: 0.25,
      volume24hUsd: 1_000_000,
      fundingHourly: 0.0001,
      openInterestUsd: 500_000,
    })
  })

  it("refuses a row with no readable price rather than inventing zero", () => {
    expect(toPhemexFigures({ markPriceRp: "" })).toBeNull()
  })
})

describe("Phemex bars", () => {
  it("reads the exchange's row order and converts seconds to ms", () => {
    // [timestamp, interval, lastClose, open, high, low, close, volume, turnover]
    expect(
      toPhemexBar([1_700_000_000, 60, "99", "100", "105", "98", "104", "12", "1200"])
    ).toEqual({
      openTime: 1_700_000_000_000,
      open: 100,
      high: 105,
      low: 98,
      close: 104,
      volume: 12,
    })
  })

  it("drops a row it cannot read instead of drawing half a bar", () => {
    expect(toPhemexBar([1_700_000_000, 60, "x", "not-a-price"])).toBeNull()
    expect(toPhemexBar("junk")).toBeNull()
  })
})

describe("Phemex plumbing facts", () => {
  it("maps every chart timeframe to a real resolution", () => {
    expect(phemexIntervalMs("1m")).toBe(60_000)
    expect(phemexIntervalMs("4h")).toBe(4 * 3_600_000)
    expect(phemexIntervalMs("1d")).toBe(24 * 3_600_000)
  })

  it("files funding history under the exchange's dot-symbol", () => {
    expect(phemexFundingSymbol("BTCUSDT")).toBe(".BTCUSDTFR8H")
  })
})
