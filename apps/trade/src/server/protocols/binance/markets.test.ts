import { afterEach, describe, expect, it, vi } from "vitest"

import {
  fetchBinanceCandles,
  fetchBinanceCandleHistory,
  fetchBinanceMarkets,
  fetchBinancePrices,
} from "@/server/protocols/binance/markets"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Binance networks", () => {
  it("refuses to label real-market data as testnet data", async () => {
    await expect(fetchBinanceMarkets("testnet")).rejects.toThrow(
      "BINANCE_NETWORK_UNSUPPORTED"
    )
    await expect(fetchBinanceCandles("testnet", "BTC", "4h")).rejects.toThrow(
      "BINANCE_NETWORK_UNSUPPORTED"
    )
    await expect(fetchBinancePrices("testnet", ["BTC"])).rejects.toThrow(
      "BINANCE_NETWORK_UNSUPPORTED"
    )
  })
})

describe("Binance requests that never answer", () => {
  it("gives every market list and candle request a time limit", async () => {
    const fetchSpy = vi.fn(
      async (_url: unknown, _init?: RequestInit) =>
        new Response(null, { status: 400 })
    )
    vi.stubGlobal("fetch", fetchSpy)

    await fetchBinanceCandleHistory("mainnet", "DELISTED", "4h", 0, 1)
    await fetchBinanceMarkets("mainnet").catch(() => {})

    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(3)
    for (const [, init] of fetchSpy.mock.calls) {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
  })
})

describe("Binance history", () => {
  it("treats a delisted saved market as missing history", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 400 })))

    await expect(
      fetchBinanceCandleHistory("mainnet", "DELISTED", "4h", 0, 1)
    ).resolves.toEqual([])
  })
})

describe("Binance market rules", () => {
  it("carries each market's price step, size step and smallest order", async () => {
    ;(globalThis as { __binanceMarketCache?: unknown }).__binanceMarketCache =
      undefined
    const symbol = (name: string, filters: unknown[]) => ({
      symbol: name,
      status: "TRADING",
      contractType: "PERPETUAL",
      quoteAsset: "USDT",
      quantityPrecision: 0,
      filters,
    })
    // Filter values as Binance published them on 24 Sep 2026.
    const info = {
      symbols: [
        symbol("1000PEPEUSDT", [
          { filterType: "PRICE_FILTER", tickSize: "0.0000001" },
          { filterType: "LOT_SIZE", stepSize: "1", minQty: "1" },
          { filterType: "MIN_NOTIONAL", notional: "5" },
          { filterType: "PERCENT_PRICE", multiplierUp: "1.1500", multiplierDown: "0.8500" },
        ]),
        symbol("龙虾USDT", []),
      ],
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Response.json(String(url).endsWith("/exchangeInfo") ? info : [])
      )
    )

    const catalog = await fetchBinanceMarkets("mainnet")
    expect(catalog.rows).toHaveLength(1)
    expect(catalog.rows[0]).toMatchObject({
      marketId: "kPEPE",
      priceTick: 0.0000001,
      sizeDecimals: 0,
      minOrderSize: 1,
      minOrderValueUsd: 5,
      priceMultiplierUp: 1.15,
      priceMultiplierDown: 0.85,
    })
  })
})
