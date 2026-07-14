import { describe, expect, it, vi } from "vitest"

import type { SubscriptionClient } from "@nktkas/hyperliquid"

import { MarketTradeStream, normalizeMarketTrades } from "./trade-stream"

describe("market scanner trade stream", () => {
  it("keeps small trades that the research scanner filters out", () => {
    expect(
      normalizeMarketTrades([
        { coin: "BTC", px: "100", sz: "0.01", time: 1_000, tid: 1 },
      ])
    ).toEqual([
      { coin: "BTC", px: 100, notional: 1, ts: 1_000, tid: 1 },
    ])
  })

  it("drops invalid external trade values", () => {
    expect(
      normalizeMarketTrades([
        { coin: "BTC", px: "bad", sz: "1", time: 1_000, tid: 1 },
      ])
    ).toEqual([])
  })

  it("drops trades with invalid market names or trade IDs", () => {
    expect(
      normalizeMarketTrades([
        { coin: "", px: "100", sz: "1", time: 1_000, tid: 1 },
        { coin: "BTC", px: "100", sz: "1", time: 1_000, tid: Number.NaN },
      ])
    ).toEqual([])
  })

  it("retries failed market subscriptions", async () => {
    vi.useFakeTimers()
    const unsubscribe = vi.fn().mockResolvedValue(undefined)
    const trades = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValue({ unsubscribe })
    const stream = new MarketTradeStream(
      { trades } as unknown as SubscriptionClient,
      () => {},
      async () => [{ coin: "BTC" }]
    )

    await stream.start()
    expect(stream.meta().marketScannerSubscriptions).toBe(0)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(stream.meta().marketScannerSubscriptions).toBe(1)

    stream.stop()
    expect(unsubscribe).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
