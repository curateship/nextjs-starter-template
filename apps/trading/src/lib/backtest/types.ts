/**
 * Isomorphic backtest result types. The worker engine produces a
 * BacktestResult, it is stored in the backtests.result jsonb column, and the
 * dashboard reads it back — so these shapes must be plain JSON.
 */

export type BacktestEquityPoint = {
  /** Bar close time, ms since epoch. */
  t: number
  /** Account equity (cash + unrealized) at that bar close. */
  eq: number
}

export type BacktestFill = {
  t: number
  side: "buy" | "sell"
  px: number
  sz: number
  fee: number
  closedPnl: number
  purpose: string
}

/** A completed round trip (flat → open → flat), drives the trades table + markers. */
export type BacktestTrade = {
  n: number
  side: "long" | "short"
  entryTime: number
  entryPx: number
  exitTime: number
  exitPx: number
  /** Base units closed. */
  qty: number
  /** Net realized P&L for the trip (closedPnl − fees). */
  pnl: number
  /** Return on entry notional, percent. */
  returnPct: number
  /** Running sum of pnl through this trade. */
  cumPnl: number
}

export type BacktestOpenPosition = {
  side: "long" | "short"
  szi: number
  entryPx: number
  entryTime: number
} | null

export type SideStats = {
  netPnl: number
  grossProfit: number
  grossLoss: number
  trades: number
  wins: number
  losses: number
  /** Fraction 0..1. */
  winRate: number
  /** grossProfit / |grossLoss|; null when there are no losing trades. */
  profitFactor: number | null
  avgTrade: number
  avgWin: number
  avgLoss: number
  largestWin: number
  largestLoss: number
  /** Per-trade Sharpe: mean(returnPct)/std(returnPct)·√n. */
  sharpe: number
}

export type BacktestHalt = {
  kind: "drawdown_kill" | "daily_loss_pause" | "grid_stop" | null
  reason: string | null
}

export type BacktestStats = {
  all: SideStats
  long: SideStats
  short: SideStats
  netPnl: number
  netPnlPct: number
  maxDrawdownPct: number
  maxDrawdownUsd: number
  fees: number
  buyHoldPct: number
  startingEquity: number
  endingEquity: number
  halt: BacktestHalt
}

export type BacktestResult = {
  equityCurve: BacktestEquityPoint[]
  trades: BacktestTrade[]
  fills: BacktestFill[]
  openPosition: BacktestOpenPosition
  stats: BacktestStats
}

/** Execution-cost assumptions for a run, in basis points. */
export type BacktestCosts = {
  /** Fee on market / crossing fills. */
  takerFeeBps: number
  /** Fee on resting limit fills. */
  makerFeeBps: number
  /** Adverse price movement applied to taker fills. */
  slippageBps: number
}

/** Hyperliquid's standard fee tier; zero slippage. */
export const DEFAULT_BACKTEST_COSTS: BacktestCosts = {
  takerFeeBps: 4.5,
  makerFeeBps: 1.5,
  slippageBps: 0,
}
