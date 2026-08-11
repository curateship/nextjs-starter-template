import { describe, expect, it } from "vitest"

import {
  fetchBinanceCandles,
  fetchBinanceMarkets,
  fetchBinancePrices,
} from "@/server/protocols/binance/markets"

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
