import { z } from "zod"

import { ema } from "@/lib/strategies/indicators"
import type { IndicatorModule, IndicatorOutput } from "../contract"
import { crossSignals } from "../edges"

const paramsSchema = z
  .object({
    fast: z.number().int().min(2).max(400),
    slow: z.number().int().min(3).max(400),
  })
  .refine((p) => p.fast < p.slow, { message: "Fast period must be below slow" })

export type EmaCrossParams = z.infer<typeof paramsSchema>

/**
 * Two-EMA cross — the legacy momentum strategy's ema_cross signal, extracted.
 * Buy when the fast average crosses above the slow, sell on the opposite
 * cross. minIndex reproduces momentum's `closes.length >= slow + 2` guard.
 */
export const emaCrossIndicator: IndicatorModule<EmaCrossParams> = {
  type: "ema_cross",
  label: "EMA Cross",
  description:
    "Two moving averages: fires buy when the fast one crosses above the slow one, sell on the opposite cross.",
  paramsSchema,
  defaultParams: { fast: 20, slow: 50 },
  paramFields: [
    { key: "fast", label: "Fast period" },
    { key: "slow", label: "Slow period" },
  ],
  warmupBars: (params) => Math.max(params.slow * 3, 60),

  compute: (candles, params): IndicatorOutput => {
    const closes = candles.map((candle) => candle.c)
    const times = candles.map((candle) => candle.t)
    const fast = ema(closes, params.fast)
    const slow = ema(closes, params.slow)
    return {
      paint: {
        indicators: [
          { id: "ema-fast", type: "ema", enabled: true, params: { period: params.fast } },
          { id: "ema-slow", type: "ema", enabled: true, params: { period: params.slow } },
        ],
        lines: [],
        zones: [],
        barColors: [],
      },
      signals: crossSignals(times, fast, slow, params.slow + 1),
    }
  },
}
