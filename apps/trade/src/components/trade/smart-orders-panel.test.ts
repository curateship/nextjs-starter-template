import { describe, expect, it } from "vitest"

import { bankedBy } from "@/components/trade/smart-orders-panel"
import type { LiveFill } from "@/lib/trade/live-trades"
import type { SmartOrder } from "@/lib/trade/smart-plan"

/**
 * What the Smart orders panel counts as a sale, and what it says the sale made.
 *
 * The case that matters is a venue that does not price a partial close. KuCoin
 * reports money per POSITION closed, and a grid selling a fifth of what it
 * holds never closes one, so its sells arrive with no profit on them. The panel
 * used to read that as "not a sale" and told Tyler "Nothing sold yet" about a
 * grid that had plainly recycled a level on the chart.
 */

const PLACED_AT = 1_000

const order = {
  walletId: "w1",
  marketKey: "kucoin:mainnet:SOLUSDTM",
  createdAt: PLACED_AT,
} as SmartOrder

function fill(over: Partial<LiveFill>): LiveFill {
  return {
    fillId: "f1",
    orderId: "o1",
    walletId: "w1",
    marketKey: "kucoin:mainnet:SOLUSDTM",
    side: "sell",
    px: 89.35,
    sz: 0.2,
    at: PLACED_AT + 1_000,
    closedPnl: 0,
    fee: 0.010722,
    dir: "Sell",
    liquidation: false,
    ...over,
  }
}

describe("bankedBy", () => {
  it("counts a sell the venue put no figure on", () => {
    const banked = bankedBy(order, [fill({})], [])
    expect(banked.sells).toHaveLength(1)
    expect(banked.sells[0].px).toBeCloseTo(89.35, 9)
    // Null, never zero. Zero is a real answer meaning the sale broke even, and
    // printing it for a sale that made money is the kind of wrong that gets
    // believed.
    expect(banked.sells[0].money).toBeNull()
    expect(banked.unpriced).toBe(1)
    expect(banked.total).toBe(0)
  })

  it("uses the venue's figure when there is one, fee taken off", () => {
    const banked = bankedBy(
      order,
      [fill({ closedPnl: 0.35, fee: 0.01 })],
      []
    )
    expect(banked.sells[0].money).toBeCloseTo(0.34, 9)
    expect(banked.unpriced).toBe(0)
    expect(banked.total).toBeCloseTo(0.34, 9)
  })

  it("leaves the buys out", () => {
    const banked = bankedBy(
      order,
      [fill({ fillId: "b1", side: "buy", dir: "Buy" })],
      []
    )
    expect(banked.sells).toHaveLength(0)
  })

  it("still counts a short bought back, which a sell test cannot see", () => {
    const banked = bankedBy(
      order,
      [fill({ side: "buy", dir: "Close Short", closedPnl: 1.2, fee: 0.02 })],
      []
    )
    expect(banked.sells).toHaveLength(1)
    expect(banked.sells[0].money).toBeCloseTo(1.18, 9)
  })

  it("ignores another wallet, another coin, and anything older than the order", () => {
    const banked = bankedBy(
      order,
      [
        fill({ fillId: "a", walletId: "w2" }),
        fill({ fillId: "b", marketKey: "kucoin:mainnet:BTCUSDTM" }),
        fill({ fillId: "c", at: PLACED_AT - 1 }),
      ],
      []
    )
    expect(banked.sells).toHaveLength(0)
  })
})

/**
 * What the panel says a grid has banked.
 *
 * The real CHIP grid on 22 Aug 2026. Five levels held, the cheapest one sold,
 * and the panel read "-$1.15 banked" on a level that put $4.28 in the account,
 * because the venue books every partial sell against the position average and
 * the four expensive levels still holding were holding that average up.
 */
describe("bankedBy on a grid", () => {
  const grid = {
    walletId: "w1",
    marketKey: "hyperliquid:mainnet:CHIP",
    createdAt: PLACED_AT,
  } as SmartOrder

  const chip = (over: Partial<LiveFill>): LiveFill =>
    fill({
      marketKey: "hyperliquid:mainnet:CHIP",
      dir: "Open Long",
      grid: true,
      ...over,
    })

  const buys = [
    chip({ fillId: "b1", side: "buy", px: 0.034614, sz: 1403, fee: 0.021853, at: PLACED_AT + 1 }),
    chip({ fillId: "b2", side: "buy", px: 0.03333, sz: 1470, fee: 0.022047, at: PLACED_AT + 2 }),
    chip({ fillId: "b3", side: "buy", px: 0.030929, sz: 1543, fee: 0.021475, at: PLACED_AT + 3 }),
    chip({ fillId: "b4", side: "buy", px: 0.028927, sz: 1624, fee: 0.021139, at: PLACED_AT + 4 }),
    chip({ fillId: "b5", side: "buy", px: 0.027746, sz: 1713, fee: 0.021388, at: PLACED_AT + 5 }),
  ]
  const sell = chip({
    fillId: "s1",
    side: "sell",
    px: 0.030268,
    sz: 1713,
    fee: 0.023332,
    closedPnl: -1.13058,
    dir: "Close Long",
    at: PLACED_AT + 6,
  })

  it("pays the level that sold, not the position average", () => {
    const banked = bankedBy(grid, [...buys, sell], [])
    expect(banked.sells).toHaveLength(1)
    expect(banked.total).toBeCloseTo(4.2755, 3)
    expect(banked.unpriced).toBe(0)
  })

  it("keeps the venue's figure when the fills are not a grid's", () => {
    const banked = bankedBy(
      grid,
      [...buys, sell].map((one) => ({ ...one, grid: false })),
      []
    )
    expect(banked.total).toBeCloseTo(-1.15391, 4)
  })
})
