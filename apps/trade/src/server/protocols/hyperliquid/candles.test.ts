import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { candleSnapshot } = vi.hoisted(() => ({ candleSnapshot: vi.fn() }))

vi.mock("@/server/protocols/hyperliquid/client", () => ({
  infoClient: () => ({ candleSnapshot }),
}))

import {
  fetchHyperliquidCandleHistory,
  toCandleBars,
} from "@/server/protocols/hyperliquid/candles"

beforeEach(() => {
  candleSnapshot.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("turning Hyperliquid's candles into bars", () => {
  it("translates the figures and keeps time order", () => {
    const bars = toCandleBars([
      // Deliberately newest-first: the sort is the module's promise, not the
      // exchange's.
      { t: 2_000, o: "10", h: "12", l: "9", c: "11", v: "100" },
      { t: 1_000, o: "9", h: "10.5", l: "8.5", c: "10", v: "50" },
    ])
    expect(bars.map((bar) => bar.openTime)).toEqual([1_000, 2_000])
    expect(bars[1]).toEqual({
      openTime: 2_000,
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 100,
    })
  })

  it("drops a bar with an unreadable price instead of drawing NaN", () => {
    expect(
      toCandleBars([
        { t: 1_000, o: "junk", h: "12", l: "9", c: "11", v: "100" },
      ])
    ).toEqual([])
  })

  it("lets junk volume fall back to zero without dropping the bar", () => {
    const bars = toCandleBars([
      { t: 1_000, o: "10", h: "12", l: "9", c: "11", v: "junk" },
    ])
    expect(bars).toHaveLength(1)
    expect(bars[0].volume).toBe(0)
  })
})

describe("reading a historical page", () => {
  it("asks for the exact finished window and drops anything outside it", async () => {
    vi.useFakeTimers()
    candleSnapshot.mockResolvedValue([
      { t: 1_000, o: "10", h: "12", l: "9", c: "11", v: "100" },
      { t: 2_000, o: "11", h: "13", l: "10", c: "12", v: "100" },
    ])

    const pending = fetchHyperliquidCandleHistory(
      "mainnet",
      "BTC",
      "1h",
      1_000,
      2_000
    )
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toEqual([
      expect.objectContaining({ openTime: 1_000 }),
    ])
    expect(candleSnapshot).toHaveBeenCalledWith({
      coin: "BTC",
      interval: "1h",
      startTime: 1_000,
      endTime: 1_999,
    })
  })

  it("backs off and retries a rate limit", async () => {
    vi.useFakeTimers()
    candleSnapshot
      .mockRejectedValueOnce(new Error("429 rate limited"))
      .mockResolvedValueOnce([])

    const pending = fetchHyperliquidCandleHistory(
      "mainnet",
      "BTC",
      "1h",
      1_000,
      2_000
    )
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toEqual([])
    expect(candleSnapshot).toHaveBeenCalledTimes(2)
  })
})
