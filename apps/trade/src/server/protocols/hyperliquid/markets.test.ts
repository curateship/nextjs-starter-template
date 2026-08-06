import { describe, expect, it } from "vitest"

import { toMarketRows } from "@/server/protocols/hyperliquid/markets"

/** A trimmed, real-shaped `metaAndAssetCtxs` answer: two live coins, one delisted. */
const RESPONSE: Parameters<typeof toMarketRows>[0] = [
  {
    universe: [
      { name: "BTC" },
      { name: "OLD", isDelisted: true },
      { name: "SOL" },
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

describe("turning Hyperliquid's answer into market rows", () => {
  const rows = toMarketRows(RESPONSE, "mainnet")

  it("keeps live markets and drops delisted ones", () => {
    expect(rows.map((row) => row.symbol)).toEqual(["BTC", "SOL"])
  })

  it("keys every row by protocol, network and id", () => {
    expect(rows[0].key).toBe("hyperliquid:mainnet:BTC")
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
