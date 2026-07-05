import type { MomentumParams } from "@/lib/strategies/params"
import type { DesiredOrder, Strategy, StrategyCtx } from "./contract"
import {
  crossedAbove,
  crossedBelow,
  ema,
  highest,
  lowest,
  rsi,
} from "./indicators"

export type MomentumState = {
  /** Entry the strategy wants executed; consumed once emitted. */
  pendingEntry: "long" | "short" | null
  exitRequested: boolean
  trailPx: number | null
}

const WARMUP_CANDLES = 400

/**
 * Signal-driven entries at candle close (EMA cross, RSI, or breakout),
 * managed with an optional trailing stop evaluated on ticks. Entries and
 * exits execute as market orders; the pending flags are consumed by
 * desiredOrders so each signal fires exactly one order.
 */
export const momentumStrategy: Strategy<MomentumParams, MomentumState> = {
  type: "momentum",

  warmup: (params) => ({
    candleIntervals: [params.interval],
    needsBook: false,
    needsTrades: false,
  }),

  init: () => ({ pendingEntry: null, exitRequested: false, trailPx: null }),

  onCandleClose: (ctx, params) => {
    const state = ctx.state
    const candles = ctx
      .candles(params.interval, WARMUP_CANDLES)
      .filter((candle) => candle.T <= ctx.now)
    if (candles.length < 3) return
    const closes = candles.map((candle) => Number(candle.c))

    const signal = readSignal(params, closes, candles)
    if (!signal) return

    const szi = Number(ctx.position?.szi ?? 0)
    if (signal === "long" && szi <= 0) {
      if (params.direction === "short") {
        if (szi < 0) requestExit(ctx, "Signal flipped long; closing short.")
        return
      }
      ctx.setState({ ...state, pendingEntry: "long", trailPx: null })
      ctx.emit("signal", `Long signal (${params.signal}) at ${closes.at(-1)}.`)
    } else if (signal === "short" && szi >= 0) {
      if (params.direction === "long") {
        if (szi > 0) requestExit(ctx, "Signal flipped short; closing long.")
        return
      }
      ctx.setState({ ...state, pendingEntry: "short", trailPx: null })
      ctx.emit("signal", `Short signal (${params.signal}) at ${closes.at(-1)}.`)
    }
  },

  onTick: (ctx, params) => {
    const state = ctx.state
    if (!params.trailingStopPct || !ctx.position || state.exitRequested) return
    const mid = Number(ctx.mid)
    if (!(mid > 0)) return

    const szi = Number(ctx.position.szi)
    const pct = params.trailingStopPct / 100
    if (szi > 0) {
      const candidate = mid * (1 - pct)
      const trail = Math.max(state.trailPx ?? candidate, candidate)
      if (mid <= trail && state.trailPx !== null) {
        requestExit(ctx, `Trailing stop hit at ${ctx.mid}.`)
      } else if (trail !== state.trailPx) {
        ctx.setState({ ...state, trailPx: trail })
      }
    } else if (szi < 0) {
      const candidate = mid * (1 + pct)
      const trail = Math.min(state.trailPx ?? candidate, candidate)
      if (mid >= trail && state.trailPx !== null) {
        requestExit(ctx, `Trailing stop hit at ${ctx.mid}.`)
      } else if (trail !== state.trailPx) {
        ctx.setState({ ...state, trailPx: trail })
      }
    }
  },

  onFill: (ctx) => {
    if (!ctx.position) {
      ctx.setState({ pendingEntry: null, exitRequested: false, trailPx: null })
    }
  },

  desiredOrders: (ctx: StrategyCtx<MomentumState>, params: MomentumParams) => {
    const state = ctx.state
    const mid = Number(ctx.mid)
    if (!(mid > 0)) return []
    const orders: DesiredOrder[] = []
    const szi = Number(ctx.position?.szi ?? 0)

    if (state.exitRequested && szi !== 0) {
      ctx.setState({ ...state, exitRequested: false })
      orders.push({
        purpose: "momo:exit",
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
          purpose: "momo:flip-close",
          side: szi > 0 ? "sell" : "buy",
          orderType: "market",
          sz: String(Math.abs(szi)),
          tif: "Ioc",
          reduceOnly: true,
        })
      }
      orders.push({
        purpose: "momo:entry",
        side,
        orderType: "market",
        sz: String(params.orderSizeUsd / mid),
        tif: "Ioc",
        reduceOnly: false,
      })
    }

    return orders
  },
}

function requestExit(ctx: StrategyCtx<MomentumState>, message: string) {
  ctx.setState({ ...ctx.state, exitRequested: true })
  ctx.emit("exit", message)
}

function readSignal(
  params: MomentumParams,
  closes: number[],
  candles: { h: string; l: string }[]
): "long" | "short" | null {
  if (params.signal === "ema_cross" && params.emaFast && params.emaSlow) {
    if (closes.length < params.emaSlow + 2) return null
    const fast = ema(closes, params.emaFast)
    const slow = ema(closes, params.emaSlow)
    if (crossedAbove(fast, slow)) return "long"
    if (crossedBelow(fast, slow)) return "short"
    return null
  }

  if (
    params.signal === "rsi" &&
    params.rsiPeriod &&
    params.rsiBuyBelow &&
    params.rsiSellAbove
  ) {
    const series = rsi(closes, params.rsiPeriod)
    const value = series[series.length - 1]
    if (Number.isNaN(value)) return null
    if (value <= params.rsiBuyBelow) return "long"
    if (value >= params.rsiSellAbove) return "short"
    return null
  }

  if (params.signal === "breakout" && params.breakoutLookback) {
    const lookback = params.breakoutLookback
    if (candles.length < lookback + 1) return null
    const window = candles.slice(-lookback - 1, -1)
    const close = closes[closes.length - 1]
    if (close > highest(window.map((candle) => Number(candle.h)))) return "long"
    if (close < lowest(window.map((candle) => Number(candle.l)))) return "short"
    return null
  }

  return null
}
