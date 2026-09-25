import { describe, expect, it } from "vitest"

import { positionFees } from "@/lib/trade/position-fees"
import type { LiveFill } from "@/lib/trade/live-trades"
import type { TradePosition } from "@/lib/trade/paper"

/**
 * What a real position has cost in fees.
 *
 * The figures are already in the database, one `fee` per fill. The only hard
 * part is where to start adding: a coin can have been traded for months, and
 * only the fills that built the position now held belong to the total. The
 * exchange's own size is what marks the boundary, so these check the walk
 * lands on it — including the two cases that would quietly print a wrong
 * number, a fill that flips the position and a history too short to reach the
 * opening.
 */

const KEY = "hyperliquid:mainnet:BTC"

function fill(one: {
  id: string
  at: number
  side: "buy" | "sell"
  sz: number
  fee: number
  dir?: string
}): LiveFill {
  return {
    fillId: one.id,
    orderId: one.id,
    walletId: "main",
    marketKey: KEY,
    side: one.side,
    px: 100,
    sz: one.sz,
    at: one.at,
    closedPnl: 0,
    fee: one.fee,
    dir: one.dir ?? (one.side === "buy" ? "Open Long" : "Close Long"),
    liquidation: false,
  }
}

function held(szi: number): Pick<
  TradePosition,
  "walletId" | "marketKey" | "szi"
> {
  return { walletId: "main", marketKey: KEY, szi }
}

describe("what an open position has cost in fees", () => {
  it("adds up only the fills that built the position now held", () => {
    // Bought 1, sold it all, then bought 2 and still holds them. The first
    // round trip is a finished trade and its fees are not this position's.
    const fees = positionFees(
      [
        fill({ id: "a", at: 1_000, side: "buy", sz: 1, fee: 0.5 }),
        fill({ id: "b", at: 2_000, side: "sell", sz: 1, fee: 0.5 }),
        fill({ id: "c", at: 3_000, side: "buy", sz: 1, fee: 0.25 }),
        fill({ id: "d", at: 4_000, side: "buy", sz: 1, fee: 0.25 }),
      ],
      held(2)
    )
    expect(fees).not.toBeNull()
    expect(fees?.paid).toBeCloseTo(0.5, 10)
    expect(fees?.countedFrom).toBe(3_000)
    expect(fees?.countedFills).toBe(2)
    expect(fees?.whole).toBe(true)
  })

  it("counts a part-close inside the position's life", () => {
    // Eight buys down and four rungs back out is twelve fees, and every one of
    // them was charged against the position still open.
    const fees = positionFees(
      [
        fill({ id: "a", at: 1_000, side: "buy", sz: 3, fee: 0.3 }),
        fill({ id: "b", at: 2_000, side: "sell", sz: 1, fee: 0.1 }),
        fill({ id: "c", at: 3_000, side: "buy", sz: 1, fee: 0.1 }),
      ],
      held(3)
    )
    expect(fees?.paid).toBeCloseTo(0.5, 10)
    expect(fees?.countedFrom).toBe(1_000)
    expect(fees?.countedFills).toBe(3)
    expect(fees?.whole).toBe(true)
  })

  it("shares the fee of a fill that flips the position", () => {
    // One row that shuts a 1-coin long and opens a 2-coin short: the venue
    // charged $0.90 on all three coins, and only two of them belong to the
    // short now held.
    const fees = positionFees(
      [
        fill({ id: "a", at: 1_000, side: "buy", sz: 1, fee: 0.1 }),
        fill({
          id: "b",
          at: 2_000,
          side: "sell",
          sz: 3,
          fee: 0.9,
          dir: "Long > Short",
        }),
      ],
      held(-2)
    )
    expect(fees?.paid).toBeCloseTo(0.6, 10)
    expect(fees?.countedFills).toBe(1)
    expect(fees?.whole).toBe(true)
  })

  it("says the count is short when the fills do not reach the opening", () => {
    // The position holds 5 and the only fill on hand accounts for 2 of them.
    // A total of $0.20 is true about what it can see and false about the
    // position, so it says so rather than printing $0.20 as the whole answer.
    const fees = positionFees(
      [fill({ id: "a", at: 9_000, side: "buy", sz: 2, fee: 0.2 })],
      held(5)
    )
    expect(fees?.paid).toBeCloseTo(0.2, 10)
    expect(fees?.whole).toBe(false)
    expect(fees?.countedFrom).toBe(9_000)
  })

  it("gives no answer at all when nothing has been swept", () => {
    expect(positionFees([], held(2))).toBeNull()
  })

  it("ignores another wallet's and another coin's fills", () => {
    const other: LiveFill = {
      ...fill({ id: "z", at: 5_000, side: "buy", sz: 2, fee: 9 }),
      walletId: "second",
    }
    const otherCoin: LiveFill = {
      ...fill({ id: "y", at: 5_000, side: "buy", sz: 2, fee: 9 }),
      marketKey: "hyperliquid:mainnet:ETH",
    }
    expect(positionFees([other, otherCoin], held(2))).toBeNull()
  })

  it("has nothing to say about a position that is not held", () => {
    expect(
      positionFees(
        [fill({ id: "a", at: 1_000, side: "buy", sz: 1, fee: 0.5 })],
        held(0)
      )
    ).toBeNull()
  })

  it("keeps a maker rebate negative rather than calling it nothing", () => {
    const fees = positionFees(
      [fill({ id: "a", at: 1_000, side: "buy", sz: 1, fee: -0.02 })],
      held(1)
    )
    expect(fees?.paid).toBeCloseTo(-0.02, 10)
    expect(fees?.whole).toBe(true)
  })
})
