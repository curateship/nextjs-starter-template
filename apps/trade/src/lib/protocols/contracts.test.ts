import { describe, expect, it } from "vitest"

import { marketKey, parseMarketKey } from "@/lib/protocols/contracts"

describe("market keys", () => {
  it("builds and reads back the same reference", () => {
    const ref = {
      protocol: "hyperliquid" as const,
      network: "mainnet" as const,
      marketId: "BTC",
    }
    expect(parseMarketKey(marketKey(ref))).toEqual(ref)
  })

  it("keeps a market id that itself contains a colon", () => {
    // Hyperliquid spot ids look like "@107"; nothing promises a future
    // protocol's ids are colon-free, so everything after the second colon is
    // the id, verbatim.
    const ref = {
      protocol: "hyperliquid" as const,
      network: "testnet" as const,
      marketId: "A:B",
    }
    expect(parseMarketKey(marketKey(ref))).toEqual(ref)
  })

  it("refuses anything that is not a known protocol and network", () => {
    // A bad key must resolve to "not available", never to some other market.
    for (const bad of [
      "",
      "BTC",
      "hyperliquid:BTC",
      "hyperliquid:mainnet:",
      // An exchange this build does not ship. It used to be "binance", which
      // stopped being a good example the day Binance was registered — the
      // point of the case is a name that is not in the union, not that
      // particular name.
      "coinbase:mainnet:BTC",
      "hyperliquid:moonnet:BTC",
      "binance:moonnet:BTC",
      ":mainnet:BTC",
    ]) {
      expect(parseMarketKey(bad), bad).toBeNull()
    }
  })
})
