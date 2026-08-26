import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchLighterCandleHistory,
  fetchLighterCandles,
} from "@/server/protocols/lighter/candles"
import { lighterPublic } from "@/server/protocols/lighter/client"
import { lighterMarketFacts } from "@/server/protocols/lighter/markets"
import { clearHeldHistory } from "@/server/protocols/full-history"

vi.mock("@/server/protocols/lighter/client", () => ({
  lighterPublic: vi.fn(),
}))
vi.mock("@/server/protocols/lighter/markets", () => ({
  lighterMarketFacts: vi.fn(),
}))

const publicRead = vi.mocked(lighterPublic)
const marketFacts = vi.mocked(lighterMarketFacts)
const MINUTE = 60_000
const FOUR_HOURS = 14_400_000

function row(openTime: number) {
  return { t: openTime, o: 100, h: 101, l: 99, c: 100.5, v: 2, V: 200 }
}

/** Answers bars only for the stretch a market has actually existed. */
function barsFrom(bornAt: number, barMs: number) {
  return async (
    _network: unknown,
    _path: unknown,
    _weight: unknown,
    params?: Record<string, string | number>
  ) => {
    const from = Number(params?.start_timestamp)
    const to = Number(params?.end_timestamp) + 1
    const rows: unknown[] = []
    for (let at = Math.max(from, bornAt); at < to; at += barMs) {
      rows.push(row(at))
    }
    return { code: 200, c: rows }
  }
}

beforeEach(() => {
  publicRead.mockReset()
  marketFacts.mockReset()
  marketFacts.mockResolvedValue({ id: 1, bornAt: null, priceDecimals: 1, sizeDecimals: 5 })
  publicRead.mockImplementation(async (_network, _path, _weight, params) => {
    const from = Number(params?.start_timestamp)
    const to = Number(params?.end_timestamp) + 1
    const rows: unknown[] = []
    for (let at = from; at < to; at += MINUTE) rows.push(row(at))
    return { code: 200, c: rows }
  })
})

afterEach(() => {
  clearHeldHistory()
})

describe("Lighter candle history", () => {
  it("pages across Lighter's 500-bar boundary without a gap or duplicate", async () => {
    const from = 1_700_000_000_000 - (1_700_000_000_000 % MINUTE)
    const bars = await fetchLighterCandleHistory(
      "mainnet",
      "BTC",
      "1m",
      from,
      from + 501 * MINUTE
    )

    expect(marketFacts).toHaveBeenCalledWith("mainnet", "BTC")
    expect(publicRead).toHaveBeenCalledTimes(2)
    expect(publicRead.mock.calls[0]?.[1]).toBe("/api/v1/candles")
    expect(publicRead.mock.calls[0]?.[3]).toMatchObject({
      market_id: 1,
      resolution: "1m",
      count_back: 500,
    })
    expect(bars).toHaveLength(501)
    expect(bars[499].openTime).toBe(from + 499 * MINUTE)
    expect(bars[500].openTime).toBe(from + 500 * MINUTE)
    expect(new Set(bars.map((bar) => bar.openTime)).size).toBe(bars.length)
  })

  it("returns only the shorter history Lighter actually has", async () => {
    const from = 1_700_000_000_000 - (1_700_000_000_000 % MINUTE)
    publicRead.mockResolvedValueOnce({
      code: 200,
      c: Array.from({ length: 20 }, (_, index) =>
        row(from + 80 * MINUTE + index * MINUTE)
      ),
    })

    const bars = await fetchLighterCandleHistory(
      "mainnet",
      "NEW",
      "1m",
      from,
      from + 100 * MINUTE
    )

    expect(bars).toHaveLength(20)
    expect(bars[0].openTime).toBe(from + 80 * MINUTE)
  })

  it("skips the years before a young coin existed", async () => {
    const bornAt = 1_700_000_000_000 - (1_700_000_000_000 % MINUTE)
    marketFacts.mockResolvedValue({ id: 9, bornAt, priceDecimals: 1, sizeDecimals: 5 })
    publicRead.mockImplementation(barsFrom(bornAt, MINUTE))

    // Three 500-bar pages' worth of window, all but the last before the coin.
    const bars = await fetchLighterCandleHistory(
      "mainnet",
      "NEW",
      "1m",
      bornAt - 1_000 * MINUTE,
      bornAt + 400 * MINUTE
    )

    expect(publicRead).toHaveBeenCalledTimes(1)
    expect(publicRead.mock.calls[0]?.[3]).toMatchObject({
      start_timestamp: bornAt,
    })
    expect(bars).toHaveLength(400)
  })

  it("answers nothing when the whole window predates the market", async () => {
    const bornAt = 1_700_000_000_000
    marketFacts.mockResolvedValue({ id: 9, bornAt, priceDecimals: 1, sizeDecimals: 5 })

    const bars = await fetchLighterCandleHistory(
      "mainnet",
      "NEW",
      "1m",
      bornAt - 1_000 * MINUTE,
      bornAt - 10 * MINUTE
    )

    expect(publicRead).not.toHaveBeenCalled()
    expect(bars).toEqual([])
  })
})

describe("the four-hour full history", () => {
  it("stops at the market's first day instead of asking past it", async () => {
    // A coin two hundred four-hour bars old: under half of one 500-bar page.
    const bornAt = Date.now() - 200 * FOUR_HOURS
    marketFacts.mockResolvedValue({ id: 7, bornAt, priceDecimals: 1, sizeDecimals: 5 })
    publicRead.mockImplementation(barsFrom(bornAt, FOUR_HOURS))

    const bars = await fetchLighterCandles("mainnet", "NEW", "4h")

    // One page reaches past the birthday, so one request is all it takes.
    expect(publicRead).toHaveBeenCalledTimes(1)
    expect(bars.length).toBeGreaterThan(190)
    expect(bars[0].openTime).toBeGreaterThanOrEqual(bornAt)
  })

  it("walks until the bars run out when no first day is stated", async () => {
    const bornAt = Date.now() - 200 * FOUR_HOURS
    marketFacts.mockResolvedValue({ id: 7, bornAt: null, priceDecimals: 1, sizeDecimals: 5 })
    publicRead.mockImplementation(barsFrom(bornAt, FOUR_HOURS))

    await fetchLighterCandles("mainnet", "NODATE", "4h")

    // Six pages found bars, and the next batch of six came back empty before
    // the walk could stop — the blind cost the birthday saves.
    expect(publicRead).toHaveBeenCalledTimes(12)
  })
})
