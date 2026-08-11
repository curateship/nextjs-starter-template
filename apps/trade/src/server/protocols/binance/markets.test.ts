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

describe("Binance history", () => {
  it("treats a delisted saved market as missing history", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 400 })))

    await expect(
      fetchBinanceCandleHistory("mainnet", "DELISTED", "4h", 0, 1)
    ).resolves.toEqual([])
  })
})
