import { describe, expect, it } from "vitest"

import { combineMarketStats } from "./backtest-combine"

describe("combineMarketStats", () => {
  it("returns null when no markets have finished", () => {
    expect(combineMarketStats([], { startingEquity: 10_000 })).toBeNull()
  })

  it("sums P&L and trades and weights the win rate", () => {
    const summary = combineMarketStats(
      [
        { netPnl: 300, tradeCount: 10, winRate: 0.6 },
        { netPnl: -100, tradeCount: 30, winRate: 0.4 },
      ],
      { startingEquity: 10_000 }
    )
    expect(summary).not.toBeNull()
    // P&L is a straight sum, not an average.
    expect(summary?.netPnl).toBe(200)
    expect(summary?.trades).toBe(40)
    // Weighted win rate: (6 + 12) wins / 40 trades = 0.45, not the 0.5 mean.
    expect(summary?.winRate).toBeCloseTo(0.45)
    // One of the two markets ended green.
    expect(summary?.greenMarkets).toBe(1)
    expect(summary?.markets).toBe(2)
  })

  it("measures the basket against the pot — the balance once, not per market", () => {
    const twoMarkets = combineMarketStats(
      [
        { netPnl: 500, tradeCount: 5, winRate: 0.5 },
        { netPnl: 500, tradeCount: 5, winRate: 0.5 },
      ],
      { startingEquity: 10_000 }
    )
    // 1,000 profit on the one 10k pot = 10%.
    expect(twoMarkets?.netPnl).toBe(1000)
    expect(twoMarkets?.netPnlPct).toBeCloseTo(10)

    // Splitting the SAME profit over more markets cannot shrink the return:
    // it is the same pot and the same money either way.
    const fourMarkets = combineMarketStats(
      Array.from({ length: 4 }, () => ({
        netPnl: 250,
        tradeCount: 5,
        winRate: 0.5,
      })),
      { startingEquity: 10_000 }
    )
    expect(fourMarkets?.netPnl).toBe(1000)
    expect(fourMarkets?.netPnlPct).toBeCloseTo(10)
  })

  it("reports a real loss at full size", () => {
    // The reported bug: -$264.42 across 4 markets on a 10k pot read as -0.66%
    // because the denominator was 10k × 4.
    const summary = combineMarketStats(
      Array.from({ length: 4 }, () => ({
        netPnl: -66.105,
        tradeCount: 3,
        winRate: 0.3,
      })),
      { startingEquity: 10_000 }
    )
    expect(summary?.netPnl).toBeCloseTo(-264.42)
    expect(summary?.netPnlPct).toBeCloseTo(-2.6442)
  })
})
