import { z } from "zod"

import { bollinger } from "@/lib/strategies/indicators"
import type { IndicatorModule, IndicatorOutput, IndicatorSignal } from "../contract"
import { crossSignals } from "../edges"

const paramsSchema = z.object({
  period: z.number().int().min(3).max(200),
  k: z.number().positive().max(10),
  /** revert: fade band touches back to the middle; breakout: follow band breaks. */
  mode: z.enum(["revert", "breakout"]),
})

export type BollingerParams = z.infer<typeof paramsSchema>

/**
 * Bollinger bands in two flavors. revert: buy when price crosses back above
 * the lower band (snap-back), sell when it crosses back below the upper.
 * breakout: buy on a close crossing above the upper band, sell below the lower.
 */
export const bollingerIndicator: IndicatorModule<BollingerParams> = {
  type: "bollinger",
  label: "Bollinger",
  description:
    "Volatility bands around the average price — either fades moves beyond the bands or follows band breakouts.",
  paramsSchema,
  defaultParams: { period: 20, k: 2, mode: "revert" },
  paramFields: [
    { key: "period", label: "Period" },
    { key: "k", label: "StdDev", step: 0.5 },
    { key: "mode", label: "Mode", kind: "select", options: ["revert", "breakout"] },
  ],
  warmupBars: (params) => Math.max(params.period * 3, 60),

  compute: (candles, params): IndicatorOutput => {
    const closes = candles.map((candle) => candle.c)
    const times = candles.map((candle) => candle.t)
    const { upper, lower } = bollinger(closes, params.period, params.k)

    let signals: IndicatorSignal[]
    if (params.mode === "revert") {
      // closes crossing back above lower → buy; below upper → sell.
      const backAbove = crossSignals(times, closes, lower).filter((s) => s.side === "buy")
      const backBelow = crossSignals(times, closes, upper).filter((s) => s.side === "sell")
      signals = [...backAbove, ...backBelow].sort((a, b) => a.time - b.time)
    } else {
      const breakUp = crossSignals(times, closes, upper).filter((s) => s.side === "buy")
      const breakDown = crossSignals(times, closes, lower).filter((s) => s.side === "sell")
      signals = [...breakUp, ...breakDown].sort((a, b) => a.time - b.time)
    }

    return {
      paint: {
        indicators: [
          {
            id: "bollinger",
            type: "bollinger",
            enabled: true,
            params: { period: params.period, k: params.k },
          },
        ],
        lines: [],
        zones: [],
        barColors: [],
      },
      signals,
    }
  },
}
