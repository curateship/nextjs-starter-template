import { describe, expect, it } from "vitest"

import type { LiveFill } from "@/lib/trade/live-trades"
import { positionFees } from "@/lib/trade/position-fees"
import { fillSlippage, fillsSlippage } from "@/lib/trade/slippage"

/**
 * Slippage, "aimed vs filled" (Tyler, 10 Nov 2026): the price an order was
 * first placed at against the price it filled at, in dollars, signed like
 * money made or lost. One worked number: a buy of 2 coins aimed at $100 that
 * filled at $101 paid $2 more than aimed, so it reads -$2.
 */

const KEY = "hyperliquid:mainnet:BTC"

function fill(one: Partial<LiveFill> & Pick<LiveFill, "side" | "px" | "sz">): LiveFill {
  return {
    fillId: one.fillId ?? `${one.side}-${one.px}-${one.sz}`,
    orderId: "order",
    walletId: "main",
    marketKey: KEY,
    at: one.at ?? 1,
    closedPnl: 0,
    fee: 0,
    dir: one.side === "buy" ? "Open Long" : "Close Long",
    liquidation: false,
    ...one,
  }
}

describe("one fill's slippage", () => {
  it("is a cost when a buy fills above its aim or a sell below it", () => {
    expect(fillSlippage({ side: "buy", px: 101, aimedPx: 100 }, 2)).toBe(-2)
    expect(fillSlippage({ side: "sell", px: 99, aimedPx: 100 }, 2)).toBe(-2)
  })

  it("is money saved when the fill beats its aim", () => {
    expect(fillSlippage({ side: "buy", px: 99, aimedPx: 100 }, 2)).toBe(2)
    expect(fillSlippage({ side: "sell", px: 101, aimedPx: 100 }, 2)).toBe(2)
  })

  it("is zero for a fill at its aim, which is not the same as unknown", () => {
    expect(fillSlippage({ side: "buy", px: 100, aimedPx: 100 }, 3)).toBe(0)
  })

  it("is unknown without a usable aim", () => {
    expect(fillSlippage({ side: "buy", px: 100 }, 1)).toBeNull()
    expect(fillSlippage({ side: "buy", px: 100, aimedPx: null }, 1)).toBeNull()
    expect(fillSlippage({ side: "buy", px: 100, aimedPx: 0 }, 1)).toBeNull()
    expect(fillSlippage({ side: "buy", px: 100, aimedPx: Number.NaN }, 1)).toBeNull()
  })
})

describe("a Journal row's slippage, over all its fills", () => {
  it("adds every fill, the way in and the way out", () => {
    expect(
      fillsSlippage([
        fill({ side: "buy", px: 101, sz: 2, aimedPx: 100 }),
        fill({ side: "sell", px: 110, sz: 2, aimedPx: 109 }),
      ])
    ).toBe(0)
    expect(
      fillsSlippage([
        fill({ side: "buy", px: 101, sz: 2, aimedPx: 100 }),
        fill({ side: "sell", px: 108, sz: 2, aimedPx: 109 }),
      ])
    ).toBe(-4)
  })

  it("is a dash when any fill has no aim, rather than a short total", () => {
    expect(
      fillsSlippage([
        fill({ side: "buy", px: 101, sz: 2, aimedPx: 100 }),
        fill({ side: "sell", px: 108, sz: 2 }),
      ])
    ).toBeNull()
    expect(fillsSlippage([])).toBeNull()
  })
})

describe("an open position's slippage", () => {
  const position = { walletId: "main", marketKey: KEY, szi: 3 }

  it("counts only the part of a fill that built the position", () => {
    // Long 3 now: the newest buy of 2, then 1 of an older buy of 4.
    const fills = [
      fill({ fillId: "a", at: 1, side: "buy", px: 102, sz: 4, aimedPx: 100 }),
      fill({ fillId: "b", at: 2, side: "sell", px: 104, sz: 4, aimedPx: 104 }),
      fill({ fillId: "c", at: 3, side: "buy", px: 101, sz: 2, aimedPx: 100 }),
      fill({ fillId: "d", at: 4, side: "buy", px: 103, sz: 1, aimedPx: 100 }),
    ]
    // d: 1 × -$3, c: 2 × -$1, then the walk is whole at 3 coins.
    expect(positionFees(fills, position)?.slippage).toBe(-5)
  })

  it("is a dash when a counted fill has no aim", () => {
    const fills = [
      fill({ fillId: "c", at: 3, side: "buy", px: 101, sz: 2, aimedPx: 100 }),
      fill({ fillId: "d", at: 4, side: "buy", px: 103, sz: 1 }),
    ]
    expect(positionFees(fills, position)?.slippage).toBeNull()
  })

  it("is a dash when the fills on hand do not reach the position's start", () => {
    const fills = [fill({ fillId: "d", at: 4, side: "buy", px: 103, sz: 1, aimedPx: 100 })]
    expect(positionFees(fills, position)?.whole).toBe(false)
    expect(positionFees(fills, position)?.slippage).toBeNull()
  })
})
