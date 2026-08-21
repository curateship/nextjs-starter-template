import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchKucoinMarkets,
  clearKucoinPriceCache,
  fetchKucoinPrices,
  kucoinMarketRules,
} from "@/server/protocols/kucoin/markets"

/**
 * Fixtures shaped like the exchange's real answers, taken from the live API
 * on 19 Aug 2026. The points pinned down: only dollar-settled contracts
 * anyone can trade become rows, the lot maths reaches the order path
 * untouched, and today's price comes from the small read rather than the
 * 1.3 MB rulebook.
 */

const CONTRACTS = {
  code: "200000",
  data: [
    {
      symbol: "XBTUSDTM",
      status: "Open",
      settleCurrency: "USDT",
      quoteCurrency: "USDT",
      baseCurrency: "XBT",
      isInverse: false,
      multiplier: 0.001,
      lotSize: 1,
      tickSize: 0.1,
      maxLeverage: 125,
      markPrice: 69_037.8,
      priceChgPct: 0.0685,
      turnoverOf24h: 950_865_861,
      openInterest: "28224344",
      fundingFeeRate: -8.3e-5,
      fundingRateGranularity: 28_800_000,
    },
    // Coin-settled: a different trade this app does not make.
    {
      symbol: "XBTUSDM",
      status: "Open",
      settleCurrency: "XBT",
      isInverse: true,
      multiplier: 1,
      tickSize: 1,
      markPrice: 69_000,
    },
    // Not open for trading, so not a row.
    {
      symbol: "OLDUSDTM",
      status: "Paused",
      settleCurrency: "USDT",
      isInverse: false,
      multiplier: 1,
      tickSize: 0.001,
      markPrice: 1,
    },
  ],
}

const TICKERS = {
  code: "200000",
  data: [{ symbol: "XBTUSDTM", price: "69040.1" }],
}

function stubFetch(answers: Record<string, unknown>) {
  const fetcher = vi.fn(async (url: string | URL) => {
      const text = String(url)
      for (const [needle, answer] of Object.entries(answers)) {
        if (text.includes(needle)) return Response.json(answer)
      }
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal("fetch", fetcher)
  return fetcher
}

beforeEach(() => {
  // Prices are held for two seconds, and a test suite runs faster than that.
  clearKucoinPriceCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("the KuCoin catalogue", () => {
  it("lists only dollar-settled contracts that are open, in the app's units", async () => {
    stubFetch({ "/api/v1/contracts/active": CONTRACTS })

    const catalog = await fetchKucoinMarkets("mainnet")
    expect(catalog.protocol).toBe("kucoin")
    expect(catalog.protocolLabel).toBe("KuCoin")
    expect(catalog.rows).toHaveLength(1)

    const btc = catalog.rows[0]
    expect(btc.key).toBe("kucoin:mainnet:XBTUSDTM")
    expect(btc.marketId).toBe("XBTUSDTM")
    // KuCoin calls Bitcoin XBT in its ids; the base currency it states is
    // what gets printed.
    expect(btc.symbol).toBe("XBT")
    expect(btc.priceTick).toBe(0.1)
    // One contract is a thousandth of a coin, so the size step is 3 decimals.
    expect(btc.sizeDecimals).toBe(3)
    expect(btc.maxLeverage).toBe(125)
    expect(btc.price).toBe(69_037.8)
    expect(btc.change24h).toBe(0.0685)
    expect(btc.fundingHourly).toBeCloseTo(-8.3e-5 / 8, 12)
  })

  it("hands the order path the market's real lot maths", async () => {
    stubFetch({ "/api/v1/contracts/active": CONTRACTS })
    const rules = await kucoinMarketRules("mainnet", "XBTUSDTM")
    expect(rules.lot).toEqual({ multiplier: 0.001, lotSize: 1 })
    expect(rules.priceTick).toBe(0.1)
  })

  it("refuses a market it cannot find rather than guessing a multiplier", async () => {
    stubFetch({ "/api/v1/contracts/active": CONTRACTS })
    // Guessing here would size an order by a factor of a hundred on some
    // coins, so "not listed" is the only safe answer.
    await expect(kucoinMarketRules("mainnet", "GHOSTUSDTM")).rejects.toThrow(
      "LIVE_UNLISTED"
    )
  })
})

describe("KuCoin prices", () => {
  it("answers the MARK price, not the last one traded", async () => {
    // Both reads are available, and only one of them is right: the engine
    // fires triggers and values positions on the mark price, the way the
    // other two exchanges' feeds do. Across KuCoin's whole catalogue on
    // 20 Aug 2026 the two were 2.8% apart at the worst — nothing on Bitcoin,
    // a real difference on a thin book, and thin books are where a rung sits.
    stubFetch({
      "/api/v1/mark-price/XBTUSDTM/current": {
        code: "200000",
        data: {
          symbol: "XBTUSDTM",
          granularity: 1000,
          timePoint: 1_787_203_956_000,
          value: 69_572.05,
          indexPrice: 69_605.51,
        },
      },
      "/api/v1/allTickers": TICKERS,
    })

    const prices = await fetchKucoinPrices("mainnet", ["XBTUSDTM"])
    expect(prices.get("XBTUSDTM")).toBe(69_572.05)
    // 69,040.1 is the last traded price in the same fixture. Seeing it here
    // means the cheap all-markets read crept back in.
    expect(prices.get("XBTUSDTM")).not.toBe(69_040.1)
  })

  it("keeps the other markets when one has no price at all", async () => {
    // A wallet holding one delisted coin must not lose the prices for
    // everything else it holds — the engine would settle none of it.
    // "mark price is not supported" is the exchange's own wording, code
    // 415000, and it arrives with an HTTP 200.
    stubFetch({
      "/api/v1/mark-price/XBTUSDTM/current": {
        code: "200000",
        data: { symbol: "XBTUSDTM", value: 69_572.05 },
      },
      "/api/v1/mark-price/GHOSTUSDTM/current": {
        code: "415000",
        msg: "mark price is not supported",
      },
    })
    const prices = await fetchKucoinPrices("mainnet", ["XBTUSDTM", "GHOSTUSDTM"])
    expect(prices.get("XBTUSDTM")).toBe(69_572.05)
    expect(prices.has("GHOSTUSDTM")).toBe(false)
  })

  it("still refuses out loud when the exchange itself is unwell", async () => {
    // Swallowing this would read as "that market has no price", and the
    // engine would treat a broken exchange as a quiet one.
    stubFetch({ "/api/v1/mark-price/XBTUSDTM/current": { code: "500000", msg: "boom" } })
    await expect(fetchKucoinPrices("mainnet", ["XBTUSDTM"])).rejects.toThrow()
  })

  it("does not keep knocking about a market it has been refused", async () => {
    // The engine's pass runs every second and asks every time. A coin the
    // exchange will not price must be remembered as unpriced, or one
    // delisted holding knocks on KuCoin's door once a second forever.
    const fetcher = stubFetch({
      "/api/v1/mark-price/GHOSTUSDTM/current": {
        code: "415000",
        msg: "mark price is not supported",
      },
    })
    await fetchKucoinPrices("mainnet", ["GHOSTUSDTM"])
    await fetchKucoinPrices("mainnet", ["GHOSTUSDTM"])
    await fetchKucoinPrices("mainnet", ["GHOSTUSDTM"])
    expect(fetcher.mock.calls.length).toBe(1)
  })

  it("asks the same market once even when named twice in one breath", async () => {
    const fetcher = stubFetch({
      "/api/v1/mark-price/XBTUSDTM/current": {
        code: "200000",
        data: { symbol: "XBTUSDTM", value: 69_572.05 },
      },
    })
    const prices = await fetchKucoinPrices("mainnet", ["XBTUSDTM", "XBTUSDTM"])
    expect(fetcher.mock.calls.length).toBe(1)
    expect(prices.get("XBTUSDTM")).toBe(69_572.05)
  })

  it("asks once per market and then leaves the exchange alone", async () => {
    const fetcher = stubFetch({
      "/api/v1/mark-price/XBTUSDTM/current": {
        code: "200000",
        data: { symbol: "XBTUSDTM", value: 69_572.05 },
      },
    })
    await fetchKucoinPrices("mainnet", ["XBTUSDTM"])
    await fetchKucoinPrices("mainnet", ["XBTUSDTM"])
    // The engine's pass runs every second and asks every time; one small read
    // stands for two of them.
    expect(fetcher.mock.calls.length).toBe(1)
  })
})

describe("KuCoin networks", () => {
  it("refuses to answer for a practice network it does not have", async () => {
    stubFetch({ "/api/v1/contracts/active": CONTRACTS })
    await expect(fetchKucoinMarkets("testnet")).rejects.toThrow(
      "KUCOIN_NETWORK_UNSUPPORTED"
    )
  })
})
