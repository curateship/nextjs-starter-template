import { describe, expect, it } from "vitest"

import { toLighterMarketCatalog } from "@/server/protocols/lighter/markets"

/** Trimmed copies of Lighter's real 26 Aug 2026 mainnet answers. */
const BTC = {
  symbol: "BTC",
  market_id: 1,
  market_type: "perp",
  status: "active",
  taker_fee: "0.0000",
  maker_fee: "0.0000",
  min_base_amount: "0.00010",
  min_quote_amount: "10.000000",
  size_decimals: 5,
  price_decimals: 1,
  default_initial_margin_fraction: 500,
  min_initial_margin_fraction: 200,
  mark_price: "78584.1",
  index_price: "78600.3",
  last_trade_price: 78_581.8,
  daily_quote_token_volume: 707_479_903.174_57,
  daily_price_change: -1.154_337_633_067_031_6,
  open_interest: 1_928.461_92,
}

const INACTIVE = {
  ...BTC,
  symbol: "LAUNCHCOIN",
  market_id: 54,
  status: "inactive",
}

/** Listed and priced by Lighter, but nothing has ever traded on it. */
const NEVER_TRADED = {
  ...BTC,
  symbol: "KORU",
  market_id: 226,
  last_trade_price: 0,
  daily_quote_token_volume: 0,
  open_interest: 0,
}

const FUNDING_RATES = {
  code: 200,
  funding_rates: [
    { market_id: 1, exchange: "binance", symbol: "BTC", rate: 0.000_065_14 },
    { market_id: 1, exchange: "lighter", symbol: "BTC", rate: 0.000_096 },
  ],
}

describe("the Lighter catalogue", () => {
  it("lists only active perpetuals and keeps their stated rules", () => {
    const catalog = toLighterMarketCatalog({
      network: "mainnet",
      orderBookDetails: {
        code: 200,
        order_book_details: [BTC, INACTIVE, NEVER_TRADED, { broken: true }],
      },
      fundingRates: FUNDING_RATES,
    })

    expect(catalog.protocolLabel).toBe("Lighter")
    expect(catalog.rows.map((row) => row.marketId)).toEqual(["BTC"])
    const row = catalog.rows[0]
    expect(row.key).toBe("lighter:mainnet:BTC")
    expect(row.quoteAsset).toBe("USDC")
    // Lighter states no kind, so no row claims one and no tabs appear.
    expect(row.category).toBe("other")
    expect(catalog.picker.categories).toBe("crypto-only")
    expect(row.sizeDecimals).toBe(5)
    expect(row.minOrderSize).toBe(0.0001)
    expect(row.priceTick).toBe(0.1)
    expect(row.minOrderValueUsd).toBe(10)
    // 200 hundredths of a percent is a 2% margin floor, which is 50x.
    expect(row.maxLeverage).toBe(50)
    expect(row.price).toBe(78_584.1)
    expect(row.change24h).toBeCloseTo(-0.011_543, 6)
    expect(row.volume24hUsd).toBeCloseTo(707_479_903.17, 2)
  })

  it("keeps a market that traded before today but not since midnight", () => {
    // Lighter answers real candles for these; only a market that has NEVER
    // traded has no history to draw.
    const catalog = toLighterMarketCatalog({
      network: "mainnet",
      orderBookDetails: {
        code: 200,
        order_book_details: [
          {
            ...BTC,
            symbol: "NZDUSD",
            market_id: 190,
            last_trade_price: 0.5892,
            daily_quote_token_volume: 0,
            daily_price_change: 0,
          },
        ],
      },
      fundingRates: FUNDING_RATES,
    })
    expect(catalog.rows.map((row) => row.marketId)).toEqual(["NZDUSD"])
    expect(catalog.rows[0].volume24hUsd).toBe(0)
  })

  it("prices the mark, never the last trade or the index", () => {
    const catalog = toLighterMarketCatalog({
      network: "mainnet",
      orderBookDetails: { code: 200, order_book_details: [BTC] },
      fundingRates: FUNDING_RATES,
    })
    expect(catalog.rows[0].price).toBe(78_584.1)
    expect(catalog.rows[0].price).not.toBe(78_581.8)
    expect(catalog.rows[0].price).not.toBe(78_600.3)
  })

  it("divides Lighter's eight-hour funding quote down to one hour", () => {
    const catalog = toLighterMarketCatalog({
      network: "mainnet",
      orderBookDetails: { code: 200, order_book_details: [BTC] },
      fundingRates: FUNDING_RATES,
    })
    // The lighter row, not the binance one quoted beside it.
    expect(catalog.rows[0].fundingHourly).toBeCloseTo(0.000_012, 9)
  })

  it("prices the coin-counted open interest into dollars", () => {
    const catalog = toLighterMarketCatalog({
      network: "mainnet",
      orderBookDetails: { code: 200, order_book_details: [BTC] },
      fundingRates: FUNDING_RATES,
    })
    expect(catalog.rows[0].openInterestUsd).toBeCloseTo(
      1_928.461_92 * 78_584.1,
      0
    )
  })

  it("still lists the markets when the funding read fails", () => {
    // A funding read that fails must leave one column blank, not blank the
    // whole list. `fetchLighterMarkets` catches it and passes null through.
    const catalog = toLighterMarketCatalog({
      network: "mainnet",
      orderBookDetails: { code: 200, order_book_details: [BTC] },
      fundingRates: null,
    })
    expect(catalog.rows).toHaveLength(1)
    expect(catalog.rows[0].price).toBe(78_584.1)
    expect(catalog.rows[0].fundingHourly).toBeNull()
  })

  it("survives a missing funding answer and an odd-decimals market", () => {
    const catalog = toLighterMarketCatalog({
      network: "mainnet",
      orderBookDetails: {
        code: 200,
        order_book_details: [
          {
            ...BTC,
            symbol: "LAUNCHCOIN",
            market_id: 54,
            size_decimals: 0,
            price_decimals: 6,
            min_base_amount: "100",
            min_initial_margin_fraction: 3_333,
            mark_price: "0.062636",
          },
        ],
      },
      fundingRates: null,
    })
    const row = catalog.rows[0]
    expect(row.key).toBe("lighter:mainnet:LAUNCHCOIN")
    expect(row.sizeDecimals).toBe(0)
    expect(row.priceTick).toBe(0.000001)
    expect(row.minOrderSize).toBe(100)
    expect(row.maxLeverage).toBe(3)
    expect(row.fundingHourly).toBeNull()
  })
})
