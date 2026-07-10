import type { CandleWsEvent } from "@nktkas/hyperliquid"

import type {
  StrategyParams,
  StrategyType,
} from "@/lib/strategies/params"

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d"

/** Candles per UTC day for each interval (shared by day-based params). */
export const BARS_PER_DAY: Record<CandleInterval, number> = {
  "1m": 1440,
  "5m": 288,
  "15m": 96,
  "1h": 24,
  "4h": 6,
  "1d": 1,
}

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

/**
 * Shared desiredOrders for signal strategies that enter and exit with IOC
 * market orders: consumes state.exitRequested / state.pendingEntry, closes an
 * opposite position before flipping, and sizes entries from equity
 * (compounding) or a fixed USD amount. sizeScale (≤ 1) shrinks the bet for
 * vol targeting.
 */
export function marketEntryExitOrders<
  S extends { pendingEntry: "long" | "short" | null; exitRequested: boolean },
>(
  ctx: StrategyCtx<S>,
  opts: {
    /** Purpose prefix, e.g. "momo" → "momo:entry" / "momo:exit". */
    prefix: string
    compounding?: boolean
    orderSizeUsd: number
    sizeScale?: number
  }
): DesiredOrder[] {
  const state = ctx.state
  const mid = Number(ctx.mid)
  if (!(mid > 0)) return []
  const orders: DesiredOrder[] = []
  const szi = Number(ctx.position?.szi ?? 0)

  if (state.exitRequested && szi !== 0) {
    ctx.setState({ ...state, exitRequested: false })
    orders.push({
      purpose: `${opts.prefix}:exit`,
      side: szi > 0 ? "sell" : "buy",
      orderType: "market",
      sz: String(Math.abs(szi)),
      tif: "Ioc",
      reduceOnly: true,
    })
    return orders
  }

  if (state.pendingEntry) {
    const side = state.pendingEntry === "long" ? "buy" : "sell"
    ctx.setState({ ...state, pendingEntry: null })
    // Close any opposite position first, then open the new one.
    if (szi !== 0 && Math.sign(szi) !== (side === "buy" ? 1 : -1)) {
      orders.push({
        purpose: `${opts.prefix}:flip-close`,
        side: szi > 0 ? "sell" : "buy",
        orderType: "market",
        sz: String(Math.abs(szi)),
        tif: "Ioc",
        reduceOnly: true,
      })
    }
    // Compounding on: bet the full current balance each trade so profits and
    // losses carry forward. Off: fixed order size each trade.
    const balance = Number(ctx.equity)
    const notional =
      (opts.compounding && balance > 0 ? balance : opts.orderSizeUsd) *
      (opts.sizeScale ?? 1)
    orders.push({
      purpose: `${opts.prefix}:entry`,
      side,
      orderType: "market",
      sz: String(notional / mid),
      tif: "Ioc",
      reduceOnly: false,
    })
  }

  return orders
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
