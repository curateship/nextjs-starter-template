import type { SignalStrategyConfig } from "@/lib/strategies/strategy-config"
import type { IndicatorCandle } from "@/lib/indicators/contract"
import { INDICATORS } from "@/lib/indicators/registry"

import { marketEntryExitOrders } from "../strategies/contract"
import type { Strategy, StrategyCtx } from "../strategies/contract"
import {
  INITIAL_TRADE_STATE,
  applySignal,
  exitLevels,
  tickExit,
  type TradeState,
} from "./trade-manager"

/** Hub windows cap near ~1400 bars; never ask for more. */
const MAX_WINDOW = 1400

/**
 * THE strategy engine. One implementation of the worker Strategy contract
 * drives every new-model strategy: on each candle close it runs the picked
 * indicator (the same compute the chart paints), takes the last bar's signal,
 * and hands it to the trade manager; ticks check TP/SL; orders go out through
 * the shared market-entry helper. `exitTriggers` feeds the backtest's
 * intrabar pause from the same trade-manager math the live tick checks.
 */
export function createSignalStrategy(
  config: SignalStrategyConfig
): Strategy<never, TradeState> {
  const module = INDICATORS[config.indicator.type]
  const params = module.paramsSchema.parse(config.indicator.params) as never
  const window = Math.min(module.warmupBars(params) + 5, MAX_WINDOW)
  const settings = config.settings

  const position = (ctx: StrategyCtx<TradeState>) => ({
    szi: Number(ctx.position?.szi ?? 0),
    entryPx: Number(ctx.position?.entryPx ?? 0),
  })

  return {
    type: "signal",

    warmup: () => ({
      candleIntervals: [config.interval],
    }),

    init: () => ({ ...INITIAL_TRADE_STATE }),

    onCandleClose: (ctx) => {
      const raw = ctx
        .candles(config.interval, window)
        .filter((candle) => candle.T <= ctx.now)
      if (raw.length < 3) return
      const candles: IndicatorCandle[] = raw.map((candle) => ({
        t: candle.t,
        o: Number(candle.o),
        h: Number(candle.h),
        l: Number(candle.l),
        c: Number(candle.c),
        v: Number(candle.v),
      }))

      const output = module.compute(candles, params)
      const lastTime = candles[candles.length - 1].t
      const last = output.signals[output.signals.length - 1]
      if (!last || last.time !== lastTime) return

      const szi = position(ctx).szi
      const next = applySignal(ctx.state, settings, szi, last.side)
      if (next === ctx.state) return
      ctx.setState(next)
      if (next.pendingEntry) {
        ctx.emit(
          "signal",
          `${last.side === "buy" ? "Long" : "Short"} ${module.label} signal at ${candles[candles.length - 1].c}.`
        )
      } else if (next.exitRequested) {
        ctx.emit("exit", `Opposite ${module.label} signal; closing.`)
      }
    },

    onTick: (ctx) => {
      if (ctx.state.exitRequested) return
      const mid = Number(ctx.mid)
      const hit = tickExit(settings, position(ctx), ctx.state, mid)
      if (!hit) return
      ctx.setState({ ...ctx.state, exitRequested: true })
      ctx.emit(
        "exit",
        `${hit === "tp" ? "Take profit" : "Stop loss"} hit at ${ctx.mid}.`
      )
    },

    // Runs synchronously inside the runner's onFill before any DB write —
    // the state must reflect the fill before the next evaluate tick.
    onFill: (ctx) => {
      if (!ctx.position) {
        ctx.setState({ ...INITIAL_TRADE_STATE })
      }
    },

    exitTriggers: (ctx) => exitLevels(settings, position(ctx), ctx.state),

    desiredOrders: (ctx) =>
      marketEntryExitOrders(ctx, {
        prefix: "sig",
        compounding: settings.compounding,
        orderSizeUsd: settings.orderSizeUsd,
      }),
  }
}
