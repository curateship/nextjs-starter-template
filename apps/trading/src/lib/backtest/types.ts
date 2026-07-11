/**
 * Isomorphic backtest result types. The worker engine produces a
 * BacktestResult, it is stored in the backtests.result jsonb column, and the
 * dashboard reads it back — so these shapes must be plain JSON.
 */

import {
  strategyConfigSchema,
  strategyKindOf,
} from "@/lib/strategies/strategy-config"

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
  /**
   * Automatic credibility tripwires, computed by the engine on every run —
   * red flags that historically meant "this result is lying" (fill-model
   * bugs, unmodeled liquidation). Empty/absent = none fired. Old stored
   * results predate the field.
   */
  warnings?: string[]
}

export type BacktestResult = {
  equityCurve: BacktestEquityPoint[]
  trades: BacktestTrade[]
  fills: BacktestFill[]
  openPosition: BacktestOpenPosition
  stats: BacktestStats
}

/**
 * Whole-basket risk for a run group, measured on the *combined* equity curve
 * (every market's equity summed at each bar), not on per-market stats. This is
 * the real experience of holding all the markets at once: their separate worst
 * moments happen at different times and net out, so the combined number is far
 * more honest than averaging each market's own drawdown.
 */
export type GroupPortfolioMetrics = {
  /** Completed markets blended into the combined curve. */
  markets: number
  /** Combined basket peak-to-trough drawdown %, ≤ 0 (0 = only ever rose). */
  combinedDrawdownPct: number
  /** Bar time (ms) of the drawdown trough; null when there is no drawdown. */
  drawdownAt: number | null
  /**
   * Worst the whole basket ever sat below its total starting capital %, ≤ 0
   * (0 = the bucket was never underwater as a whole).
   */
  bucketLowPct: number
  /** Bar time (ms) of the basket's lowest combined equity. */
  bucketLowAt: number | null
}

/**
 * The run group's combined equity curve, for the results-page P&L chart. Every
 * completed market's equity is summed at each bar (the same blend used for the
 * risk metrics), then downsampled to a UI-friendly point count.
 */
export type GroupCombinedCurve = {
  /** Total starting capital across the blended markets. */
  startEquity: number
  /** Downsampled combined equity over the run window. */
  points: BacktestEquityPoint[]
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

export const INTERVAL_MS: Record<BacktestInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

/**
 * Live-chart / display ceiling. Hyperliquid's candleSnapshot serves at most
 * ~5000 candles per interval, so the live trading chart and config-browse
 * fetches cap here. Backtest run windows use MAX_BACKTEST_BARS instead, since
 * backtest candles come from Binance (years of history), not Hyperliquid.
 */
export const MAX_RUN_BARS = 5000

/**
 * Ceiling on candles in a single backtest run window. Backtest history comes
 * from Binance, which keeps years per interval, so this is far higher than
 * Hyperliquid's ~5000 live-chart limit — ~5.7 years at 1h, ~1.4 years at 15m.
 * Held just under the per-request fetch wall (MAX_BARS_PER_FETCH) once warmup
 * is added, so a max-window run never truncates. Bounds render/engine cost per
 * run, not data availability.
 */
export const MAX_BACKTEST_BARS = 50_000

/**
 * Most additional markets a single config may replay across. The background
 * queue runs them one at a time, so this bounds a run group's total upstream
 * cost. Shared by the run/config validators and the market-picker UI.
 */
export const MAX_EXTRA_MARKETS = 50

/**
 * Candles the runner pre-loads before simStart so signals are warmed up.
 * 1500 (not 400): QQE's consolidation machine is path-dependent from its first
 * bar, and TradingView anchors it at the chart's full loaded history — a deeper
 * anchor converges zone edges (and thus filtered signals) to TV's. Must stay
 * equal to the chart fetch warmup so painted zones and engine signals share an
 * anchor.
 */
export const SIGNAL_WARMUP_CANDLES = 1500

/**
 * Warmup candles a strategy needs before simStart: the picked indicator
 * declares its own warmup. QQE stays deep (its consolidation anchor is
 * path-dependent) via its module's floor.
 */
export function warmupBarsFor(params: unknown): number {
  const parsed = strategyConfigSchema.safeParse(params)
  if (!parsed.success) return SIGNAL_WARMUP_CANDLES
  return strategyKindOf(parsed.data).warmupBars(parsed.data as never)
}

/**
 * Largest backtest lookback window, in whole days, for an interval — bounded by
 * the backtest bar ceiling (Binance-backed), so 15m reaches ~200 days and
 * coarser intervals reach years. `maxBars` can tighten it for speed; it
 * defaults to, and is bounded by, MAX_BACKTEST_BARS.
 */
export function maxWindowDays(
  interval: BacktestInterval,
  maxBars: number = MAX_BACKTEST_BARS
): number {
  const bars = Math.min(MAX_BACKTEST_BARS, Math.max(1, maxBars))
  return Math.max(1, Math.floor((bars * INTERVAL_MS[interval]) / 86_400_000))
}

/** Candles a window of `windowDays` spans at an interval — inverse of maxWindowDays. */
export function windowBars(
  interval: BacktestInterval,
  windowDays: number
): number {
  return Math.ceil((windowDays * 86_400_000) / INTERVAL_MS[interval])
}

/**
 * Total candles one run request may download across its whole market basket.
 * Per-market windows are already capped at MAX_BACKTEST_BARS; this bounds the
 * combined fetch so a single request can't pull millions of bars and get the
 * shared upstream (Binance) IP rate-limited — which would break backtests for
 * everyone. Sized to allow the recommended 20-market basket at the full
 * per-market window (20 × 50,000).
 */
export const MAX_TOTAL_RUN_BARS = 1_000_000

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
