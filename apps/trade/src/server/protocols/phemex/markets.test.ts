import { afterEach, describe, expect, it, vi } from "vitest"

import {
  fetchPhemexMarkets,
  fetchPhemexPrices,
  phemexPricesWereRationed,
} from "@/server/protocols/phemex/markets"

/**
 * Fixtures shaped like the exchange's real answers — `/public/products`
 * wrapped in `{code, msg, data}`, the all-tickers read in `{error, result}`.
 * The point pinned down: only listed, dollar-settled contracts become rows,
 * and every figure lands in the app's units.
 */

const PRODUCTS = {
  code: 0,
  msg: "",
  data: {
    perpProductsV2: [
      {
        symbol: "BTCUSDT",
        status: "Listed",
        settleCurrency: "USDT",
        baseCurrency: "BTC",
        tickSize: "0.1",
        qtyStepSize: "0.001",
        maxLeverage: 100,
      },
      // Delisted rows stay in the exchange's answer; they must not become rows.
      {
        symbol: "OLDUSDT",
        status: "Delisted",
        settleCurrency: "USDT",
        tickSize: "0.01",
        qtyStepSize: "0.1",
      },
    ],
  },
}

const TICKERS = {
  error: null,
  id: 0,
  result: [
    {
      symbol: "BTCUSDT",
      markPriceRp: "50000",
      openRp: "40000",
      turnoverRv: "123000000",
      fundingRateRr: "0.0008",
      openInterestRv: "9000000",
    },
  ],
}

function stubFetch(answers: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const text = String(url)
      for (const [needle, answer] of Object.entries(answers)) {
        if (text.includes(needle)) return Response.json(answer)
      }
      return new Response(null, { status: 404 })
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("the Phemex catalogue", () => {
  it("lists only live dollar-settled contracts, in the app's units", async () => {
    stubFetch({
      "/public/products": PRODUCTS,
      "/md/v2/ticker/24hr/all": TICKERS,
    })

    const catalog = await fetchPhemexMarkets("mainnet")
    expect(catalog.protocol).toBe("phemex")
    expect(catalog.rows).toHaveLength(1)

    const btc = catalog.rows[0]
    expect(btc.key).toBe("phemex:mainnet:BTCUSDT")
    expect(btc.marketId).toBe("BTCUSDT")
    expect(btc.symbol).toBe("BTC")
    expect(btc.priceTick).toBe(0.1)
    expect(btc.sizeDecimals).toBe(3)
    expect(btc.maxLeverage).toBe(100)
    expect(btc.price).toBe(50_000)
    expect(btc.change24h).toBe(0.25)
    expect(btc.volume24hUsd).toBe(123_000_000)
    // 8-hour rate ÷ 8: the app speaks hourly funding everywhere.
    expect(btc.fundingHourly).toBeCloseTo(0.0001, 10)
  })
})

describe("Phemex prices", () => {
  it("answers only the markets the exchange priced", async () => {
    stubFetch({ "/md/v2/ticker/24hr/all": TICKERS })

    const prices = await fetchPhemexPrices("mainnet", ["BTCUSDT", "GHOSTUSDT"])
    expect(prices.get("BTCUSDT")).toBe(50_000)
    expect(prices.has("GHOSTUSDT")).toBe(false)
    expect(phemexPricesWereRationed("mainnet", "BTCUSDT")).toBe(false)
  })
})
