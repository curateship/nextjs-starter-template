import { describe, expect, it } from "vitest"

import { classifyWallet, type ClassifyInput } from "./classify"
import {
  computeAvgHoldMinutes,
  computeFillStats,
  downsampleHistory,
  extractAccountValue,
  extractWindowPnl,
  type FillLike,
} from "./stats-math"

const T0 = 1_750_000_000_000
const DAY = 86_400_000

function fill(overrides: Partial<FillLike>): FillLike {
  return {
    coin: "BTC",
    px: "100000",
    sz: "1",
    side: "B",
    time: T0,
    startPosition: "0",
    closedPnl: "0",
    dir: "Open Long",
    crossed: true,
    ...overrides,
  }
}

describe("computeFillStats", () => {
  it("returns nulls for an empty fill set", () => {
    const stats = computeFillStats([])
    expect(stats.fillCount).toBe(0)
    expect(stats.winRate).toBeNull()
    expect(stats.avgTradeNotional).toBeNull()
    expect(stats.topCoins).toEqual([])
  })

  it("computes win rate over closing fills only", () => {
    const fills = [
      fill({ dir: "Open Long" }),
      fill({ dir: "Close Long", side: "A", startPosition: "1", closedPnl: "500" }),
      fill({ dir: "Open Long" }),
      fill({ dir: "Close Long", side: "A", startPosition: "1", closedPnl: "-200" }),
    ]
    const stats = computeFillStats(fills)
    expect(stats.winRate).toBe(0.5)
    expect(stats.largestWin).toBe(500)
    expect(stats.largestLoss).toBe(-200)
  })

  it("ranks top coins by notional", () => {
    const fills = [
      fill({ coin: "BTC", px: "100000", sz: "2" }),
      fill({ coin: "ETH", px: "2000", sz: "10" }),
      fill({ coin: "ETH", px: "2000", sz: "5" }),
    ]
    const stats = computeFillStats(fills)
    expect(stats.topCoins[0].coin).toBe("BTC")
    expect(stats.topCoins[1]).toMatchObject({ coin: "ETH", fills: 2 })
  })

  it("computes taker ratio", () => {
    const fills = [fill({ crossed: true }), fill({ crossed: false })]
    expect(computeFillStats(fills).takerRatio).toBe(0.5)
  })
})

describe("computeAvgHoldMinutes", () => {
  it("measures flat-to-flat episodes", () => {
    const fills = [
      fill({ time: T0, startPosition: "0", side: "B", sz: "1" }),
      fill({ time: T0 + 30 * 60_000, startPosition: "1", side: "A", sz: "1" }),
    ]
    expect(computeAvgHoldMinutes(fills)).toBe(30)
  })

  it("ignores episodes that never close", () => {
    const fills = [fill({ time: T0, startPosition: "0", side: "B", sz: "1" })]
    expect(computeAvgHoldMinutes(fills)).toBeNull()
  })

  it("tracks coins independently", () => {
    const fills = [
      fill({ coin: "BTC", time: T0, startPosition: "0", side: "B", sz: "1" }),
      fill({ coin: "ETH", time: T0, startPosition: "0", side: "B", sz: "1" }),
      fill({ coin: "BTC", time: T0 + 10 * 60_000, startPosition: "1", side: "A", sz: "1" }),
      fill({ coin: "ETH", time: T0 + 20 * 60_000, startPosition: "1", side: "A", sz: "1" }),
    ]
    expect(computeAvgHoldMinutes(fills)).toBe(15)
  })
})

describe("portfolio extraction", () => {
  it("takes the final cumulative pnl and account value", () => {
    const period = {
      accountValueHistory: [
        [T0, "1000"],
        [T0 + DAY, "1500"],
      ] as [number, string][],
      pnlHistory: [
        [T0, "0"],
        [T0 + DAY, "250"],
      ] as [number, string][],
    }
    expect(extractWindowPnl(period)).toBe(250)
    expect(extractAccountValue(period)).toBe(1500)
    expect(extractWindowPnl(undefined)).toBeNull()
  })

  it("downsamples long histories and keeps the last point", () => {
    const history: [number, string][] = Array.from({ length: 1000 }, (_, i) => [
      T0 + i,
      String(i),
    ])
    const sampled = downsampleHistory(history, 200)
    expect(sampled.length).toBeLessThanOrEqual(201)
    expect(sampled[sampled.length - 1].value).toBe(999)
  })
})

describe("classifyWallet", () => {
  function input(overrides: Partial<ClassifyInput>): ClassifyInput {
    return {
      pnl7d: null,
      pnl30d: null,
      winRate: null,
      fillCount30d: 0,
      accountValue: null,
      avgHoldMinutes: null,
      takerRatio: null,
      maxOpenLeverage: null,
      firstSeenAt: null,
      oldestFillAt: null,
      now: T0,
      ...overrides,
    }
  }

  it("labels a consistent winner", () => {
    const result = classifyWallet(
      input({ winRate: 0.6, pnl30d: 50_000, fillCount30d: 40 })
    )
    expect(result.labels).toContain("Consistent winner")
  })

  it("labels a market maker (high fills, mostly maker)", () => {
    const result = classifyWallet(
      input({ fillCount30d: 2000, takerRatio: 0.05 })
    )
    expect(result.labels).toContain("Market maker")
  })

  it("does not label a busy taker as market maker", () => {
    const result = classifyWallet(
      input({ fillCount30d: 2000, takerRatio: 0.9 })
    )
    expect(result.labels).not.toContain("Market maker")
  })

  it("labels scalpers and swing traders by hold time", () => {
    expect(
      classifyWallet(input({ avgHoldMinutes: 5, fillCount30d: 100 })).labels
    ).toContain("Scalper")
    expect(
      classifyWallet(input({ avgHoldMinutes: 3000 })).labels
    ).toContain("Swing trader")
  })

  it("labels new whales and dormant reactivations", () => {
    expect(
      classifyWallet(input({ firstSeenAt: T0 - 2 * DAY })).labels
    ).toContain("New whale")
    expect(
      classifyWallet(
        input({ firstSeenAt: T0 - 60 * DAY, oldestFillAt: T0 - 2 * DAY })
      ).labels
    ).toContain("Dormant reactivated")
  })

  it("scores profitable consistent wallets far above losers", () => {
    const winner = classifyWallet(
      input({
        winRate: 0.65,
        pnl7d: 20_000,
        pnl30d: 150_000,
        fillCount30d: 200,
        accountValue: 2_000_000,
      })
    )
    const loser = classifyWallet(
      input({ winRate: 0.2, pnl7d: -5_000, pnl30d: -50_000, fillCount30d: 10 })
    )
    expect(winner.qualityScore).toBeGreaterThan(70)
    expect(loser.qualityScore).toBeLessThan(30)
    expect(winner.qualityScore).toBeLessThanOrEqual(100)
    expect(loser.qualityScore).toBeGreaterThanOrEqual(0)
  })
})
