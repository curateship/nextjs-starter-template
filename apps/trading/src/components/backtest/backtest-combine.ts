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
  /** Net P&L as a percent of the capital actually deployed. */
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
 * The percent divides summed profit by the capital ACTUALLY deployed:
 * - A shared-account basket (DCA) runs every market off ONE wallet, so its
 *   denominator is that single `startingEquity`.
 * - Independent markets each run on their own full `startingEquity`, so the
 *   denominator is `startingEquity × markets`. Dividing those by one account's
 *   capital would overstate the return by roughly the market count.
 */
export function combineMarketStats(
  stats: MarketStat[],
  {
    startingEquity,
    sharedAccount,
  }: { startingEquity: number; sharedAccount: boolean }
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
  const deployedEquity = sharedAccount
    ? startingEquity
    : startingEquity * stats.length
  return {
    markets: stats.length,
    greenMarkets,
    netPnl,
    netPnlPct: deployedEquity > 0 ? (netPnl / deployedEquity) * 100 : null,
    trades,
    winRate: trades > 0 ? wins / trades : null,
  }
}
