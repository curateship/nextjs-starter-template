import { describe, expect, it } from "vitest"

import { readBinanceFrame } from "@/lib/protocols/binance/stream"

describe("Binance browser feed", () => {
  it("draws a mark only once the day's figures are known", () => {
    const daily = new Map()
    const early = readBinanceFrame(daily, [{ e: "markPriceUpdate", s: "BTCUSDT", p: "84000" }])
    expect(early.figures.size).toBe(0)
    readBinanceFrame(daily, [{ e: "24hrTicker", s: "BTCUSDT", P: "2.5", q: "1000000" }])
    const late = readBinanceFrame(daily, [{ e: "markPriceUpdate", s: "BTCUSDT", p: "84000" }])
    expect(late.figures.get("BTC")).toEqual({
      price: 84_000,
      change24h: 0.025,
      volume24hUsd: 1_000_000,
      fundingHourly: null,
      openInterestUsd: null,
    })
  })

  it("hands a candle on under the coin name", () => {
    // The shape measured on /market/ws on 24 Sep 2026.
    const frame = readBinanceFrame(new Map(), {
      e: "kline",
      s: "1000PEPEUSDT",
      k: { t: 1790274060000, i: "1m", o: "0.0101", c: "0.0102", h: "0.0103", l: "0.0100", v: "44.680", x: false },
    })
    expect(frame.candles).toEqual([
      {
        marketId: "kPEPE",
        interval: "1m",
        bar: { openTime: 1790274060000, open: 0.0101, high: 0.0103, low: 0.01, close: 0.0102, volume: 44.68 },
      },
    ])
    expect(frame.sawData).toBe(true)
  })
})
