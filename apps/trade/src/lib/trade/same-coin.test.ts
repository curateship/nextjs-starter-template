import { describe, expect, it } from "vitest"
import type { MarketRow } from "@/lib/protocols/contracts"
import { coinIdentity, groupSameCoins } from "./same-coin"

function row(symbol: string, patch: Partial<MarketRow> = {}): MarketRow {
  return {
    key: `aster:mainnet:${symbol}`,
    marketId: symbol,
    symbol,
    quoteAsset: "USDT",
    subExchange: null,
    category: "crypto",
    sizeDecimals: null,
    priceTick: null,
    minOrderValueUsd: null,
    maxLeverage: null,
    isolatedOnly: false,
    iconUrl: null,
    price: 100,
    change24h: null,
    volume24hUsd: 1000,
    fundingHourly: null,
    openInterestUsd: null,
    ...patch,
  }
}
describe("same coin", () => {
  it("normalizes quotes and explicit contract multipliers without confusing prices", () => {
    expect(coinIdentity(row("kSHIB"))).toEqual({
      id: "crypto:SHIB",
      units: 1000,
    })
    expect(coinIdentity(row("SHIB", { marketId: "SHIBUSDT" }))).toEqual({
      id: "crypto:SHIB",
      units: 1,
    })
    expect(coinIdentity(row("1000PEPE"))).toEqual({
      id: "crypto:PEPE",
      units: 1000,
    })
    expect(coinIdentity(row("TUSD")).id).toBe("crypto:TUSD")
    expect(coinIdentity(row("USDC")).id).toBe("crypto:USDC")
    expect(coinIdentity(row("PEPE"))).toEqual({ id: "crypto:PEPE", units: 1 })
  })
  it("matches stocks across venues but never mixes stocks and crypto", () => {
    const stock = row("TSLA", { category: "stocks" })
    const hosted = row("xyz:TSLA", {
      category: "stocks",
      key: "hyperliquid:mainnet:xyz:TSLA",
      subExchange: "xyz",
    })
    expect(
      groupSameCoins([stock, hosted, row("TSLA")]).map((group) => group.length)
    ).toEqual([2, 1])
  })
  it("keeps ambiguous same-venue markets and open coin listings separate", () => {
    expect(
      groupSameCoins([row("BTC"), row("xyz:BTC", { subExchange: "xyz" })])
    ).toHaveLength(2)
    expect(coinIdentity(row("BTC", { caution: "unverified" })).id).toBe(
      "aster:mainnet:BTC"
    )
  })
})
