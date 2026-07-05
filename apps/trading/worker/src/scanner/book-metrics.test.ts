import { describe, expect, it } from "vitest"

import { bookMetrics, type BookLevel } from "./book-metrics"

function levels(
  startPx: number,
  step: number,
  count: number,
  sz = 1
): BookLevel[] {
  return Array.from({ length: count }, (_, i) => ({
    px: String(startPx + step * i),
    sz: String(sz),
  }))
}

describe("bookMetrics", () => {
  it("returns null for an empty book", () => {
    expect(bookMetrics([], [])).toBeNull()
  })

  it("computes mid, spread, and band liquidity", () => {
    const bids = levels(99.9, -0.1, 30) // 99.9 down
    const asks = levels(100.1, 0.1, 30) // 100.1 up
    const result = bookMetrics(bids, asks)
    expect(result).not.toBeNull()
    expect(result!.mid).toBeCloseTo(100, 5)
    expect(result!.spreadBps).toBeCloseTo(20, 0)
    // 0.5% band: prices within [99.5, 100] on bid side → 5 levels ≈ $500.
    expect(result!.bands[0].bidUsd).toBeGreaterThan(400)
    expect(result!.bands[0].bidUsd).toBeLessThan(600)
    // 1% band should hold roughly double the 0.5% band.
    expect(result!.bands[1].bidUsd).toBeGreaterThan(result!.bands[0].bidUsd)
    expect(result!.imbalance).toBeCloseTo(1, 1)
  })

  it("reports bid-heavy imbalance", () => {
    const bids = levels(99.9, -0.1, 20, 3)
    const asks = levels(100.1, 0.1, 20, 1)
    const result = bookMetrics(bids, asks)
    expect(result!.imbalance).toBeGreaterThan(2.5)
  })

  it("detects walls above the median multiple and USD floor", () => {
    const bids = levels(99.9, -0.1, 20, 100) // $10k per level, no walls
    bids[3] = { px: bids[3].px, sz: "1000" } // ~$99.6k, 10x median
    const asks = levels(100.1, 0.1, 20, 100)
    const result = bookMetrics(bids, asks)
    expect(result!.walls).toHaveLength(1)
    expect(result!.walls[0]).toMatchObject({ side: "bid" })
    expect(result!.walls[0].usd).toBeGreaterThan(50_000)
  })

  it("ignores large levels below the USD floor", () => {
    const bids = levels(99.9, -0.1, 20, 1) // $100 per level
    bids[3] = { px: bids[3].px, sz: "10" } // 10x median but only ~$1k
    const asks = levels(100.1, 0.1, 20, 1)
    const result = bookMetrics(bids, asks)
    expect(result!.walls).toHaveLength(0)
  })
})
