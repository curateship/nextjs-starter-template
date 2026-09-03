import { afterEach, describe, expect, it, vi } from "vitest"

import type {
  DukascopyHistoryRequest,
  DukascopyRow,
} from "@/server/protocols/dukascopy/client"
import {
  fetchDukascopyCandleHistory,
  fetchDukascopyCandles,
} from "@/server/protocols/dukascopy/candles"
import { fetchDukascopyMarkets } from "@/server/protocols/dukascopy/markets"
import week from "./tsla-1h-week.fixture.json"

/**
 * One real week of Tesla hourly bars, recorded from Dukascopy on 2 Sep 2026
 * for 24 to 31 Aug 2026, stands in for the feed. A stock only trades during
 * its market's hours, so the week is 35 bars: seven an hour-bar day, five
 * days, nothing overnight and nothing at the weekend.
 */

const asked: DukascopyHistoryRequest[] = []
let refuse = false

vi.mock("@/server/protocols/dukascopy/client", () => ({
  getHistoricalRates: async (request: DukascopyHistoryRequest) => {
    asked.push(request)
    if (refuse) throw new Error("Request failed with status 429")
    return (week as DukascopyRow[]).filter(
      (row) =>
        row.timestamp >= request.dates.from.getTime() &&
        row.timestamp < request.dates.to.getTime()
    )
  },
}))

const MONDAY = Date.parse("2026-08-24T00:00:00.000Z")
const NEXT_MONDAY = Date.parse("2026-08-31T00:00:00.000Z")

afterEach(() => {
  asked.length = 0
  refuse = false
})

describe("a week of Tesla hourly bars", () => {
  it("returns bars only inside market hours, in order", async () => {
    const bars = await fetchDukascopyCandleHistory(
      "mainnet",
      "tslaususd",
      "1h",
      MONDAY,
      NEXT_MONDAY
    )
    expect(bars).toHaveLength(35)
    for (let index = 1; index < bars.length; index += 1) {
      expect(bars[index].openTime).toBeGreaterThan(bars[index - 1].openTime)
    }
    const hours = new Set(
      bars.map((bar) => new Date(bar.openTime).getUTCHours())
    )
    // 13:00 to 19:00 UTC: New York's 9:30 to 16:00 in summer.
    expect([...hours].sort((a, b) => a - b)).toEqual([13, 14, 15, 16, 17, 18, 19])
    const days = new Set(
      bars.map((bar) => new Date(bar.openTime).getUTCDay())
    )
    expect(days.has(0)).toBe(false)
    expect(days.has(6)).toBe(false)
  })

  it("asks for bid prices in units with flat bars dropped, and fails loudly", async () => {
    await fetchDukascopyCandleHistory("mainnet", "tslaususd", "4h", MONDAY, NEXT_MONDAY)
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({
      instrument: "tslaususd",
      timeframe: "h4",
      priceType: "bid",
      volumeUnits: "units",
      ignoreFlats: true,
      format: "json",
      batchSize: 2,
      pauseBetweenBatchesMs: 2_000,
      failAfterRetryCount: true,
    })
  })

  it("keeps the end exclusive", async () => {
    const lastBar = week[week.length - 1].timestamp
    const bars = await fetchDukascopyCandleHistory(
      "mainnet",
      "tslaususd",
      "1h",
      MONDAY,
      lastBar
    )
    expect(bars).toHaveLength(34)
  })
})

describe("what is never asked for", () => {
  it("pulls the ask forward to the instrument's first day", async () => {
    await fetchDukascopyCandleHistory(
      "mainnet",
      "tslaususd",
      "1h",
      Date.parse("2010-01-01T00:00:00.000Z"),
      NEXT_MONDAY
    )
    // Tesla's minutes on Dukascopy start on 26 Jan 2017. Every month before
    // that is a download of nothing.
    expect(asked[0].dates.from.toISOString()).toBe("2017-01-26T00:00:00.000Z")
  })

  it("answers an unknown instrument with no bars and no request", async () => {
    const bars = await fetchDukascopyCandleHistory(
      "mainnet",
      "kioxiaususd",
      "1h",
      MONDAY,
      NEXT_MONDAY
    )
    expect(bars).toEqual([])
    expect(asked).toEqual([])
  })

  it("refuses the practice network", async () => {
    await expect(
      fetchDukascopyCandleHistory("testnet", "tslaususd", "1h", MONDAY, NEXT_MONDAY)
    ).rejects.toThrow("DUKASCOPY_NETWORK_UNSUPPORTED")
    await expect(fetchDukascopyMarkets("testnet")).rejects.toThrow(
      "DUKASCOPY_NETWORK_UNSUPPORTED"
    )
  })

  it("reads a chart slice from a moment onwards", async () => {
    const bars = await fetchDukascopyCandles(
      "mainnet",
      "tslaususd",
      "1h",
      Date.parse("2026-08-28T00:00:00.000Z")
    )
    expect(bars).toHaveLength(7)
  })
})

describe("being told to slow down", () => {
  it("says the source is busy, the way Binance does, so a run waits rather than fails", async () => {
    refuse = true
    await expect(
      fetchDukascopyCandleHistory("mainnet", "tslaususd", "1h", MONDAY, NEXT_MONDAY)
    ).rejects.toThrow("EXCHANGE_BUSY:Dukascopy")
  })
})

describe("the market list", () => {
  it("lists the mapped instruments with a kind and a printed name", async () => {
    const catalog = await fetchDukascopyMarkets("mainnet")
    const tesla = catalog.rows.find((row) => row.marketId === "tslaususd")
    expect(tesla?.symbol).toBe("TSLA")
    expect(tesla?.category).toBe("stocks")
    expect(tesla?.key).toBe("dukascopy:mainnet:tslaususd")
    const gold = catalog.rows.find((row) => row.marketId === "xauusd")
    expect(gold?.symbol).toBe("XAU")
    expect(gold?.category).toBe("commodities")
    expect(catalog.rows.some((row) => row.category === "other")).toBe(false)
    expect(catalog.rows.length).toBeGreaterThan(600)
  })
})
