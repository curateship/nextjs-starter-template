import { describe, expect, it } from "vitest"

import { combineMarketStats } from "./backtest-combine"

describe("combineMarketStats", () => {
  it("returns null when no markets have finished", () => {
    expect(
      combineMarketStats([], { startingEquity: 10_000, sharedAccount: true })
    ).toBeNull()
  })

  it("sums P&L and trades and weights the win rate", () => {
    const summary = combineMarketStats(
      [
        { netPnl: 300, tradeCount: 10, winRate: 0.6 },
        { netPnl: -100, tradeCount: 30, winRate: 0.4 },
      ],
      { startingEquity: 10_000, sharedAccount: true }
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

  it("measures a shared basket against the one wallet", () => {
    const summary = combineMarketStats(
      [
        { netPnl: 500, tradeCount: 5, winRate: 0.5 },
        { netPnl: 500, tradeCount: 5, winRate: 0.5 },
      ],
      { startingEquity: 10_000, sharedAccount: true }
    )
    // 1,000 total profit on the single shared 10k wallet = 10%.
    expect(summary?.netPnl).toBe(1000)
    expect(summary?.netPnlPct).toBeCloseTo(10)
  })

  it("measures an independent basket against capital × market count", () => {
    const summary = combineMarketStats(
      [
        { netPnl: 500, tradeCount: 5, winRate: 0.5 },
        { netPnl: 500, tradeCount: 5, winRate: 0.5 },
      ],
      { startingEquity: 10_000, sharedAccount: false }
    )
    // Each market ran its OWN 10k account, so 1,000 profit is on 20k = 5% — not
    // the 10% a single-wallet denominator would wrongly report for this basket.
    expect(summary?.netPnl).toBe(1000)
    expect(summary?.netPnlPct).toBeCloseTo(5)
  })
})
