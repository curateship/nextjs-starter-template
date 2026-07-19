import type { BotDetailResponse, BotMarketState } from "@/lib/api/bots"
import type {
  BacktestResult,
  BacktestTrade,
  SideStats,
} from "@/lib/backtest/types"

import type { BotRoundTrip } from "./bot-round-trips"

const EPS = 1e-9

/** SideStats over a set of closed round trips (the backtest's per-side math). */
function sideStats(trips: BotRoundTrip[]): SideStats {
  const wins = trips.filter((trip) => trip.pnl > 0)
  const losses = trips.filter((trip) => trip.pnl <= 0)
  const grossProfit = wins.reduce((sum, trip) => sum + trip.pnl, 0)
  const grossLoss = losses.reduce((sum, trip) => sum + trip.pnl, 0)
  const netPnl = grossProfit + grossLoss
  const returns = trips.map((trip) => trip.returnPct)
  const mean = returns.length
    ? returns.reduce((sum, r) => sum + r, 0) / returns.length
    : 0
  const variance = returns.length
    ? returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length
    : 0
  const std = Math.sqrt(variance)
  return {
    netPnl,
    grossProfit,
    grossLoss,
    trades: trips.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trips.length ? wins.length / trips.length : 0,
    profitFactor:
      Math.abs(grossLoss) > EPS ? grossProfit / Math.abs(grossLoss) : null,
    avgTrade: trips.length ? netPnl / trips.length : 0,
    avgWin: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    largestWin: wins.length ? Math.max(...wins.map((t) => t.pnl)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map((t) => t.pnl)) : 0,
    sharpe: std > EPS ? (mean / std) * Math.sqrt(returns.length) : 0,
  }
}

/**
 * Adapts a live bot market's round trips into the backtest's result shape so
 * the bottom panel can reuse StrategyTester (trades list, equity-curve
 * overview, long/short performance) unchanged. The equity curve is derived
 * stepwise from realized P&L — the bot stores no equity history. Backtest-only
 * fields take neutral values (no buy&hold, no halt).
 */
export function buildBotResult(
  trips: BotRoundTrip[],
  fills: BotDetailResponse["trades"],
  state: BotMarketState | null,
  startingEquity: number
): BacktestResult {
  const closed = trips.filter((trip) => !trip.open && trip.exitTime !== null)
  const openTrip = trips.find((trip) => trip.open) ?? null

  const trades: BacktestTrade[] = closed.map((trip) => ({
    n: trip.n,
    side: trip.side,
    entryTime: trip.entryTime,
    entryPx: trip.entryPx,
    exitTime: trip.exitTime as number,
    exitPx: trip.exitPx ?? trip.entryPx,
    qty: trip.entryPx > EPS ? trip.amount / trip.entryPx : 0,
    pnl: trip.pnl,
    returnPct: trip.returnPct,
    cumPnl: trip.cumPnl,
  }))

  // Stepwise realized-equity path: starting equity, then a point per exit.
  const firstTime = trips[0]?.entryTime ?? Date.now()
  const equityCurve = [
    { t: firstTime, eq: startingEquity },
    ...closed.map((trip) => ({
      t: trip.exitTime as number,
      eq: startingEquity + trip.cumPnl,
    })),
  ]

  const netPnl = closed.reduce((sum, trip) => sum + trip.pnl, 0)
  let peak = startingEquity
  let maxDrawdownPct = 0
  let maxDrawdownUsd = 0
  for (const point of equityCurve) {
    if (point.eq > peak) peak = point.eq
    if (peak > EPS) {
      maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - point.eq) / peak) * 100)
      maxDrawdownUsd = Math.max(maxDrawdownUsd, peak - point.eq)
    }
  }

  const position = state?.paper_position
  const openPosition =
    openTrip && position && Math.abs(Number(position.szi)) > EPS
      ? {
          side: openTrip.side,
          szi: Number(position.szi),
          entryPx: Number(position.entryPx),
          entryTime: openTrip.entryTime,
        }
      : null

  return {
    equityCurve,
    trades,
    fills: fills.map((fill) => ({
      t: Date.parse(fill.fill_time),
      side: fill.side as "buy" | "sell",
      px: Number(fill.px),
      sz: Number(fill.sz),
      fee: Number(fill.fee),
      closedPnl: Number(fill.closed_pnl ?? 0),
      purpose: "bot",
    })),
    openPosition,
    stats: {
      all: sideStats(closed),
      long: sideStats(closed.filter((trip) => trip.side === "long")),
      short: sideStats(closed.filter((trip) => trip.side === "short")),
      netPnl,
      netPnlPct: startingEquity > EPS ? (netPnl / startingEquity) * 100 : 0,
      maxDrawdownPct,
      maxDrawdownUsd,
      fees: fills.reduce((sum, fill) => sum + Number(fill.fee), 0),
      buyHoldPct: 0,
      startingEquity,
      endingEquity: startingEquity + netPnl,
      halt: { kind: null, reason: null },
      warnings: [],
    },
  }
}
