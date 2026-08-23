import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase } from "@/server/test-support"
import {
  ensureCandleCoverage,
  listCandleGaps,
  loadStoredCandles,
} from "@/server/trade/candle-store"

/**
 * The candle store's whole job is to fetch each stretch of history once and be
 * honest about what the exchange did not have. Both halves are checked here
 * against a scripted exchange: the second ask must reach it not at all, and a
 * coin younger than the window must report the shortfall rather than quietly
 * testing a shorter period.
 */

const HOUR = 3_600_000
const FOUR_HOURS = 4 * HOUR

/** Every range the fake protocol was asked for, in order. */
const asks: Array<{
  protocol: string
  marketId: string
  interval: string
  from: number
  to: number
}> = []

/** The bars the fake exchange actually holds, by open time. */
let available: CandleBar[] = []
let failFromOnce: number | null = null

// Only `getProtocol` is replaced. The rest of the module comes through as
// itself, because `ordersOf` and its siblings live here too — a mock that
// listed just this one left them undefined, and every live test died on a
// call to nothing.
vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: (protocol: string) => ({
    markets: {
      historyBatchBars: protocol === "aster" ? 9_000 : undefined,
      intervalMs: (interval: string) =>
        interval === "1h" ? HOUR : FOUR_HOURS,
      history: async (
        _network: string,
        marketId: string,
        interval: string,
        from: number,
        to: number
      ) => {
        asks.push({ protocol, marketId, interval, from, to })
        if (failFromOnce === from) {
          failFromOnce = null
          throw new Error("the exchange said no")
        }
        return available.filter(
          (bar) => bar.openTime >= from && bar.openTime < to
        )
      },
    },
  }),
}))

function bars(
  fromTime: number,
  count: number,
  step: number = FOUR_HOURS
): CandleBar[] {
  return Array.from({ length: count }, (_, index) => ({
    openTime: fromTime + index * step,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1,
  }))
}

const KEY = "hyperliquid:mainnet:BTC"
const START = 1_700_000_000_000 - (1_700_000_000_000 % FOUR_HOURS)

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  asks.length = 0
  failFromOnce = null
  available = bars(START, 100)
})

afterEach(async () => {
  await client.close()
})

describe("asking for a window twice", () => {
  it("fetches the second time not at all", async () => {
    const to = START + 100 * FOUR_HOURS
    const first = await ensureCandleCoverage(KEY, "4h", START, to, db)
    expect(first.barCount).toBe(100)
    expect(asks).toHaveLength(1)

    const second = await ensureCandleCoverage(KEY, "4h", START, to, db)
    expect(second.barCount).toBe(100)
    // The point of the whole store: nothing new was asked of the exchange.
    expect(asks).toHaveLength(1)
  })

  it("stores every bar once, however often it is asked for", async () => {
    const to = START + 100 * FOUR_HOURS
    await ensureCandleCoverage(KEY, "4h", START, to, db)
    await ensureCandleCoverage(KEY, "4h", START, to, db)

    const stored = await loadStoredCandles(KEY, "4h", START, to, db)
    expect(stored).toHaveLength(100)
    expect(new Set(stored.map((bar) => bar.openTime)).size).toBe(100)
  })
})

describe("widening a window", () => {
  it("fetches only the ends sticking out", async () => {
    available = bars(START - 50 * FOUR_HOURS, 200)

    const middleFrom = START
    const middleTo = START + 50 * FOUR_HOURS
    await ensureCandleCoverage(KEY, "4h", middleFrom, middleTo, db)
    asks.length = 0

    await ensureCandleCoverage(
      KEY,
      "4h",
      middleFrom - 20 * FOUR_HOURS,
      middleTo + 20 * FOUR_HOURS,
      db
    )

    // Two ends, and neither of them touches the middle that was already there.
    expect(asks.map(({ from, to }) => ({ from, to }))).toEqual([
      { from: middleFrom - 20 * FOUR_HOURS, to: middleFrom },
      { from: middleTo, to: middleTo + 20 * FOUR_HOURS },
    ])
  })

  it("never forgets the wider window it already had", async () => {
    const wideTo = START + 100 * FOUR_HOURS
    await ensureCandleCoverage(KEY, "4h", START, wideTo, db)
    asks.length = 0

    // A narrower ask afterwards must not shrink what is known, or the next
    // wide ask would fetch the whole thing again.
    await ensureCandleCoverage(KEY, "4h", START + 10 * FOUR_HOURS, wideTo, db)
    await ensureCandleCoverage(KEY, "4h", START, wideTo, db)

    expect(asks).toEqual([])
  })

  it("does not claim an unfetched middle between separate windows", async () => {
    const firstTo = START + 100 * FOUR_HOURS
    const lastFrom = START + 3_000 * FOUR_HOURS
    const lastTo = lastFrom + 100 * FOUR_HOURS
    available = [
      ...bars(START, 100),
      ...bars(START + 1_500 * FOUR_HOURS, 100),
      ...bars(lastFrom, 100),
    ]

    await ensureCandleCoverage(KEY, "4h", START, firstTo, db)
    await ensureCandleCoverage(KEY, "4h", lastFrom, lastTo, db)
    asks.length = 0

    const middleFrom = START + 1_500 * FOUR_HOURS
    const middleTo = middleFrom + 100 * FOUR_HOURS
    const report = await ensureCandleCoverage(
      KEY,
      "4h",
      middleFrom,
      middleTo,
      db
    )

    expect(asks.map(({ from, to }) => ({ from, to }))).toEqual([
      { from: middleFrom, to: middleTo },
    ])
    expect(report.barCount).toBe(100)
  })
})

describe("a coin the exchange does not go back far enough for", () => {
  it("reports what it really has and records the shortfall", async () => {
    // Listed 20 bars in: nothing before that exists anywhere.
    const listedAt = START + 20 * FOUR_HOURS
    available = bars(listedAt, 80)

    const to = START + 100 * FOUR_HOURS
    const report = await ensureCandleCoverage(KEY, "4h", START, to, db)

    expect(report.barCount).toBe(80)
    expect(report.firstBar).toBe(listedAt)
    expect(report.gaps).toEqual([
      { from: START, to: listedAt, reason: expect.stringContaining("no price") },
    ])
  })

  it("keeps the shortfall on record for the results page", async () => {
    const listedAt = START + 20 * FOUR_HOURS
    available = bars(listedAt, 80)
    const to = START + 100 * FOUR_HOURS
    await ensureCandleCoverage(KEY, "4h", START, to, db)

    const gaps = await listCandleGaps(KEY, "4h", START, to, db)
    expect(gaps).toEqual([
      { from: START, to: listedAt, reason: expect.any(String) },
    ])
  })

  it("records the same shortfall once, not once per run", async () => {
    const listedAt = START + 20 * FOUR_HOURS
    available = bars(listedAt, 80)
    const to = START + 100 * FOUR_HOURS

    await ensureCandleCoverage(KEY, "4h", START, to, db)
    await ensureCandleCoverage(KEY, "4h", START, to, db)

    expect(await listCandleGaps(KEY, "4h", START, to, db)).toHaveLength(1)
  })

  it("says so plainly when there is no history at all", async () => {
    available = []
    const to = START + 100 * FOUR_HOURS
    const report = await ensureCandleCoverage(KEY, "4h", START, to, db)

    expect(report.barCount).toBe(0)
    expect(report.firstBar).toBeNull()
    expect(report.gaps[0].reason).toContain("no price history at all")
  })
})

describe("a hole in the middle of a window", () => {
  it("is written down rather than closed over", async () => {
    // Ten bars, then five days of nothing, then ten more.
    available = [...bars(START, 10), ...bars(START + 40 * FOUR_HOURS, 10)]
    const to = START + 50 * FOUR_HOURS

    const report = await ensureCandleCoverage(KEY, "4h", START, to, db)

    expect(report.barCount).toBe(20)
    expect(report.gaps).toEqual([
      {
        from: START + 10 * FOUR_HOURS,
        to: START + 40 * FOUR_HOURS,
        reason: expect.any(String),
      },
    ])
  })

  it("records even a single missing bar", async () => {
    available = bars(START, 20).filter(
      (bar) => bar.openTime !== START + 5 * FOUR_HOURS
    )
    const to = START + 20 * FOUR_HOURS

    const report = await ensureCandleCoverage(KEY, "4h", START, to, db)

    expect(report.barCount).toBe(19)
    expect(report.gaps).toEqual([
      {
        from: START + 5 * FOUR_HOURS,
        to: START + 6 * FOUR_HOURS,
        reason: expect.any(String),
      },
    ])
  })
})

describe("a failed fetch", () => {
  it("leaves the window looking un-asked, so it is retried", async () => {
    const to = START + 100 * FOUR_HOURS
    failFromOnce = START

    await expect(
      ensureCandleCoverage(KEY, "4h", START, to, db)
    ).rejects.toThrow("the exchange said no")

    // Remembering the failure as "there is nothing there" would mean never
    // looking again.
    const report = await ensureCandleCoverage(KEY, "4h", START, to, db)
    expect(report.barCount).toBe(100)
  })

  it("resumes at the failed page instead of starting over", async () => {
    available = bars(START, 2_500)
    const secondPage = START + 1_000 * FOUR_HOURS
    const to = START + 2_500 * FOUR_HOURS
    failFromOnce = secondPage

    await expect(
      ensureCandleCoverage(KEY, "4h", START, to, db)
    ).rejects.toThrow("the exchange said no")
    await ensureCandleCoverage(KEY, "4h", START, to, db)

    expect(asks.filter((ask) => ask.from === START)).toHaveLength(1)
    expect(asks.filter((ask) => ask.from === secondPage)).toHaveLength(2)
    expect(await loadStoredCandles(KEY, "4h", START, to, db)).toHaveLength(
      2_500
    )
  })

  it("resumes an earlier extension without skipping its middle", async () => {
    const oldFrom = START + 2_500 * FOUR_HOURS
    const to = oldFrom + 100 * FOUR_HOURS
    available = bars(START, 2_600)
    await ensureCandleCoverage(KEY, "4h", oldFrom, to, db)
    asks.length = 0

    const firstPage = START
    const failedPage = START + 1_000 * FOUR_HOURS
    failFromOnce = failedPage
    await expect(
      ensureCandleCoverage(KEY, "4h", START, to, db)
    ).rejects.toThrow("the exchange said no")
    await ensureCandleCoverage(KEY, "4h", START, to, db)

    expect(asks.filter((ask) => ask.from === firstPage)).toHaveLength(1)
    expect(asks.filter((ask) => ask.from === failedPage)).toHaveLength(2)
    expect(await loadStoredCandles(KEY, "4h", START, to, db)).toHaveLength(
      2_600
    )
  })
})

describe("six months of hourly history", () => {
  it("stores it once in pages and reuses it on the second run", async () => {
    const count = 180 * 24
    available = bars(START, count, HOUR)
    const to = START + count * HOUR

    const first = await ensureCandleCoverage(KEY, "1h", START, to, db)
    expect(first.barCount).toBe(count)
    expect(asks).toHaveLength(5)

    await ensureCandleCoverage(KEY, "1h", START, to, db)
    expect(asks).toHaveLength(5)
  })
})

describe("the selected protocol", () => {
  it("reads Hyperliquid and Binance keys from their own adapters", async () => {
    const to = START + 100 * FOUR_HOURS
    await ensureCandleCoverage(KEY, "4h", START, to, db)
    await ensureCandleCoverage(
      "binance:mainnet:BTC",
      "4h",
      START,
      to,
      db
    )

    expect(asks.map((ask) => ask.protocol)).toEqual([
      "hyperliquid",
      "binance",
    ])
  })

  it("hands Aster enough bars for its adapter to batch six full pages", async () => {
    available = []
    const to = START + 9_000 * FOUR_HOURS

    await ensureCandleCoverage(
      "aster:mainnet:BTCUSDT",
      "4h",
      START,
      to,
      db
    )

    expect(asks).toEqual([
      {
        protocol: "aster",
        marketId: "BTCUSDT",
        interval: "4h",
        from: START,
        to,
      },
    ])
  })
})
