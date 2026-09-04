import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setDbForTests, type CustomShellDb } from "@/server/db"
import { createTestDatabase } from "@/server/test-support"
import { tradeCandles } from "@/server/trade/schema"

/**
 * The first thing a chart paints, on a venue that publishes no candles.
 *
 * Every other venue hands over its own recent slice at once and the store
 * fills the years in behind it. Solana has no venue to ask, so the chart used
 * to wait on a read of every bar ever stored: 2.8 seconds for JUP against
 * Hyperliquid's 0.8. It now reads the same recent slice from the store, and
 * the backfill stitches the rest in behind exactly as it does elsewhere.
 */

const venue = vi.hoisted(() => ({
  candles: vi.fn(),
  source: vi.fn(),
}))

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    label: "Mock",
    markets: {
      // The venue publishes none, which is the whole premise.
      recordsOwnBars: true,
      candles: venue.candles,
    },
  }),
}))

vi.mock("@/server/trade/history-source", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveHistorySource: (key: string) => venue.source(key),
}))

const { loadProtocolCandles } = await import("@/server/trade/candles")

const MARKET = "solana:mainnet:CateMint1111111111111111111111111111111111"
const BORROWED = "binance:mainnet:JUP"
const MINUTE = 60_000

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const test = await createTestDatabase()
  client = test.client
  database = test.db
  setDbForTests(database)
  venue.candles.mockReset()
  venue.candles.mockRejectedValue(new Error("the venue must never be asked"))
  venue.source.mockReset()
  venue.source.mockResolvedValue(null)
})

afterEach(async () => {
  await client.close()
})

/** `count` minute bars ending now, under one key. */
async function seed(key: string, count: number) {
  const newest = Math.floor(Date.now() / MINUTE) * MINUTE
  const rows = Array.from({ length: count }, (_, i) => {
    const openTime = newest - (count - 1 - i) * MINUTE
    return {
      marketKey: key,
      interval: "1m" as const,
      openTime,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 0,
    }
  })
  for (let i = 0; i < rows.length; i += 500) {
    await database.insert(tradeCandles).values(rows.slice(i, i + 500))
  }
}

describe("the first paint on a venue with no candles of its own", () => {
  it("reads a recent slice from the store instead of asking the venue", async () => {
    await seed(MARKET, 1_500)
    const bars = await loadProtocolCandles(MARKET, "1m")

    // A thousand bars is what the venues are asked for; the rest is the
    // backfill's job, so the chart paints on a small read.
    expect(bars.length).toBeGreaterThan(0)
    expect(bars.length).toBeLessThanOrEqual(1_001)
    expect(venue.candles).not.toHaveBeenCalled()
    // The newest bars, not the oldest: this is what somebody is looking at.
    const newest = Math.floor(Date.now() / MINUTE) * MINUTE
    expect(bars[bars.length - 1].openTime).toBeGreaterThanOrEqual(
      newest - 2 * MINUTE
    )
  })

  it("paints the borrowed market's rows when there is a source", async () => {
    // The market's own key holds nothing; the borrowed key holds the bars.
    venue.source.mockResolvedValue(BORROWED)
    await seed(BORROWED, 40)
    const bars = await loadProtocolCandles(MARKET, "1m")
    // Thirty-nine of the forty: the newest bar is the minute still forming,
    // and the store never serves that one because it is not finished.
    expect(bars).toHaveLength(39)
    expect(venue.candles).not.toHaveBeenCalled()
  })

  it("answers with nothing when the store holds nothing, rather than failing", async () => {
    const bars = await loadProtocolCandles(MARKET, "1m")
    expect(bars).toEqual([])
    expect(venue.candles).not.toHaveBeenCalled()
  })
})
