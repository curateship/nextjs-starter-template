import { describe, expect, it } from "vitest"

import {
  marketChartHref,
  marketKey,
  marketSymbol,
  parseMarketKey,
} from "@/lib/protocols/contracts"

describe("market keys", () => {
  it("opens a supported market on its protocol chart", () => {
    expect(marketChartHref("kucoin:mainnet:SOLUSDTM")).toBe(
      "/admin/kucoin?market=kucoin%3Amainnet%3ASOLUSDTM"
    )
    expect(marketChartHref("binance:mainnet:BTCUSDT")).toBeNull()
    expect(marketChartHref("aster:testnet:BTCUSDT")).toBe(
      "/admin/aster?market=aster%3Atestnet%3ABTCUSDT"
    )
  })

  it("shortens a Solana mint, because the ticker is not in the key", () => {
    // A Solana id is the coin's mint address: two coins can share a ticker
    // there, so only the address is unique. Printed raw it is 44 characters
    // and fills a browser tab with nothing readable. Every caller that HAS
    // the row prints `row.symbol` and shows the real ticker instead.
    const mint = "CbyTNf7UPzvewHh4Zp6umogM2RWahhmGRJWLJnPwpump"
    expect(marketSymbol(`solana:mainnet:${mint}`)).toBe("CbyTNf…pump")
    // Every other venue's id is its own name and is printed as it is.
    expect(marketSymbol("hyperliquid:mainnet:BTC")).toBe("BTC")
    expect(marketSymbol("aster:mainnet:BTCUSDT")).toBe("BTCUSDT")
    // Dukascopy's lowercase ids carry the quote currency and are translated.
    expect(marketSymbol("dukascopy:mainnet:tslaususd")).toBe("TSLA")
    // A key that cannot be read still says something rather than nothing.
    expect(marketSymbol("not-a-market")).toBe("not-a-market")
  })

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
