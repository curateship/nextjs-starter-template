import { describe, expect, it } from "vitest"

import { toAsterMarketCatalog } from "@/server/protocols/aster/markets"

const FILTERS = [
  { filterType: "PRICE_FILTER", tickSize: "0.25" },
  { filterType: "LOT_SIZE", stepSize: "0.001" },
  { filterType: "MIN_NOTIONAL", notional: "5" },
]

describe("the Aster catalogue", () => {
  it("lists only active USDT perpetuals and keeps their stated rules", () => {
    const catalog = toAsterMarketCatalog({
      network: "mainnet",
      exchangeInfo: {
        symbols: [
          {
            symbol: "BTCUSDT",
            status: "TRADING",
            contractType: "PERPETUAL",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            marginAsset: "USDT",
            underlyingSubType: ["Top"],
            filters: FILTERS,
          },
          {
            symbol: "SAMSUNGUSDT",
            status: "TRADING",
            contractType: "PERPETUAL",
            baseAsset: "SAMSUNG",
            quoteAsset: "USDT",
            marginAsset: "USDT",
            underlyingSubType: ["STOCK"],
            filters: FILTERS,
          },
          {
            symbol: "BTCUSD",
            status: "TRADING",
            contractType: "PERPETUAL",
            baseAsset: "BTC",
            quoteAsset: "USD",
            marginAsset: "BTC",
            filters: FILTERS,
          },
          {
            symbol: "OLDUSDT",
            status: "BREAK",
            contractType: "PERPETUAL",
            baseAsset: "OLD",
            quoteAsset: "USDT",
            marginAsset: "USDT",
            filters: FILTERS,
          },
        ],
      },
      tickers: [
        {
          symbol: "BTCUSDT",
          priceChangePercent: "2.5",
          quoteVolume: "9000000",
        },
        {
          symbol: "SAMSUNGUSDT",
          priceChangePercent: "-3.919",
          quoteVolume: "438841.17",
        },
      ],
      marks: [
        { symbol: "BTCUSDT", markPrice: "117000.5", lastFundingRate: "0.0008" },
        {
          symbol: "SAMSUNGUSDT",
          markPrice: "194.17",
          lastFundingRate: "0.0001",
        },
      ],
      fundingIntervals: new Map([
        ["BTCUSDT", 8 * 3_600_000],
        ["SAMSUNGUSDT", 4 * 3_600_000],
      ]),
    })

    expect(catalog.protocol).toBe("aster")
    expect(catalog.protocolLabel).toBe("Aster")
    expect(catalog.rows).toHaveLength(2)

    const btc = catalog.rows[0]
    expect(btc.key).toBe("aster:mainnet:BTCUSDT")
    expect(btc.symbol).toBe("BTC")
    expect(btc.quoteAsset).toBe("USDT")
    expect(btc.priceTick).toBe(0.25)
    expect(btc.sizeDecimals).toBe(3)
    expect(btc.price).toBe(117_000.5)
    expect(btc.change24h).toBe(0.025)
    expect(btc.volume24hUsd).toBe(9_000_000)
    expect(btc.fundingHourly).toBe(0.0001)
    expect(btc.maxLeverage).toBeNull()
    expect(catalog.rows[1].category).toBe("stocks")
  })

  it("drops a market whose mark price cannot be read", () => {
    const catalog = toAsterMarketCatalog({
      network: "testnet",
      exchangeInfo: {
        symbols: [
          {
            symbol: "BTCUSDT",
            status: "TRADING",
            contractType: "PERPETUAL",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            marginAsset: "USDT",
            filters: FILTERS,
          },
        ],
      },
      tickers: [],
      marks: [{ symbol: "BTCUSDT", markPrice: "bad" }],
      fundingIntervals: new Map(),
    })
    expect(catalog.networkLabel).toBe("Testnet")
    expect(catalog.rows).toEqual([])
  })
})
