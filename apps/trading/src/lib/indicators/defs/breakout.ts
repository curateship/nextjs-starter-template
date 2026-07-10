import { z } from "zod"

import { highest, lowest } from "@/lib/strategies/indicators"
import type { IndicatorModule, IndicatorOutput, IndicatorSignal } from "../contract"
import { PAINT_COLORS } from "../contract"

const paramsSchema = z.object({
  lookback: z.number().int().min(3).max(400),
})

export type BreakoutParams = z.infer<typeof paramsSchema>

/**
 * Channel breakout — the legacy momentum strategy's breakout signal. Buy when
 * a close exceeds the highest high of the previous `lookback` bars, sell when
 * it breaks below the lowest low (the breaking bar itself is excluded from
 * the window, matching the worker's slice(-lookback-1, -1)).
 */
export const breakoutIndicator: IndicatorModule<BreakoutParams> = {
  type: "breakout",
  label: "Breakout",
  description:
    "Buys when price closes above its recent high-water mark, sells when it closes below the recent low.",
  paramsSchema,
  defaultParams: { lookback: 55 },
  paramFields: [{ key: "lookback", label: "Lookback bars" }],
  warmupBars: (params) => params.lookback + 10,

  compute: (candles, params): IndicatorOutput => {
    const lookback = params.lookback
    const signals: IndicatorSignal[] = []
    const upper: { time: number; value: number }[] = []
    const lower: { time: number; value: number }[] = []
    for (let i = lookback; i < candles.length; i += 1) {
      const window = candles.slice(i - lookback, i)
      const high = highest(window.map((candle) => candle.h))
      const low = lowest(window.map((candle) => candle.l))
      upper.push({ time: candles[i].t, value: high })
      lower.push({ time: candles[i].t, value: low })
      const close = candles[i].c
      if (close > high) signals.push({ time: candles[i].t, side: "buy" })
      else if (close < low) signals.push({ time: candles[i].t, side: "sell" })
    }
    return {
      paint: {
        indicators: [],
        lines: [
          { id: "breakout-high", label: `High ${lookback}`, color: PAINT_COLORS.channelUpper, points: upper },
          { id: "breakout-low", label: `Low ${lookback}`, color: PAINT_COLORS.channelLower, points: lower },
        ],
        zones: [],
        barColors: [],
      },
      signals,
    }
  },
}
