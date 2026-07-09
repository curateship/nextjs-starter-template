import type { CandleWsEvent } from "@nktkas/hyperliquid"

import type {
  StrategyParams,
  StrategyType,
} from "@/lib/strategies/params"

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d"

export type DesiredOrder = {
  /** Stable identity for diffing, e.g. "grid:7:buy". Max 40 chars. */
  purpose: string
  side: "buy" | "sell"
  orderType: "market" | "limit"
  /** Limit price (pre-rounding); required for limit orders. */
  px?: string
  /** Size in base units (pre-rounding). */
  sz: string
  tif: "Gtc" | "Ioc" | "Alo"
  reduceOnly: boolean
}

export type BrokerFill = {
  side: "buy" | "sell"
  px: string
  sz: string
  fee: string
  closedPnl: string
  time: number
  cloid: string | null
  oid: number | null
  hlTid: number | null
  /** Purpose of the order that filled; resolved by the runner. */
  purpose?: string
}

export type PositionState = {
  /** Signed size; positive = long. */
  szi: string
  entryPx: string
} | null

export type StrategyCtx<S> = {
  market: string
  /** Latest mid price, "0" until first tick. */
  mid: string
  /** Most recent `n` closed+current candles for an interval. */
  candles: (interval: CandleInterval, n: number) => CandleWsEvent[]
  position: PositionState
  /** Equity in USD (paper cash + uPnL, or live account value). */
  equity: string
  /** Equity at the start of the run — the baseline compounding scales against. */
  startingEquity?: string
  state: S
  setState: (next: S) => void
  emit: (type: string, message: string, data?: unknown) => void
  now: number
}

export type WarmupSpec = {
  candleIntervals: CandleInterval[]
  needsBook: boolean
  needsTrades: boolean
  /** Copy strategy: public address whose fills should be streamed. */
  sourceAddress?: string
}

export type SourceFill = {
  coin: string
  side: "buy" | "sell"
  px: string
  sz: string
  time: number
  tid: number
}

export interface Strategy<P extends StrategyParams, S> {
  type: StrategyType
  warmup: (params: P) => WarmupSpec
  init: (params: P) => S
  onCandleClose?: (
    ctx: StrategyCtx<S>,
    params: P,
    candle: CandleWsEvent
  ) => void
  onFill?: (ctx: StrategyCtx<S>, params: P, fill: BrokerFill) => void
  onTick?: (ctx: StrategyCtx<S>, params: P) => void
  onSourceFill?: (ctx: StrategyCtx<S>, params: P, fill: SourceFill) => void
  /**
   * Price levels at which onTick would request an exit right now (TP / SL /
   * trailing stop), given the current position and state. Pure — must not
   * call setState. Only the backtest runner reads this: it pauses the
   * simulated intrabar price path at each crossed level so threshold exits
   * fill at their trigger price instead of the bar's extreme. Live trading
   * ignores it (real ticks are continuous).
   */
  exitTriggers?: (ctx: StrategyCtx<S>, params: P) => number[]
  /** Pure derivation of the orders the bot wants resting right now. */
  desiredOrders: (ctx: StrategyCtx<S>, params: P) => DesiredOrder[]
}
