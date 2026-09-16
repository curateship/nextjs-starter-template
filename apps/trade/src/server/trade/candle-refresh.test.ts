import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase } from "@/server/test-support"
import {
  FAILED_PAIR_REST_MS,
  refreshCandleStore,
  REQUESTS_PER_PASS,
} from "@/server/trade/candle-refresh"
import { ensureCandleCoverage } from "@/server/trade/candle-store"

/**
 * The refresh job tops up what is in coverage and nothing else, a bounded
 * number of requests a pass. Proved against a scripted source that answers
 * any window with bars, so the count of requests is the count of pages.
 */

const HOUR = 3_600_000
const FOUR_HOURS = 4 * HOUR

const asks: Array<{ marketId: string; from: number; to: number }> = []
/** Markets the source refuses every time, like SMH on 15 Sep 2026. */
const refused = new Set<string>()
/** While set, every ask waits for it, so a pass can be caught mid-flight. */
let holdAsks: Promise<void> | null = null

vi.mock("@/server/protocols/registry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProtocol: () => ({
    markets: {
      intervalMs: (interval: string) => (interval === "1h" ? HOUR : FOUR_HOURS),
      history: async (
        _network: string,
        marketId: string,
        interval: string,
        from: number,
        to: number
      ) => {
        asks.push({ marketId, from, to })
        if (holdAsks) await holdAsks
        if (refused.has(marketId)) {
          throw new Error("EXCHANGE_BUSY:Dukascopy — refused for now")
        }
        const step = interval === "1h" ? HOUR : FOUR_HOURS
        const bars: CandleBar[] = []
        for (let at = Math.ceil(from / step) * step; at < to; at += step) {
          bars.push({ openTime: at, open: 1, high: 1, low: 1, close: 1, volume: 1 })
        }
        return bars
      },
    },
  }),
}))

const BTC = "binance:mainnet:BTC"
const TSLA = "dukascopy:mainnet:tslaususd"
const LIGHTER_BTC = "lighter:mainnet:BTC"
const START = 1_700_000_000_000 - (1_700_000_000_000 % FOUR_HOURS)

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  asks.length = 0
  refused.clear()
  holdAsks = null
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(async () => {
  vi.restoreAllMocks()
  await client.close()
})

describe("a source that keeps refusing one pair", () => {
  it("rests the refused pair, still tops up the rest, and asks again later", async () => {
    // A market name no other test uses: resting pairs are remembered for the
    // life of the module.
    const REFUSED = "dukascopy:mainnet:smhususd"
    await ensureCandleCoverage(REFUSED, "4h", START, START + 90 * FOUR_HOURS, db)
    await ensureCandleCoverage(BTC, "4h", START, START + 100 * FOUR_HOURS, db)
    asks.length = 0
    refused.add("smhususd")

    const now = START + 102 * FOUR_HOURS + 1_000
    // SMH is furthest behind, so it is asked first; its refusal no longer
    // ends the pass before BTC.
    expect(await refreshCandleStore(db, now)).toMatchObject({ toppedUp: 1 })
    expect(asks.map((ask) => ask.marketId)).toEqual(["smhususd", "BTC"])

    asks.length = 0
    await refreshCandleStore(db, now + 60_000)
    expect(asks.map((ask) => ask.marketId)).not.toContain("smhususd")

    asks.length = 0
    refused.clear()
    await refreshCandleStore(db, now + FAILED_PAIR_REST_MS + 1)
    expect(asks.map((ask) => ask.marketId)).toContain("smhususd")
  })
})

describe("a source that never answers", () => {
  it("ends the pass, rests the pair it was waiting on, and carries on next pass", async () => {
    // Names no other test uses: resting pairs are remembered for the life of
    // the module.
    const STUCK = "dukascopy:mainnet:gascmdusd"
    const NEXT = "dukascopy:mainnet:fbususd"
    await ensureCandleCoverage(STUCK, "4h", START, START + 90 * FOUR_HOURS, db)
    await ensureCandleCoverage(NEXT, "4h", START, START + 95 * FOUR_HOURS, db)
    asks.length = 0
    // Held for longer than the pass allows, which is what a jammed Dukascopy
    // looks like from here.
    let release = () => {}
    holdAsks = new Promise<void>((done) => (release = done))

    const now = START + 102 * FOUR_HOURS + 1_000
    // A 50ms budget stands in for the real thirty seconds.
    const outcome = await refreshCandleStore(db, now, 50)

    expect(outcome.toppedUp).toBe(0)
    // The pass ended on the stuck pair rather than waiting for it and then
    // asking for the next one too.
    expect(asks.map((ask) => ask.marketId)).toEqual(["gascmdusd"])

    asks.length = 0
    holdAsks = null
    // The abandoned ask is let go so it does not sit in the shared gate for
    // the rest of the file.
    release()

    await refreshCandleStore(db, now + 60_000)
    expect(asks.map((ask) => ask.marketId)).toEqual(["fbususd"])
  })
})

describe("overlapping passes", () => {
  it("does nothing while the previous pass is still running", async () => {
    await ensureCandleCoverage(BTC, "4h", START, START + 100 * FOUR_HOURS, db)
    asks.length = 0
    let release = () => {}
    holdAsks = new Promise<void>((done) => (release = done))

    const now = START + 102 * FOUR_HOURS + 1_000
    const first = refreshCandleStore(db, now)
    await vi.waitFor(() => expect(asks).toHaveLength(1))

    await expect(refreshCandleStore(db, now)).resolves.toEqual({
      toppedUp: 0,
      requests: 0,
    })
    expect(asks).toHaveLength(1)

    holdAsks = null
    release()
    await expect(first).resolves.toEqual({ toppedUp: 1, requests: 1 })
  })
})

describe("what gets topped up", () => {
  it("moves a stored pair's coverage forward to the last closed bar", async () => {
    await ensureCandleCoverage(BTC, "4h", START, START + 100 * FOUR_HOURS, db)
    asks.length = 0

    // Two bars have closed since, and a third is forming.
    const now = START + 102 * FOUR_HOURS + 1_000
    const outcome = await refreshCandleStore(db, now)

    expect(outcome).toEqual({ toppedUp: 1, requests: 1 })
    expect(asks).toEqual([
      { marketId: "BTC", from: START + 100 * FOUR_HOURS, to: START + 102 * FOUR_HOURS },
    ])
  })

  it("makes no request for a pair that is already current", async () => {
    await ensureCandleCoverage(BTC, "4h", START, START + 100 * FOUR_HOURS, db)
    asks.length = 0

    const outcome = await refreshCandleStore(db, START + 100 * FOUR_HOURS + 5)

    expect(outcome).toEqual({ toppedUp: 0, requests: 0 })
    expect(asks).toEqual([])
  })

  it("never downloads a market with no coverage row", async () => {
    const outcome = await refreshCandleStore(db, START + 500 * FOUR_HOURS)
    expect(outcome).toEqual({ toppedUp: 0, requests: 0 })
    expect(asks).toEqual([])
  })

  it("leaves rows stored under a venue's own key alone", async () => {
    await ensureCandleCoverage(LIGHTER_BTC, "4h", START, START + 10 * FOUR_HOURS, db)
    asks.length = 0

    const outcome = await refreshCandleStore(db, START + 50 * FOUR_HOURS)

    expect(outcome).toEqual({ toppedUp: 0, requests: 0 })
    expect(asks).toEqual([])
  })
})

describe("the cap", () => {
  it("never spends more than its share of requests in one pass", async () => {
    // Twenty-five hourly pairs each a page behind. Only twenty fit.
    for (let index = 0; index < 25; index += 1) {
      await ensureCandleCoverage(
        `dukascopy:mainnet:s${index}ususd`,
        "1h",
        START,
        START + 10 * HOUR,
        db
      )
    }
    asks.length = 0

    const outcome = await refreshCandleStore(db, START + 20 * HOUR)

    expect(outcome.requests).toBe(REQUESTS_PER_PASS)
    expect(outcome.toppedUp).toBe(REQUESTS_PER_PASS)
    expect(asks).toHaveLength(REQUESTS_PER_PASS)
  })

  it("leaves a pair alone once it is further behind than the store holds", async () => {
    await ensureCandleCoverage(TSLA, "1h", START, START + 10 * HOUR, db)
    asks.length = 0

    // Three years later. Nobody has looked at this pair's minutes or hours
    // since; the chart fills it if somebody does.
    const outcome = await refreshCandleStore(db, START + 26_000 * HOUR)

    expect(outcome).toEqual({ toppedUp: 0, requests: 0 })
    expect(asks).toEqual([])
  })

  it("tops up the most-behind pair first", async () => {
    await ensureCandleCoverage(BTC, "4h", START, START + 100 * FOUR_HOURS, db)
    await ensureCandleCoverage(TSLA, "4h", START, START + 90 * FOUR_HOURS, db)
    asks.length = 0

    await refreshCandleStore(db, START + 102 * FOUR_HOURS)

    expect(asks.map((ask) => ask.marketId)).toEqual(["tslaususd", "BTC"])
  })
})
