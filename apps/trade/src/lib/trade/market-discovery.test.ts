import { describe, expect, it } from "vitest"
import { fundingPerDay, isSurging, marketPace } from "./market-discovery"
import { MarketHistory } from "./market-history"
import { ExplorerArrivals } from "./explorer-arrivals"

const minute = (traded: number) => ({ traded, move: 0, fraction: 0 })
describe("market discovery", () => {
  it("ranks six times usual and requires enough traded dollars for a badge", () => {
    expect(marketPace(14_400_000, minute(60_000))).toBe(6)
    expect(isSurging(14_400_000, minute(60_000))).toBe(true)
    expect(isSurging(100, minute(9999))).toBe(false)
    expect(isSurging(100, minute(10_000))).toBe(true)
    expect(marketPace(0, minute(10_000))).toBeNull()
    expect(marketPace(1, null)).toBeNull()
  })
  it("shows a paying long as lost dollars and a receiving short as made dollars", () => {
    expect(fundingPerDay(0.0001, "long")).toBeCloseTo(-2.4)
    expect(fundingPerDay(0.0001, "short")).toBeCloseTo(2.4)
    expect(fundingPerDay(null, "long")).toBeNull()
    expect(fundingPerDay(0, "long")).toBe(-0)
  })
  it("requires ten fresh unchanged minutes and forgets stillness after a reconnect", () => {
    const history = new MarketHistory()
    const start = 1_000_000
    for (let second = 0; second <= 600; second++)
      history.sample("coin", start + second * 1000, 10, 100)
    expect(history.quiet("coin", start + 599_000)).toBe(false)
    expect(history.quiet("coin", start + 600_000)).toBe(true)
    expect(history.quiet("coin", start + 631_000)).toBe(false)
    history.sample("coin", start + 632_000, 10, 100)
    expect(history.quiet("coin", start + 632_000)).toBe(false)
    history.clear("coin")
    expect(history.quiet("coin", start + 633_000)).toBe(false)
  })
  it("does not invent a sparkline before 30 samples or keep one after a gap", () => {
    const history = new MarketHistory()
    for (let second = 0; second < 29; second++)
      history.sample("coin", 1_000_000 + second * 1000, 10 + second, 100)
    expect(history.prices("coin", 1_028_000)).toEqual([])
    history.sample("coin", 1_029_000, 39, 100)
    expect(history.prices("coin", 1_029_000)).toHaveLength(30)
    history.sample("coin", 1_070_000, 39, 100)
    expect(history.prices("coin", 1_070_000)).toEqual([])
  })
  it("suppresses initial arrivals and collapses sound bursts after interaction", () => {
    const arrivals = new ExplorerArrivals()
    const rows = Array.from({ length: 11 }, (_, i) => ({
      key: `${i}`,
      symbol: `${i}`,
      pace: 1,
    }))
    expect(arrivals.update(rows, "pace", 5, 1000)).toEqual([])
    const next = [{ ...rows[10], pace: 6 }, ...rows.slice(0, 10)]
    expect(arrivals.update(next, "pace", 5, 2000)).toMatchObject([
      { key: "10", reason: "Pace" },
    ])
    expect(arrivals.allowSound(2000, false, true)).toBe(false)
    expect(arrivals.allowSound(2000, true, false)).toBe(false)
    expect(arrivals.allowSound(2000, true, true)).toBe(true)
    expect(arrivals.allowSound(11_999, true, true)).toBe(false)
    expect(arrivals.allowSound(12_000, true, true)).toBe(true)
    expect(arrivals.update(rows, "different sort", 5, 13_000)).toEqual([])
  })
})
