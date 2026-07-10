import type { MomentumParams } from "@/lib/strategies/params"
import { BARS_PER_DAY, marketEntryExitOrders } from "./contract"
import type { Strategy, StrategyCtx } from "./contract"
import {
  adx,
  atr,
  crossedAbove,
  crossedBelow,
  ema,
  highest,
  lowest,
  macd,
  qflBase,
  rsi,
} from "@/lib/strategies/indicators"

export type MomentumState = {
  /** Entry the strategy wants executed; consumed once emitted. */
  pendingEntry: "long" | "short" | null
  exitRequested: boolean
  /** Active trailing stop level: percent trail or ATR chandelier. */
  trailPx: number | null
  /** Re-entries taken in the current trend leg (reentry mode). Optional so
   *  states persisted before the field existed stay valid. */
  reentriesUsed?: number
  /** Vol-target size multiplier snapshotted at the last close (≤ 1). */
  sizeScale?: number | null
}

const WARMUP_CANDLES = 400

/**
 * Signal-driven entries at candle close (EMA cross, RSI, or breakout),
 * managed with an optional stop evaluated on ticks (trailing %, QFL base
 * break, or ATR chandelier). Optional entry gates (ADX trend strength, MACD
 * histogram agreement), trend re-entry after stop-outs, and vol-target
 * sizing that shrinks bets on high-volatility coins. Entries and exits
 * execute as market orders; the pending flags are consumed by desiredOrders
 * so each signal fires exactly one order.
 */
export const momentumStrategy: Strategy<MomentumParams, MomentumState> = {
  type: "momentum",

  warmup: (params) => ({
    candleIntervals: [params.interval],
    needsBook: false,
    needsTrades: false,
  }),

  init: () => ({
    pendingEntry: null,
    exitRequested: false,
    trailPx: null,
    reentriesUsed: 0,
    sizeScale: null,
  }),

  onCandleClose: (ctx, params) => {
    const state = ctx.state
    const candles = ctx
      .candles(params.interval, WARMUP_CANDLES)
      .filter((candle) => candle.T <= ctx.now)
    if (candles.length < 3) return
    const closes = candles.map((candle) => Number(candle.c))
    const highs = candles.map((candle) => Number(candle.h))
    const lows = candles.map((candle) => Number(candle.l))
    const close = closes[closes.length - 1]
    const szi = Number(ctx.position?.szi ?? 0)

    // Per-close bookkeeping. State changes are collected into `next` and
    // committed once — multiple setState calls in one close would clobber
    // each other because ctx.state is a snapshot.
    let next = state
    const atrNow = needsAtr(params)
      ? lastAtr(highs, lows, closes, params)
      : null

    // ATR chandelier: trail at close ∓ mult×ATR, only ever ratcheting in the
    // trade's favor.
    if (
      params.stopMode === "atr" &&
      params.atrStopMult &&
      szi !== 0 &&
      atrNow !== null
    ) {
      const raw =
        szi > 0
          ? close - params.atrStopMult * atrNow
          : close + params.atrStopMult * atrNow
      const prev = next.trailPx
      const level =
        szi > 0 ? Math.max(prev ?? raw, raw) : Math.min(prev ?? raw, raw)
      if (level !== prev) next = { ...next, trailPx: level }
    }

    // Vol-target sizing: entries scale DOWN when the coin's ATR-implied daily
    // volatility exceeds the target; calm coins trade at full size (cap 1×).
    if (params.volTargetPct && atrNow !== null && close > 0) {
      const dailyVolPct =
        (atrNow / close) * 100 * Math.sqrt(BARS_PER_DAY[params.interval] ?? 24)
      const scale =
        dailyVolPct > 0 ? Math.min(1, params.volTargetPct / dailyVolPct) : 1
      if (scale !== next.sizeScale) next = { ...next, sizeScale: scale }
    }

    const signal = readSignal(params, closes, candles)
    let exitMsg: string | null = null

    if (signal === "long" && szi <= 0) {
      if (params.direction === "short") {
        if (szi < 0) exitMsg = "Signal flipped long; closing short."
      } else if (entryGatesPass(params, highs, lows, closes, "long")) {
        next = { ...next, pendingEntry: "long", trailPx: null, reentriesUsed: 0 }
        ctx.emit("signal", `Long signal (${params.signal}) at ${close}.`)
      } else if (szi < 0) {
        // Opposite cross always closes; the gates only guard new entries.
        exitMsg = "Signal flipped long; closing short (entry gated off)."
      }
    } else if (signal === "short" && szi >= 0) {
      if (params.direction === "long") {
        if (szi > 0) exitMsg = "Signal flipped short; closing long."
      } else if (entryGatesPass(params, highs, lows, closes, "short")) {
        next = { ...next, pendingEntry: "short", trailPx: null, reentriesUsed: 0 }
        ctx.emit("signal", `Short signal (${params.signal}) at ${close}.`)
      } else if (szi > 0) {
        exitMsg = "Signal flipped short; closing long (entry gated off)."
      }
    } else if (
      !signal &&
      params.reentry &&
      params.signal === "ema_cross" &&
      params.emaFast &&
      params.emaSlow &&
      szi === 0 &&
      !state.pendingEntry &&
      (state.reentriesUsed ?? 0) < (params.maxReentries ?? Infinity) &&
      closes.length >= params.emaSlow + 2
    ) {
      // Flat after a stop-out but the trend still holds: rejoin on a
      // continuation close in the trend's direction.
      const fast = ema(closes, params.emaFast)
      const slow = ema(closes, params.emaSlow)
      const f = fast[fast.length - 1]
      const s = slow[slow.length - 1]
      const prevClose = closes[closes.length - 2]
      if (
        f > s &&
        close > prevClose &&
        params.direction !== "short" &&
        entryGatesPass(params, highs, lows, closes, "long")
      ) {
        next = {
          ...next,
          pendingEntry: "long",
          trailPx: null,
          reentriesUsed: (state.reentriesUsed ?? 0) + 1,
        }
        ctx.emit("signal", `Re-entry long: trend holding at ${close}.`)
      } else if (
        f < s &&
        close < prevClose &&
        params.direction !== "long" &&
        entryGatesPass(params, highs, lows, closes, "short")
      ) {
        next = {
          ...next,
          pendingEntry: "short",
          trailPx: null,
          reentriesUsed: (state.reentriesUsed ?? 0) + 1,
        }
        ctx.emit("signal", `Re-entry short: trend holding at ${close}.`)
      }
    }

    if (exitMsg) {
      next = { ...next, exitRequested: true }
      ctx.emit("exit", exitMsg)
    }
    if (next !== state) ctx.setState(next)
  },

  onTick: (ctx, params) => {
    const state = ctx.state
    if (!ctx.position || state.exitRequested) return
    const mid = Number(ctx.mid)
    if (!(mid > 0)) return
    const szi = Number(ctx.position.szi)

    // QFL base stop: exit a long when price breaks below the current base
    // (its support). The base is a swing-low support, so it only guards longs;
    // shorts exit on the opposite signal. Recomputed here from closed candles
    // — cheap and needs no stored state.
    if (params.stopMode === "base") {
      if (szi <= 0) return
      const level = qflStopLevel(ctx, params)
      if (level === null) return
      if (mid <= level) {
        requestExit(ctx, `Price broke the QFL base at ${ctx.mid}.`)
      }
      return
    }

    // ATR chandelier stop: the level is ratcheted on closes (and seeded on the
    // entry fill); ticks just check the break.
    if (params.stopMode === "atr") {
      const level = state.trailPx
      if (!params.atrStopMult || level === null) return
      if ((szi > 0 && mid <= level) || (szi < 0 && mid >= level)) {
        requestExit(ctx, `ATR stop hit at ${ctx.mid}.`)
      }
      return
    }

    // Trailing percent stop.
    if (!params.trailingStopPct) return
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

  onFill: (ctx, params) => {
    if (!ctx.position) {
      // Spread keeps reentriesUsed across the cycle reset on purpose: the
      // re-entry cap counts per trend leg, not per trade.
      ctx.setState({
        ...ctx.state,
        pendingEntry: null,
        exitRequested: false,
        trailPx: null,
      })
      return
    }
    // Seed the ATR stop at the entry fill so the trade's first bar is
    // protected (the close-time ratchet takes over from there).
    if (
      params.stopMode === "atr" &&
      params.atrStopMult &&
      ctx.state.trailPx === null
    ) {
      const candles = ctx
        .candles(params.interval, WARMUP_CANDLES)
        .filter((candle) => candle.T <= ctx.now)
      const closes = candles.map((candle) => Number(candle.c))
      const value = lastAtr(
        candles.map((candle) => Number(candle.h)),
        candles.map((candle) => Number(candle.l)),
        closes,
        params
      )
      const entry = Number(ctx.position.entryPx)
      if (value !== null && entry > 0) {
        const long = Number(ctx.position.szi) > 0
        ctx.setState({
          ...ctx.state,
          trailPx: long
            ? entry - params.atrStopMult * value
            : entry + params.atrStopMult * value,
        })
      }
    }
  },

  // Mirrors onTick's thresholds so backtest fills land at these levels.
  exitTriggers: (ctx, params) => {
    const state = ctx.state
    if (!ctx.position || state.exitRequested) return []
    const szi = Number(ctx.position.szi)

    if (params.stopMode === "base") {
      if (szi <= 0) return []
      const level = qflStopLevel(ctx, params)
      return level === null ? [] : [level]
    }

    if (params.stopMode === "atr") {
      return params.atrStopMult && state.trailPx !== null
        ? [state.trailPx]
        : []
    }

    if (!params.trailingStopPct || state.trailPx === null) return []
    return [state.trailPx]
  },

  desiredOrders: (ctx: StrategyCtx<MomentumState>, params: MomentumParams) =>
    marketEntryExitOrders(ctx, {
      prefix: "momo",
      compounding: params.compounding,
      orderSizeUsd: params.orderSizeUsd,
      // Vol targeting shrinks (never grows) the bet on high-volatility coins.
      sizeScale: params.volTargetPct
        ? Math.min(1, ctx.state.sizeScale ?? 1)
        : 1,
    }),
}

function requestExit(ctx: StrategyCtx<MomentumState>, message: string) {
  ctx.setState({ ...ctx.state, exitRequested: true })
  ctx.emit("exit", message)
}

function needsAtr(params: MomentumParams): boolean {
  return (
    (params.stopMode === "atr" && !!params.atrStopMult) || !!params.volTargetPct
  )
}

/** Latest Wilder ATR over the params' lookback (default 14), or null. */
function lastAtr(
  highs: number[],
  lows: number[],
  closes: number[],
  params: MomentumParams
): number | null {
  const series = atr(highs, lows, closes, params.atrPeriod ?? 14)
  const value = series[series.length - 1]
  return Number.isNaN(value) ? null : value
}

/**
 * Entry-quality gates: ADX trend strength and MACD histogram agreement.
 * Gates guard new entries only — opposite-signal exits always run.
 */
function entryGatesPass(
  params: MomentumParams,
  highs: number[],
  lows: number[],
  closes: number[],
  dir: "long" | "short"
): boolean {
  if (params.adxMin) {
    const series = adx(highs, lows, closes, params.adxPeriod ?? 14)
    const value = series[series.length - 1]
    if (Number.isNaN(value) || value < params.adxMin) return false
  }
  if (params.macdFilter) {
    const { hist } = macd(closes)
    const value = hist[hist.length - 1]
    if (Number.isNaN(value)) return false
    if (dir === "long" ? value <= 0 : value >= 0) return false
  }
  return true
}

/** Current QFL base (swing-low support) from closed candles, or null. */
function qflStopLevel(
  ctx: StrategyCtx<MomentumState>,
  params: MomentumParams
): number | null {
  if (!params.basePeriods || !params.pumpPeriods) return null
  const candles = ctx
    .candles(params.interval, params.basePeriods + params.pumpPeriods + 2)
    .filter((candle) => candle.T <= ctx.now)
  const { raw } = qflBase(candles, params.basePeriods, params.pumpPeriods)
  const level = raw[raw.length - 1]
  return Number.isNaN(level) ? null : level
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
