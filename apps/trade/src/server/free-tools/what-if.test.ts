import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase } from "@/server/test-support"
import { ensureCandleCoverage } from "@/server/trade/candle-store"

/**
 * Which coins the page offers and which ones the nightly fill downloads,
 * proved against a scripted market list and a scripted source that answers
 * any window with one bar a day from `FIRST_BAR` on.
 */

const DAY = 86_400_000
const NOW = Date.UTC(2026, 8, 25, 12)
const TODAY = Math.floor(NOW / DAY) * DAY
const FIRST_BAR = Date.UTC(2024, 0, 1)

const asks: Array<{ marketId: string; from: number; to: number }> = []

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    markets: {
      intervalMs: () => DAY,
      history: async (
        _network: string,
        marketId: string,
        _interval: string,
        from: number,
        to: number
      ) => {
        asks.push({ marketId, from, to })
        const bars: CandleBar[] = []
        for (let at = Math.max(from, FIRST_BAR); at < to; at += DAY) {
          bars.push({ openTime: at, open: 1, high: 1, low: 1, close: 2, volume: 1 })
        }
        return bars
      },
    },
  }),
}))

/** BTC and ETH trade enough, QUIET does not, and xyz:TSLA is not a coin. */
vi.mock("@/server/protocols/market-catalog", () => ({
  loadRawMarketCatalog: async () => ({
    rows: [
      row("BTC", 5e9),
      row("ETH", 2e9),
      row("QUIET", 10_000),
      { ...row("xyz:TSLA", 5e8), subExchange: "xyz" },
    ],
  }),
}))

function row(symbol: string, volume24hUsd: number) {
  return {
    key: `hyperliquid:mainnet:${symbol}`,
    symbol,
    subExchange: null,
    volume24hUsd,
  }
}

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  asks.length = 0
  // The module keeps its list, its closes and tonight's queue in memory.
  vi.resetModules()
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(async () => {
  vi.restoreAllMocks()
  await client.close()
})

async function whatIf() {
  return import("@/server/free-tools/what-if")
}

/** Runs passes until the fill has nothing left to start. */
async function runNight(fill: (db: CustomShellDb, now: number) => Promise<void>) {
  for (let pass = 0; pass < 10; pass += 1) {
    await fill(db, NOW)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe("the nightly fill", () => {
  it("downloads daily closes for busy coins only, back to the ten-year floor", async () => {
    const { fillWhatIfHistory } = await whatIf()
    await runNight(fillWhatIfHistory)
    const asked = [...new Set(asks.map((ask) => ask.marketId))].sort()
    expect(asked).toEqual(["BTC", "ETH"])
    const btc = asks.filter((ask) => ask.marketId === "BTC")
    expect(Math.min(...btc.map((ask) => ask.from))).toBeLessThan(
      NOW - 3649 * DAY
    )
    expect(Math.max(...btc.map((ask) => ask.to))).toBe(TODAY)
  })

  it("leaves a coin alone whose history already reaches back and is current", async () => {
    await ensureCandleCoverage(
      "binance:mainnet:BTC",
      "1d",
      NOW - 3650 * DAY,
      TODAY,
      db
    )
    asks.length = 0
    const { fillWhatIfHistory } = await whatIf()
    await runNight(fillWhatIfHistory)
    expect([...new Set(asks.map((ask) => ask.marketId))]).toEqual(["ETH"])
  })

  it("builds the list once a day, not on every pass", async () => {
    const { fillWhatIfHistory } = await whatIf()
    await runNight(fillWhatIfHistory)
    const after = asks.length
    await runNight(fillWhatIfHistory)
    expect(asks.length).toBe(after)
  })
})

describe("what the page offers", () => {
  it("offers busy coins with a recent close, and serves their stored closes", async () => {
    await ensureCandleCoverage("binance:mainnet:BTC", "1d", FIRST_BAR, TODAY, db)
    // ETH's newest close is a week old, so it is not offered.
    await ensureCandleCoverage(
      "binance:mainnet:ETH",
      "1d",
      FIRST_BAR,
      TODAY - 7 * DAY,
      db
    )
    const { loadWhatIf } = await whatIf()
    const page = await loadWhatIf(null, db, NOW)
    expect(page.list.coins.map((coin) => coin.symbol)).toEqual(["BTC"])
    expect(page.list.stocks).toEqual([])
    expect(page.series?.market.symbol).toBe("BTC")
    expect(page.series?.days[0]).toBe(FIRST_BAR / DAY)
    expect(page.series?.days.at(-1)).toBe(TODAY / DAY - 1)
    expect(new Set(page.series?.closes)).toEqual(new Set([2]))
  })

  it("answers a coin it does not offer with no closes", async () => {
    await ensureCandleCoverage("binance:mainnet:BTC", "1d", FIRST_BAR, TODAY, db)
    const { loadWhatIf } = await whatIf()
    expect((await loadWhatIf({ kind: "coin", symbol: "QUIET" }, db, NOW)).series).toBeNull()
    expect((await loadWhatIf({ kind: "stock", symbol: "BTC" }, db, NOW)).series).toBeNull()
  })
})
