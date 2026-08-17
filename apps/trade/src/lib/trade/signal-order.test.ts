import { describe, expect, it } from "vitest"

import { roundOrderPx } from "@/lib/protocols/hyperliquid/translate"
import { isMarketable } from "@/lib/trade/paper"
import {
  chaseCeilingPx,
  chaseWorthMoving,
  CHASE_MAX_OFFSET,
  restingChasePx,
} from "@/lib/trade/signal-order"

/**
 * The one promise the whole Signals step rests on: it asks for a price, it
 * never takes one. Everything here is about the moment that promise is easiest
 * to break — rounding.
 */

// Real market shapes: fractions of a cent up to six figures, against every
// size step Hyperliquid uses.
const PRICES = [0.00012, 0.0345, 0.5, 1, 2.5, 19.87, 100, 1234, 45678, 123456, 1e6]
const STEPS = [0, 1, 2, 3, 4, 5, 6]

describe("pricing an order that has to rest", () => {
  it("never lands on or through the market, on any grid", () => {
    // This is the bug it was written for. The exchange rounds to the NEAREST
    // step, so on a coarse grid a price a whisker under the market rounds
    // straight back onto it — and an order AT the market is a market order.
    // The real exchange refuses it; the practice engine fills it. Every ten
    // seconds, forever, on that coin.
    const broken: string[] = []
    for (const sizeDecimals of STEPS) {
      for (const mark of PRICES) {
        const roundPx = (px: number) => roundOrderPx(px, sizeDecimals)
        for (const side of ["buy", "sell"] as const) {
          const px = restingChasePx(side, mark, roundPx)
          if (px === null) continue
          if (px <= 0) broken.push(`${side} step=${sizeDecimals} mark=${mark} -> ${px}`)
          if (isMarketable(side, px, mark)) {
            broken.push(`${side} step=${sizeDecimals} mark=${mark} -> ${px}`)
          }
        }
      }
    }
    expect(broken).toEqual([])
  })

  it("asks for a better price, never a worse one", () => {
    // Stepping away from the market to find a grid point costs queue position,
    // never money: further under for a buy, further over for a sell.
    for (const sizeDecimals of STEPS) {
      for (const mark of PRICES) {
        const roundPx = (px: number) => roundOrderPx(px, sizeDecimals)
        const buy = restingChasePx("buy", mark, roundPx)
        const sell = restingChasePx("sell", mark, roundPx)
        if (buy !== null) expect(buy).toBeLessThan(mark)
        if (sell !== null) expect(sell).toBeGreaterThan(mark)
      }
    }
  })

  it("stays close when the grid is fine enough to allow it", () => {
    // It must not wander off to the far end of its allowance on a normal coin.
    const px = restingChasePx("buy", 100, (one) => roundOrderPx(one, 2))
    expect(px).not.toBeNull()
    expect(100 - (px as number)).toBeLessThan(100 * CHASE_MAX_OFFSET)
  })

  it("gives up rather than guess when nothing on the grid rests", () => {
    // A grid so coarse that every price within the allowance rounds onto the
    // market. Refusing is the honest answer; sending one is an order that is
    // turned down on every pass.
    const px = restingChasePx("buy", 100, () => 100)
    expect(px).toBeNull()
  })

  it("says nothing about a price that is not a price", () => {
    expect(restingChasePx("buy", 0, (one) => one)).toBeNull()
    expect(restingChasePx("sell", -1, (one) => one)).toBeNull()
  })
})

/**
 * How far a chased buy will follow a price that runs, and when it bothers
 * moving. Neither had a test, and both decide whether a signal buys at all.
 */
describe("the ceiling a chase will not buy above", () => {
  it("is that share above the price the arrow appeared at", () => {
    expect(chaseCeilingPx({ signalPx: 100, chaseGiveUp: 0.02 })).toBeCloseTo(
      102,
      9
    )
    expect(chaseCeilingPx({ signalPx: 0.0004, chaseGiveUp: 0.05 })).toBeCloseTo(
      0.00042,
      12
    )
  })

  it("is the signal price itself when it will not chase at all", () => {
    expect(chaseCeilingPx({ signalPx: 100, chaseGiveUp: 0 })).toBe(100)
  })
})

describe("whether a resting chase is worth moving", () => {
  it("always places one when nothing is resting yet", () => {
    expect(chaseWorthMoving(null, 100)).toBe(true)
  })

  it("leaves an order that has barely drifted alone", () => {
    // Cancelling and replacing for a tenth of a percent spends the wallet's
    // request allowance for a price nobody would notice.
    expect(chaseWorthMoving(100, 100)).toBe(false)
    expect(chaseWorthMoving(100.05, 100)).toBe(false)
  })

  it("moves it once the gap is worth more than the drift it allows", () => {
    expect(chaseWorthMoving(100.2, 100)).toBe(true)
    expect(chaseWorthMoving(99.8, 100)).toBe(true)
  })

  it("measures the gap as a share of the price, not in dollars", () => {
    // A cent is nothing on a $100 coin and everything on a $0.001 one.
    expect(chaseWorthMoving(0.001, 0.0011)).toBe(true)
    expect(chaseWorthMoving(10_000, 10_001)).toBe(false)
  })
})
