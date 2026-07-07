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

/** Candle intervals the backtest engine and history fetch support. */
export const BACKTEST_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const
export type BacktestInterval = (typeof BACKTEST_INTERVALS)[number]

const INTERVAL_MS: Record<BacktestInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

/**
 * Hyperliquid's candleSnapshot serves at most ~5000 candles per interval:
 * recent-history retention for fine intervals (1h ≈ 7mo, 4h ≈ 2.3yr), and
 * full history for daily (bounded instead by each coin's listing). Cap a run
 * near that ceiling so the window can't ask for bars the API won't return.
 * At the exact maximum, a momentum run's warmup is squeezed to near zero — a
 * negligible cold-start over thousands of bars.
 */
export const MAX_RUN_BARS = 5000

/**
 * Largest lookback window, in whole days, worth requesting for an interval —
 * so daily/4h can reach multi-year history while fine intervals stay within
 * what the API retains. `maxBars` lets the user's configured candle ceiling
 * (Settings → Max backtest candles) tighten this for speed; it defaults to,
 * and is bounded by, the API's per-interval ceiling.
 */
export function maxWindowDays(
  interval: BacktestInterval,
  maxBars: number = MAX_RUN_BARS
): number {
  const bars = Math.min(MAX_RUN_BARS, Math.max(1, maxBars))
  return Math.max(1, Math.floor((bars * INTERVAL_MS[interval]) / 86_400_000))
}

/**
 * User-configurable candle ceiling bounds (Settings → Max chart candles).
 * Applies everywhere candles are loaded: the count a live trading chart
 * fetches, and the per-interval window ceiling for backtest runs.
 * Lowering it speeds up charts and runs. Never exceeds the API's per-interval
 * retention (MAX_RUN_BARS).
 */
export const MAX_CANDLES_LIMIT = MAX_RUN_BARS
export const MIN_CANDLES = 50
export const DEFAULT_MAX_CANDLES = MAX_CANDLES_LIMIT

export function clampMaxCandles(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_CANDLES
  }
  return Math.min(MAX_CANDLES_LIMIT, Math.max(MIN_CANDLES, Math.round(value)))
}
