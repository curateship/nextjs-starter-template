import { describe, expect, it } from "vitest"

import { computeBacktestStats } from "./stats"
import type { BacktestEquityPoint, BacktestTrade } from "./types"

function trade(partial: Partial<BacktestTrade>): BacktestTrade {
  return {
    n: 0,
    side: "long",
    entryTime: 0,
    entryPx: 100,
    exitTime: 0,
    exitPx: 100,
    qty: 1,
    pnl: 0,
    returnPct: 0,
    cumPnl: 0,
    ...partial,
  }
}

const trades: BacktestTrade[] = [
  trade({ n: 1, side: "long", pnl: 100, returnPct: 10 }),
  trade({ n: 2, side: "long", pnl: -50, returnPct: -5 }),
  trade({ n: 3, side: "short", pnl: 30, returnPct: 3 }),
]

const equityCurve: BacktestEquityPoint[] = [
  { t: 1, eq: 10_000 },
  { t: 2, eq: 10_100 },
  { t: 3, eq: 10_050 },
  { t: 4, eq: 10_080 },
]

describe("computeBacktestStats", () => {
  const stats = computeBacktestStats(trades, equityCurve, {
    startingEquity: 10_000,
    fees: 12,
    firstClose: 100,
    lastClose: 110,
    halt: { kind: null, reason: null },
  })

  it("aggregates win rate and profit factor across all trades", () => {
    expect(stats.all.trades).toBe(3)
    expect(stats.all.wins).toBe(2)
    expect(stats.all.losses).toBe(1)
    expect(stats.all.winRate).toBeCloseTo(2 / 3, 10)
    expect(stats.all.grossProfit).toBe(130)
    expect(stats.all.grossLoss).toBe(-50)
    expect(stats.all.profitFactor).toBeCloseTo(2.6, 10)
    expect(stats.all.largestWin).toBe(100)
    expect(stats.all.largestLoss).toBe(-50)
  })

  it("splits long and short, with null profit factor when a side never loses", () => {
    expect(stats.long.netPnl).toBe(50)
    expect(stats.long.profitFactor).toBeCloseTo(2, 10)
    expect(stats.short.trades).toBe(1)
    expect(stats.short.netPnl).toBe(30)
    expect(stats.short.profitFactor).toBeNull()
  })

  it("computes net pnl, max drawdown and buy & hold", () => {
    expect(stats.endingEquity).toBe(10_080)
    expect(stats.netPnl).toBe(80)
    expect(stats.netPnlPct).toBeCloseTo(0.8, 10)
    expect(stats.maxDrawdownUsd).toBe(50)
    expect(stats.maxDrawdownPct).toBeCloseTo((50 / 10_100) * 100, 10)
    expect(stats.buyHoldPct).toBeCloseTo(10, 10)
    expect(stats.fees).toBe(12)
  })
})
