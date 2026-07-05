import { describe, expect, it } from "vitest"

import { applyPaperFill, capReduceOnly, walkBookDepth } from "./paper-math"

describe("applyPaperFill", () => {
  it("opens a long and charges the fee", () => {
    const result = applyPaperFill(null, 10_000, "buy", 100, 2, 0.00045)
    expect(result.position).toEqual({ szi: 2, entryPx: 100 })
    expect(result.closedPnl).toBe(0)
    expect(result.fee).toBeCloseTo(0.09, 10)
    expect(result.cash).toBeCloseTo(10_000 - 0.09, 10)
  })

  it("averages entry when increasing a position", () => {
    const opened = applyPaperFill(null, 10_000, "buy", 100, 1, 0)
    const grown = applyPaperFill(opened.position, opened.cash, "buy", 110, 1, 0)
    expect(grown.position).toEqual({ szi: 2, entryPx: 105 })
  })

  it("realizes pnl when reducing and closing", () => {
    const opened = applyPaperFill(null, 10_000, "buy", 100, 2, 0)
    const closed = applyPaperFill(opened.position, opened.cash, "sell", 110, 2, 0)
    expect(closed.position).toBeNull()
    expect(closed.closedPnl).toBe(20)
    expect(closed.cash).toBe(10_020)
  })

  it("flips through zero into the opposite side at the fill price", () => {
    const opened = applyPaperFill(null, 10_000, "buy", 100, 1, 0)
    const flipped = applyPaperFill(opened.position, opened.cash, "sell", 90, 3, 0)
    expect(flipped.position).toEqual({ szi: -2, entryPx: 90 })
    expect(flipped.closedPnl).toBe(-10)
  })

  it("handles shorts symmetrically", () => {
    const opened = applyPaperFill(null, 10_000, "sell", 100, 2, 0)
    const closed = applyPaperFill(opened.position, opened.cash, "buy", 90, 2, 0)
    expect(closed.closedPnl).toBe(20)
  })
})

describe("capReduceOnly", () => {
  it("caps at the position size and rejects wrong direction", () => {
    expect(capReduceOnly({ szi: 2, entryPx: 100 }, "sell", 5)).toBe(2)
    expect(capReduceOnly({ szi: 2, entryPx: 100 }, "buy", 1)).toBeNull()
    expect(capReduceOnly(null, "sell", 1)).toBeNull()
  })
})

describe("walkBookDepth", () => {
  it("averages across levels and uses the worst level for overflow", () => {
    const levels = [
      { px: "100", sz: "1" },
      { px: "101", sz: "1" },
    ]
    expect(walkBookDepth(levels, 1)).toBe(100)
    expect(walkBookDepth(levels, 2)).toBe(100.5)
    expect(walkBookDepth(levels, 4)).toBe((100 + 101 * 3) / 4)
    expect(walkBookDepth([], 1)).toBeNull()
  })
})
