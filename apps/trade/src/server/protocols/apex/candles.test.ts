import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import fixture from "./apex.fixture.json"
import {
  APEX_FIRST_BAR,
  fetchApexCandleHistory,
  fetchApexCandles,
  toApexBars,
} from "@/server/protocols/apex/candles"
import { apexContract } from "@/server/protocols/apex/catalogue"
import { apexPublic } from "@/server/protocols/apex/client"
import {
  fetchApexFunding,
  toApexFundingRates,
} from "@/server/protocols/apex/funding"
import { clearHeldHistory } from "@/server/protocols/full-history"

vi.mock("@/server/protocols/apex/client", () => ({ apexPublic: vi.fn() }))
vi.mock("@/server/protocols/apex/catalogue", () => ({ apexContract: vi.fn() }))

const publicRead = vi.mocked(apexPublic)
const contract = vi.mocked(apexContract)
const HOUR = 3_600_000
const MINUTE = 60_000

beforeEach(() => {
  publicRead.mockReset()
  contract.mockReset()
  contract.mockResolvedValue({ marketId: "BTCUSDT", symbol: "BTC-USDT" } as never)
})

afterEach(() => {
  clearHeldHistory()
})

describe("ApeX Omni candles", () => {
  it("reads a real 1,500-bar answer oldest first, times in milliseconds", () => {
    const rows = fixture.klines1500.data.BTCUSDT
    const oldest = rows.reduce((one, next) => (next.t < one.t ? next : one))
    const bars = toApexBars(fixture.klines1500.data, "BTCUSDT")
    expect(bars).toHaveLength(1500)
    expect(bars[1].openTime - bars[0].openTime).toBe(HOUR)
    expect(bars[0]).toEqual({
      openTime: oldest.t,
      open: Number(oldest.o),
      high: Number(oldest.h),
      low: Number(oldest.l),
      close: Number(oldest.c),
      volume: Number(oldest.v),
    })
  })

  it("reads the empty answer ApeX gives a limit over 200 as no bars", () => {
    expect(fixture.klinesOverLimit.data).toEqual({})
    expect(toApexBars(fixture.klinesOverLimit.data, "BTCUSDT")).toEqual([])
  })

  it("never sends a limit, and asks the window in seconds", async () => {
    publicRead.mockResolvedValue({ BTCUSDT: [] })
    await fetchApexCandles("mainnet", "BTCUSDT", "1h")
    const [, path, params] = publicRead.mock.calls[0]
    expect(path).toBe("/klines")
    expect(params).not.toHaveProperty("limit")
    expect(params).toMatchObject({ symbol: "BTCUSDT", interval: "60" })
    const { start, end } = params as { start: number; end: number }
    // One page is 1,400 bars, never wider.
    expect(end - start).toBeLessThanOrEqual(1_400 * 3_600)
    expect(end - start).toBeGreaterThan(1_399 * 3_600)
  })

  it("pages a long window in 1,400-bar steps without a gap or a repeat", async () => {
    publicRead.mockImplementation(async (_network, _path, params) => {
      const from = Number(params?.start) * 1_000
      const to = Number(params?.end) * 1_000
      const rows: unknown[] = []
      // ApeX includes the bar the end second falls in.
      for (let at = Math.ceil(from / MINUTE) * MINUTE; at <= to; at += MINUTE) {
        rows.push({ t: at, o: "1", h: "2", l: "0.5", c: "1.5", v: "3" })
      }
      return { BTCUSDT: rows }
    })
    const from = Date.UTC(2026, 8, 1)
    const to = from + 3_000 * MINUTE
    const bars = await fetchApexCandleHistory("mainnet", "BTCUSDT", "1m", from, to)
    expect(publicRead).toHaveBeenCalledTimes(3)
    expect(bars).toHaveLength(3_000)
    expect(bars[0].openTime).toBe(from)
    expect(bars.at(-1)!.openTime).toBe(to - MINUTE)
  })

  it("asks nothing before ApeX Omni's first bar", async () => {
    publicRead.mockResolvedValue({ BTCUSDT: [] })
    await fetchApexCandleHistory(
      "mainnet",
      "BTCUSDT",
      "1d",
      Date.UTC(2019, 0, 1),
      APEX_FIRST_BAR
    )
    expect(publicRead).not.toHaveBeenCalled()
  })
})

describe("ApeX Omni funding", () => {
  it("reads a real page of hourly settlements, oldest first", () => {
    const rows = fixture.funding.data.historyFunds
    const rates = toApexFundingRates(fixture.funding.data, 0, Date.UTC(2100, 0))
    expect(rates).toHaveLength(rows.length)
    expect(rates[1].time - rates[0].time).toBe(HOUR)
    expect(rates.at(-1)).toEqual({
      time: rows[0].fundingTime,
      rate: Number(rows[0].rate),
    })
  })

  it("asks with the dashed spelling and 100-hour pages", async () => {
    publicRead.mockResolvedValue({ historyFunds: [] })
    const from = Date.UTC(2026, 8, 1)
    await fetchApexFunding("mainnet", "BTCUSDT", from, from + 250 * HOUR)
    expect(publicRead).toHaveBeenCalledTimes(3)
    expect(publicRead.mock.calls[0][2]).toMatchObject({
      symbol: "BTC-USDT",
      beginTimeInclusive: from,
      endTimeExclusive: from + 100 * HOUR,
      limit: 100,
    })
  })
})
