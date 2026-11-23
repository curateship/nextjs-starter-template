import { describe, expect, it } from "vitest"

import type { MarketRow } from "@/lib/protocols/contracts"
import {
  matchMarketRank,
  orderMarketMatches,
  type MarketMatch,
} from "@/lib/trade/market-search"

function row(symbol: string, marketId = symbol): MarketRow {
  return {
    key: `hyperliquid:mainnet:${marketId}`,
    marketId,
    symbol,
    quoteAsset: "USDC",
    subExchange: null,
    category: "crypto",
    sizeDecimals: null,
    priceTick: null,
    minOrderValueUsd: null,
    maxLeverage: null,
    isolatedOnly: false,
    iconUrl: null,
    price: 1,
    change24h: null,
    volume24hUsd: 0,
    fundingHourly: null,
    openInterestUsd: null,
  }
}

function match(
  symbol: string,
  rank: number,
  volume24hUsd: number,
  protocolLabel = "Hyperliquid"
): MarketMatch {
  return {
    rank,
    volume24hUsd,
    hit: {
      key: `hyperliquid:mainnet:${symbol}`,
      symbol,
      protocol: "hyperliquid",
      protocolLabel,
      subExchange: null,
      href: null,
    },
  }
}

describe("matchMarketRank", () => {
  it("puts the exact ticker above one that merely contains it", () => {
    expect(matchMarketRank(row("BTC"), "btc")).toBe(0)
    expect(matchMarketRank(row("BTCDOM"), "btc")).toBe(1)
    expect(matchMarketRank(row("WBTC-USDC"), "btc")).toBe(2)
  })

  it("matches the exchange's own id last, so an address still finds the coin", () => {
    const mint = row("BONK", "DezXAZ8z7PnrnRJjz3wXBoRgixCaBtcui1")
    expect(matchMarketRank(mint, "dezxaz8z")).toBe(3)
  })

  it("answers null for a market the words do not name", () => {
    expect(matchMarketRank(row("ETH"), "btc")).toBe(null)
  })
})

describe("orderMarketMatches", () => {
  // Eight exchanges list BTC. The busiest is the one somebody meant, and the
  // tier still comes first: a worse match with more money in it stays below.
  it("orders by match, then by the dollars traded in a day", () => {
    const ordered = orderMarketMatches([
      match("BTCDOM", 1, 9_000_000),
      match("BTC", 0, 1_000_000, "KuCoin"),
      match("BTC", 0, 8_000_000, "Binance"),
    ])
    expect(ordered.map((hit) => hit.symbol)).toEqual(["BTC", "BTC", "BTCDOM"])
    expect(ordered.map((hit) => hit.protocolLabel)).toEqual([
      "Binance",
      "KuCoin",
      "Hyperliquid",
    ])
  })
})
