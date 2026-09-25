/** One finished market's headline numbers, as the group polls them. */
export type MarketStat = {
  netPnl: number | null
  tradeCount: number | null
  /** Fraction 0..1. */
  winRate: number | null
}

/** The whole basket folded into one set of headline numbers. */
export type CombinedBacktestSummary = {
  /** Finished markets folded into the total. */
  markets: number
  /** Of those, how many ended net positive. */
  greenMarkets: number
  /** Summed net P&L across every finished market, in dollars. */
  netPnl: number
  /** Net P&L as a percent of the pot — the starting balance, once. */
  netPnlPct: number | null
  /** Summed closed-trade count across the basket. */
  trades: number
  /** Trade-weighted win rate across the basket, fraction 0..1. */
  winRate: number | null
}

/**
 * Fold every finished market's numbers into one combined summary — the "all
 * markets" total the editor's backtest panel shows instead of a single market's
 * stats. P&L and trades are honest sums; win rate is weighted by each market's
 * trade count. Returns null when nothing has finished yet.
 *
 * THE POT IS THE STARTING BALANCE, ONCE. Summed profit divides by that one
 * number however many markets the run covered — testing four markets does not
 * mean four accounts existed. Multiplying the denominator by the market count
 * was tried and reported a real loss at roughly a quarter of its size (July 26,
 * 2026); it is the same money either way, so the return is measured against it
 * once. `blendCurves` builds the combined equity curve on the same basis, so
 * the drawdown beside this percent shares its denominator.
 */
export function combineMarketStats(
  stats: MarketStat[],
  { startingEquity }: { startingEquity: number }
): CombinedBacktestSummary | null {
  if (stats.length === 0) return null
  let netPnl = 0
  let trades = 0
  let wins = 0
  let greenMarkets = 0
  for (const stat of stats) {
    const pnl = stat.netPnl ?? 0
    netPnl += pnl
    if (pnl > 0) greenMarkets += 1
    const count = stat.tradeCount ?? 0
    trades += count
    if (stat.winRate !== null) wins += Math.round(stat.winRate * count)
  }
  return {
    markets: stats.length,
    greenMarkets,
    netPnl,
    netPnlPct: startingEquity > 0 ? (netPnl / startingEquity) * 100 : null,
    trades,
    winRate: trades > 0 ? wins / trades : null,
  }
}

/**
 * The combined equity at the drawdown trough — how much was in the pot when it
 * was at its worst. Walks the blended curve to the trough's bar time.
 */
export function potAtDrawdown(
  points: readonly { t: number; eq: number }[],
  at: number | null
): number | null {
  if (at == null || points.length === 0) return null
  let eq = points[0].eq
  for (const point of points) {
    if (point.t <= at) eq = point.eq
    else break
  }
  return eq
}
