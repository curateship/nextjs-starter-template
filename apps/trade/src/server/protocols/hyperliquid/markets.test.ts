import { describe, expect, it } from "vitest"

import { toMarketRows } from "@/server/protocols/hyperliquid/markets"

/** A trimmed, real-shaped `metaAndAssetCtxs` answer: two live coins, one delisted. */
const RESPONSE: Parameters<typeof toMarketRows>[0] = [
  {
    universe: [
      { name: "BTC", szDecimals: 5, maxLeverage: 40 },
      { name: "OLD", isDelisted: true },
      { name: "SOL", szDecimals: 2, maxLeverage: 20, onlyIsolated: true },
    ],
  },
  [
    {
      markPx: "67400",
      prevDayPx: "66000",
      dayNtlVlm: "1500000000",
      funding: "0.0000125",
      openInterest: "12000",
    },
    {
      markPx: "1",
      prevDayPx: "1",
      dayNtlVlm: "0",
      funding: "0",
      openInterest: "0",
    },
    {
      markPx: "142.38",
      prevDayPx: "139.03",
      dayNtlVlm: "1240000000",
      funding: "0.0000410",
      openInterest: "622000",
    },
  ],
]

/** One sub-exchange answer, its asset namespaced the way the wire sends it. */
const SUB_RESPONSE: Parameters<typeof toMarketRows>[0] = [
  { universe: [{ name: "xyz:AAPL" }, { name: "BARE" }] },
  [
    {
      markPx: "212.5",
      prevDayPx: "210",
      dayNtlVlm: "9000000",
      funding: "0",
      openInterest: "40000",
    },
    {
      markPx: "5",
      prevDayPx: "5",
      dayNtlVlm: "1000",
      funding: "0",
      openInterest: "10",
    },
  ],
]

const XYZ = { name: "xyz", fullName: "XYZ Markets" }

describe("turning Hyperliquid's answer into market rows", () => {
  const rows = toMarketRows(RESPONSE, "mainnet")

  it("keeps live markets and drops delisted ones", () => {
    expect(rows.map((row) => row.symbol)).toEqual(["BTC", "SOL"])
  })

  it("keys every row by protocol, network and id", () => {
    expect(rows[0].key).toBe("hyperliquid:mainnet:BTC")
    expect(rows[0].subExchange).toBeNull()
  })

  it("carries the exchange's own coin art as data", () => {
    // Screens draw this URL; none of them may ever build it.
    expect(rows[0].iconUrl).toBe("https://app.hyperliquid.xyz/coins/BTC.svg")
  })

  it("translates the figures, not just copies the strings", () => {
    const btc = rows[0]
    expect(btc.price).toBe(67400)
    expect(btc.change24h).toBeCloseTo((67400 - 66000) / 66000)
    expect(btc.volume24hUsd).toBe(1_500_000_000)
    expect(btc.fundingHourly).toBeCloseTo(0.0000125)
    // Open interest arrives in coins and is worth coins × price in dollars.
    expect(btc.openInterestUsd).toBeCloseTo(12000 * 67400)
  })

  it("carries the market's ground rules, and honestly says when one is missing", () => {
    const [btc, sol] = toMarketRows(RESPONSE, "mainnet")
    expect(btc.sizeDecimals).toBe(5)
    expect(btc.maxLeverage).toBe(40)
    expect(btc.isolatedOnly).toBe(false)
    expect(sol.isolatedOnly).toBe(true)
    // A venue that states no rules shows nothing, never a guess.
    const [bare] = toMarketRows(
      [
        { universe: [{ name: "MYSTERY" }] },
        [
          {
            markPx: "1",
            prevDayPx: "1",
            dayNtlVlm: "1",
            funding: "0",
            openInterest: "0",
          },
        ],
      ],
      "mainnet"
    )
    expect(bare.sizeDecimals).toBeNull()
    expect(bare.maxLeverage).toBeNull()
  })

  it("translates the exchange's categories into the app's, keyed by raw name", () => {
    const categories = new Map([
      ["BTC", "crypto"],
      ["xyz:AAPL", "preipo"],
    ])
    const [btc] = toMarketRows(RESPONSE, "mainnet", null, categories)
    expect(btc.category).toBe("crypto")
    const [aapl] = toMarketRows(SUB_RESPONSE, "mainnet", XYZ, categories)
    // "preipo" is the exchange's word; the app says stocks.
    expect(aapl.category).toBe("stocks")
    // Uncategorised: crypto on the main exchange, other on a venue.
    const [sol] = toMarketRows(RESPONSE, "mainnet").slice(1)
    expect(sol.category).toBe("crypto")
    const [bare] = toMarketRows(SUB_RESPONSE, "mainnet", XYZ).slice(1)
    expect(bare.category).toBe("other")
  })

  it("drops a market whose price is junk instead of showing NaN", () => {
    const rowsWithJunk = toMarketRows(
      [
        { universe: [{ name: "BAD" }] },
        [
          {
            markPx: "not-a-number",
            prevDayPx: "1",
            dayNtlVlm: "1",
            funding: "0",
            openInterest: "0",
          },
        ],
      ],
      "mainnet"
    )
    expect(rowsWithJunk).toEqual([])
  })
})

describe("sub-exchange markets", () => {
  const subRows = toMarketRows(SUB_RESPONSE, "mainnet", XYZ)

  it("keeps ids unique across venues — namespaced even when the wire sends a bare name", () => {
    expect(subRows.map((row) => row.marketId)).toEqual([
      "xyz:AAPL",
      "xyz:BARE",
    ])
    // The already-namespaced asset is not double-prefixed.
    expect(subRows[0].key).toBe("hyperliquid:mainnet:xyz:AAPL")
  })

  it("never collides with a main-exchange market of the same coin name", () => {
    const main = toMarketRows(RESPONSE, "mainnet")
    const sub = toMarketRows(
      [
        { universe: [{ name: "xyz:BTC" }] },
        [
          {
            markPx: "67000",
            prevDayPx: "66000",
            dayNtlVlm: "1000",
            funding: "0",
            openInterest: "1",
          },
        ],
      ],
      "mainnet",
      XYZ
    )
    const keys = [...main, ...sub].map((row) => row.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("labels the venue and files the coin art under the bare symbol", () => {
    expect(subRows[0].subExchange).toBe("XYZ Markets")
    expect(subRows[0].iconUrl).toBe(
      "https://app.hyperliquid.xyz/coins/AAPL.svg"
    )
  })
})
