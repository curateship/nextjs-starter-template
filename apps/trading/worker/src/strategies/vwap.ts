import type { VwapParams } from "@/lib/strategies/params"
import { marketEntryExitOrders } from "./contract"
import type { CandleInterval, Strategy, StrategyCtx } from "./contract"
import { crossedAbove, crossedBelow, vwap, vwapBands } from "@/lib/strategies/indicators"

export type VwapState = {
  /** Entry the strategy wants executed; consumed once emitted. */
  pendingEntry: "long" | "short" | null
  exitRequested: boolean
}

const MS_PER_DAY = 86_400_000
const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

/**
 * VWAP and its σ-bands re-anchor at each UTC-day boundary, so only the current
 * day's candles affect the live values. Scanning exactly one day (plus a small
 * buffer so the cross detector sees the prior close across a boundary) yields
 * identical numbers to a longer window — the earlier bars just reset away — at
 * a fraction of the work.
 */
function dayWindow(interval: CandleInterval): number {
  return Math.ceil(MS_PER_DAY / INTERVAL_MS[interval]) + 5
}

/**
 * Session-anchored VWAP strategy in two modes:
 *  - reversion: enter when the close stretches beyond the k·σ band, fade it
 *    back to the VWAP line (or opposite band) as the reversion target.
 *  - cross: trend-follow the close crossing the VWAP line, flipping on the
 *    opposite cross.
 * Entries and exits are market orders; optional TP/SL act as hard stops on
 * ticks. Signals evaluate on closed candles so VWAP is fully formed.
 */
export const vwapStrategy: Strategy<VwapParams, VwapState> = {
  type: "vwap",

  warmup: (params) => ({
    candleIntervals: [params.interval],
    needsBook: false,
    needsTrades: false,
  }),

  init: () => ({ pendingEntry: null, exitRequested: false }),

  onCandleClose: (ctx, params) => {
    const state = ctx.state
    const candles = ctx
      .candles(params.interval, dayWindow(params.interval))
      .filter((candle) => candle.T <= ctx.now)
    if (candles.length < 3) return
    const close = Number(candles[candles.length - 1].c)
    const szi = Number(ctx.position?.szi ?? 0)

    // Derive the day's VWAP series once, then reuse it for both the exit target
    // and the entry signal (recomputing it per check was the hot path).
    let signal: "long" | "short" | null = null
    if (params.mode === "reversion") {
      const { mid, upper, lower } = vwapBands(candles, params.bandK ?? 2)
      const line = mid[mid.length - 1]
      const up = upper[upper.length - 1]
      const lo = lower[lower.length - 1]
      if (!Number.isFinite(line)) return
      // Exit: a reversion trade unwinds when price reverts to its target.
      if (szi !== 0 && params.exitAt) {
        const target = params.exitAt === "vwap" ? line : szi > 0 ? up : lo
        if ((szi > 0 && close >= target) || (szi < 0 && close <= target)) {
          requestExit(ctx, `Reverted to target at ${close}.`)
          return
        }
      }
      if (close <= lo) signal = "long"
      else if (close >= up) signal = "short"
    } else {
      // cross: the opposite-cross exit is handled by the flip in desiredOrders.
      const line = vwap(candles)
      const closes = candles.map((candle) => Number(candle.c))
      if (crossedAbove(closes, line)) signal = "long"
      else if (crossedBelow(closes, line)) signal = "short"
    }

    if (!signal) return

    if (signal === "long" && szi <= 0) {
      if (params.direction === "short") return
      ctx.setState({ ...state, pendingEntry: "long" })
      ctx.emit("signal", `Long VWAP ${params.mode} signal at ${close}.`)
    } else if (signal === "short" && szi >= 0) {
      if (params.direction === "long") return
      ctx.setState({ ...state, pendingEntry: "short" })
      ctx.emit("signal", `Short VWAP ${params.mode} signal at ${close}.`)
    }
  },

  onTick: (ctx, params) => {
    const state = ctx.state
    if (!ctx.position || state.exitRequested) return
    if (!params.takeProfitPct && !params.stopLossPct) return
    const mid = Number(ctx.mid)
    if (!(mid > 0)) return
    const entry = Number(ctx.position.entryPx)
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
      ctx.setState({ pendingEntry: null, exitRequested: false })
    }
  },

  // Mirrors onTick's thresholds so backtest fills land at these levels.
  exitTriggers: (ctx, params) => {
    const state = ctx.state
    if (!ctx.position || state.exitRequested) return []
    if (!params.takeProfitPct && !params.stopLossPct) return []
    const entry = Number(ctx.position.entryPx)
    if (!(entry > 0)) return []
    const sign = Number(ctx.position.szi) > 0 ? 1 : -1
    const levels: number[] = []
    if (params.takeProfitPct) {
      levels.push(entry * (1 + (sign * params.takeProfitPct) / 100))
    }
    if (params.stopLossPct) {
      levels.push(entry * (1 - (sign * params.stopLossPct) / 100))
    }
    return levels
  },

  desiredOrders: (ctx: StrategyCtx<VwapState>, params: VwapParams) =>
    marketEntryExitOrders(ctx, {
      prefix: "vwap",
      compounding: params.compounding,
      orderSizeUsd: params.orderSizeUsd,
    }),
}

function requestExit(ctx: StrategyCtx<VwapState>, message: string) {
  ctx.setState({ ...ctx.state, exitRequested: true })
  ctx.emit("exit", message)
}
