import type { QqeParams } from "@/lib/strategies/params"
import type { DesiredOrder, Strategy, StrategyCtx } from "./contract"
import {
  computeQqeSeries,
  initialConsolidationState,
  stepConsolidation,
  type ConsolidationState,
} from "@/lib/strategies/qqe"

export type QqeState = {
  /** Entry the strategy wants executed; consumed once emitted. */
  pendingEntry: "long" | "short" | null
  exitRequested: boolean
  /** Anchored consolidation machine, advanced one closed candle at a time. */
  cons: ConsolidationState
  /** Open time of the last candle fed to the machine. */
  lastBarT: number
  inZone: boolean
}

/** EMA/RSI converge well within this window; only consolidation needs anchoring. */
const QQE_WINDOW_CANDLES = 400

/**
 * QQE + Consolidation: stop-and-reverse entries when the smoothed RSI first
 * crosses out of the 50±threshold channel (QQE counter == 1), optionally
 * suppressed while the market sits in a zigzag consolidation zone. Optional
 * TP/SL evaluated on ticks. QQE recomputes over a bounded window each close
 * (deterministic cross edge, no counter state); the consolidation machine is
 * carried in state and advanced one closed candle at a time.
 */
export const qqeStrategy: Strategy<QqeParams, QqeState> = {
  type: "qqe",

  warmup: (params) => ({
    candleIntervals: [params.interval],
    needsBook: false,
    needsTrades: false,
  }),

  init: () => ({
    pendingEntry: null,
    exitRequested: false,
    cons: initialConsolidationState(),
    lastBarT: 0,
    inZone: false,
  }),

  onCandleClose: (ctx, params) => {
    const state = ctx.state
    // Full available history: the consolidation machine is path-dependent
    // from its first bar, so it must stay anchored at the series start (the
    // chart's anchor) rather than a sliding window. It replays history once,
    // then advances one bar per close — never recomputed from scratch, which
    // would be quadratic and block the event loop for the whole backtest.
    const candles = ctx
      .candles(params.interval, Number.MAX_SAFE_INTEGER)
      .filter((candle) => candle.T <= ctx.now)
    const minBars = Math.max(
      params.rsiPeriod * 4,
      params.loopbackPeriod + params.minConsolidationLen + 2
    )
    if (candles.length < minBars) return

    // QQE runs on a bounded window; RSI/EMA converge well within it.
    // QqeParams is a structural superset of QqeInputs, so params passes as-is.
    const window = candles.slice(-QQE_WINDOW_CANDLES)
    const qqe = computeQqeSeries(window, params)
    const last = window.length - 1

    const next: QqeState = { ...state, cons: { ...state.cons } }
    if (params.consolidationFilter) {
      const start = candles.findIndex((candle) => candle.t > state.lastBarT)
      if (start >= 0) {
        const highs = candles.map((candle) => Number(candle.h))
        const lows = candles.map((candle) => Number(candle.l))
        for (let i = start; i < candles.length; i += 1) {
          next.inZone = stepConsolidation(
            next.cons,
            highs,
            lows,
            i,
            params.loopbackPeriod,
            params.minConsolidationLen
          )
        }
        next.lastBarT = candles[candles.length - 1].t
      }
    }
    const pass = params.consolidationFilter ? !next.inZone : true

    const close = Number(window[last].c)
    const szi = Number(ctx.position?.szi ?? 0)
    if (qqe.buy[last] && pass && szi <= 0) {
      next.pendingEntry = "long"
      ctx.emit("signal", `QQE long: smoothed RSI crossed above ${50 + params.threshold} at ${close}.`)
    } else if (qqe.sell[last] && pass && szi >= 0) {
      next.pendingEntry = "short"
      ctx.emit("signal", `QQE short: smoothed RSI crossed below ${50 - params.threshold} at ${close}.`)
    }
    ctx.setState(next)
  },

  onTick: (ctx, params) => {
    const state = ctx.state
    if (!ctx.position || state.exitRequested) return
    if (!params.takeProfitPct && !params.stopLossPct) return
    const mid = Number(ctx.mid)
    const entry = Number(ctx.position.entryPx)
    if (!(mid > 0) || !(entry > 0)) return
    const szi = Number(ctx.position.szi)

    if (szi > 0) {
      if (params.takeProfitPct && mid >= entry * (1 + params.takeProfitPct / 100)) {
        requestExit(ctx, `Take profit hit at ${ctx.mid}.`)
      } else if (params.stopLossPct && mid <= entry * (1 - params.stopLossPct / 100)) {
        requestExit(ctx, `Stop loss hit at ${ctx.mid}.`)
      }
    } else if (szi < 0) {
      if (params.takeProfitPct && mid <= entry * (1 - params.takeProfitPct / 100)) {
        requestExit(ctx, `Take profit hit at ${ctx.mid}.`)
      } else if (params.stopLossPct && mid >= entry * (1 + params.stopLossPct / 100)) {
        requestExit(ctx, `Stop loss hit at ${ctx.mid}.`)
      }
    }
  },

  onFill: (ctx) => {
    if (!ctx.position) {
      ctx.setState({ ...ctx.state, pendingEntry: null, exitRequested: false })
    }
  },

  desiredOrders: (ctx: StrategyCtx<QqeState>, params: QqeParams) => {
    const state = ctx.state
    const mid = Number(ctx.mid)
    if (!(mid > 0)) return []
    const orders: DesiredOrder[] = []
    const szi = Number(ctx.position?.szi ?? 0)

    if (state.exitRequested && szi !== 0) {
      ctx.setState({ ...state, exitRequested: false })
      orders.push({
        purpose: "qqe:exit",
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
          purpose: "qqe:flip-close",
          side: szi > 0 ? "sell" : "buy",
          orderType: "market",
          sz: String(Math.abs(szi)),
          tif: "Ioc",
          reduceOnly: true,
        })
      }
      orders.push({
        purpose: "qqe:entry",
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

function requestExit(ctx: StrategyCtx<QqeState>, message: string) {
  ctx.setState({ ...ctx.state, exitRequested: true })
  ctx.emit("exit", message)
}
