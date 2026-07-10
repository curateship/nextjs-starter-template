import { z } from "zod"

import { macd } from "@/lib/strategies/indicators"
import type { IndicatorModule, IndicatorOutput } from "../contract"
import { crossSignals } from "../edges"

const paramsSchema = z
  .object({
    fast: z.number().int().min(2).max(100),
    slow: z.number().int().min(3).max(200),
    signal: z.number().int().min(1).max(100),
  })
  .refine((p) => p.fast < p.slow, { message: "Fast period must be below slow" })

export type MacdCrossParams = z.infer<typeof paramsSchema>

/** MACD line crossing its signal line: buy above, sell below. */
export const macdCrossIndicator: IndicatorModule<MacdCrossParams> = {
  type: "macd_cross",
  label: "MACD Cross",
  description:
    "Momentum shift: buys when the MACD line crosses above its signal line, sells on the opposite cross.",
  paramsSchema,
  defaultParams: { fast: 12, slow: 26, signal: 9 },
  paramFields: [
    { key: "fast", label: "Fast" },
    { key: "slow", label: "Slow" },
    { key: "signal", label: "Signal" },
  ],
  warmupBars: (params) => Math.max((params.slow + params.signal) * 3, 100),

  compute: (candles, params): IndicatorOutput => {
    const closes = candles.map((candle) => candle.c)
    const times = candles.map((candle) => candle.t)
    const { macd: line, signal } = macd(closes, params.fast, params.slow, params.signal)
    return {
      paint: {
        indicators: [
          {
            id: "macd",
            type: "macd",
            enabled: true,
            params: { fast: params.fast, slow: params.slow, signal: params.signal },
          },
        ],
        lines: [],
        zones: [],
        barColors: [],
      },
      signals: crossSignals(times, line, signal),
    }
  },
}
