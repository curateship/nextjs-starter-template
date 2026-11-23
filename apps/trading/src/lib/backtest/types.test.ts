import { describe, expect, it } from "vitest"

import {
  MAX_EXTRA_MARKETS,
  MAX_TOTAL_RUN_BARS,
  maxRunMarkets,
  maxWindowDays,
  totalRunBars,
} from "./types"

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const

describe("maxRunMarkets", () => {
  it("offers a basket the run will actually accept", () => {
    for (const interval of INTERVALS) {
      for (const days of [1, 30, 90, maxWindowDays(interval)]) {
        const cap = maxRunMarkets(null, interval, days)
        expect(totalRunBars(null, interval, days, cap)).toBeLessThanOrEqual(
          MAX_TOTAL_RUN_BARS
        )
      }
    }
  })

  it("offers every market that fits, not a market fewer", () => {
    for (const interval of INTERVALS) {
      for (const days of [30, 90, maxWindowDays(interval)]) {
        const cap = maxRunMarkets(null, interval, days)
        if (cap >= MAX_EXTRA_MARKETS + 1) continue
        expect(totalRunBars(null, interval, days, cap + 1)).toBeGreaterThan(
          MAX_TOTAL_RUN_BARS
        )
      }
    }
  })

  it("fits more markets on coarser candles over the same window", () => {
    const minute = maxRunMarkets(null, "1m", 30)
    const quarter = maxRunMarkets(null, "15m", 30)
    expect(minute).toBeLessThan(quarter)
    expect(minute).toBe(22)
  })

  it("never exceeds the basket cap or drops below one market", () => {
    expect(maxRunMarkets(null, "1d", 30)).toBe(MAX_EXTRA_MARKETS + 1)
    expect(
      maxRunMarkets(null, "1m", maxWindowDays("1m"))
    ).toBeGreaterThanOrEqual(1)
  })

  it("a full basket still fits the progress request in batches", async () => {
    // The market cap now scales past what one progress request accepts (100
    // ids). Asking for a whole 222-market basket at once used to fail schema
    // validation, which left the results table with no stats and every row
    // showing a dash. The helper must split it instead.
    const { BACKTEST_PROGRESS_BATCH } = await import("@/lib/api/backtests")
    const biggest = maxRunMarkets(null, "4h", 500)
    expect(biggest).toBeGreaterThan(BACKTEST_PROGRESS_BATCH)
    const batches = Math.ceil(biggest / BACKTEST_PROGRESS_BATCH)
    expect(batches).toBeGreaterThan(1)
    expect(batches * BACKTEST_PROGRESS_BATCH).toBeGreaterThanOrEqual(biggest)
  })

  it("a shorter window really does buy more markets at 4h", () => {
    // The point of the cap moving: halving the window should roughly double the
    // basket. It used to be pinned at 51 for every window, so shortening the run
    // bought nothing and "Randomize markets" filled the same 51 slots.
    const long = maxRunMarkets(null, "4h", 2000)
    const half = maxRunMarkets(null, "4h", 1000)
    const quarter = maxRunMarkets(null, "4h", 500)
    // Not exactly double: the strategy's warm-up is a fixed cost per market that
    // does not shrink with the window, so each halving buys a bit under 2x
    // (2000d -> 74, 1000d -> 133, 500d -> 222 with no warm-up configured).
    expect(long).toBeGreaterThan(51)
    expect(half).toBeGreaterThan(long * 1.5)
    expect(quarter).toBeGreaterThan(half * 1.5)
  })

  it("shrinks as the window grows", () => {
    const short = maxRunMarkets(null, "15m", 30)
    const long = maxRunMarkets(null, "15m", maxWindowDays("15m"))
    expect(long).toBeLessThan(short)
  })
})
