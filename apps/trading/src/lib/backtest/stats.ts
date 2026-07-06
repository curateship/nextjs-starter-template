import type {
  BacktestEquityPoint,
  BacktestHalt,
  BacktestStats,
  BacktestTrade,
  SideStats,
} from "./types"

/** Aggregates a set of round-trip trades into one side's performance stats. */
function sideStats(trades: BacktestTrade[]): SideStats {
  const wins = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl < 0)
  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0)
  const grossLoss = losses.reduce((sum, t) => sum + t.pnl, 0)
  const netPnl = trades.reduce((sum, t) => sum + t.pnl, 0)
  const returns = trades.map((t) => t.returnPct)
  const mean = returns.length
    ? returns.reduce((sum, r) => sum + r, 0) / returns.length
    : 0
  const variance = returns.length
    ? returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length
    : 0
  const sd = Math.sqrt(variance)

  return {
    netPnl,
    grossProfit,
    grossLoss,
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    profitFactor: grossLoss < 0 ? grossProfit / -grossLoss : null,
    avgTrade: trades.length ? netPnl / trades.length : 0,
    avgWin: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    largestWin: wins.length ? Math.max(...wins.map((t) => t.pnl)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map((t) => t.pnl)) : 0,
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(returns.length) : 0,
  }
}

/** Largest peak-to-trough drawdown across the equity curve. */
function maxDrawdown(equityCurve: BacktestEquityPoint[]): {
  pct: number
  usd: number
} {
  let peak = equityCurve[0]?.eq ?? 0
  let pct = 0
  let usd = 0
  for (const point of equityCurve) {
    if (point.eq > peak) peak = point.eq
    const dd = peak - point.eq
    if (dd > usd) usd = dd
    if (peak > 0 && dd / peak > pct) pct = dd / peak
  }
  return { pct: pct * 100, usd }
}

/**
 * Derives all reported performance stats from the round-trip trades and the
 * per-bar equity curve. Pure — used by the engine to fill result.stats and
 * covered directly by unit tests.
 */
export function computeBacktestStats(
  trades: BacktestTrade[],
  equityCurve: BacktestEquityPoint[],
  opts: {
    startingEquity: number
    fees: number
    firstClose: number
    lastClose: number
    halt: BacktestHalt
  }
): BacktestStats {
  const endingEquity = equityCurve.length
    ? equityCurve[equityCurve.length - 1].eq
    : opts.startingEquity
  const netPnl = endingEquity - opts.startingEquity
  const dd = maxDrawdown(equityCurve)

  return {
    all: sideStats(trades),
    long: sideStats(trades.filter((t) => t.side === "long")),
    short: sideStats(trades.filter((t) => t.side === "short")),
    netPnl,
    netPnlPct: opts.startingEquity ? (netPnl / opts.startingEquity) * 100 : 0,
    maxDrawdownPct: dd.pct,
    maxDrawdownUsd: dd.usd,
    fees: opts.fees,
    buyHoldPct: opts.firstClose
      ? (opts.lastClose / opts.firstClose - 1) * 100
      : 0,
    startingEquity: opts.startingEquity,
    endingEquity,
    halt: opts.halt,
  }
}
