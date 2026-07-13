import { z } from "zod"

import { computeTrendlines } from "@/lib/strategies/trendline"
import type {
  IndicatorModule,
  IndicatorOutput,
  IndicatorSignal,
} from "../contract"
import { PAINT_COLORS } from "../contract"

const paramsSchema = z.object({
  swingLookback: z.number().int().min(2).max(400).default(30),
  breakBuffer: z.number().min(0).max(10).default(0.1),
  requireCounterSlope: z.boolean().default(true),
})

export type TrendlineIndicatorParams = z.infer<typeof paramsSchema>

export const trendlineIndicator: IndicatorModule<TrendlineIndicatorParams> = {
  type: "trendline",
  label: "Trendline Break",
  description:
    "Draws lines across major swing points and fires when a candle closes through one.",
  paramsSchema,
  defaultParams: {
    swingLookback: 30,
    breakBuffer: 0.1,
    requireCounterSlope: true,
  },
  paramFields: [
    {
      key: "swingLookback",
      label: "Swing lookback",
    },
    {
      key: "breakBuffer",
      label: "Break buffer %",
      step: 0.1,
    },
    {
      key: "requireCounterSlope",
      label: "Require trend flip",
      kind: "boolean",
    },
  ],
  warmupBars: (params) => Math.max(100, params.swingLookback * 3),

  compute: (candles, params): IndicatorOutput => {
    const series = computeTrendlines(candles, params)
    const signals: IndicatorSignal[] = []
    for (let i = 0; i < candles.length; i += 1) {
      if (series.buy[i]) signals.push({ time: candles[i].t, side: "buy" })
      else if (series.sell[i])
        signals.push({ time: candles[i].t, side: "sell" })
    }
    const line = (
      id: string,
      label: string,
      color: string,
      pivots: typeof series.highPivots,
      values: number[]
    ) => {
      if (pivots.length < 2) return []
      const a = pivots[pivots.length - 2]
      const b = pivots[pivots.length - 1]
      const last = candles.length - 1
      return [
        {
          id,
          label,
          color,
          points: [
            { time: candles[a.index].t, value: a.value },
            { time: candles[b.index].t, value: b.value },
            ...(last > b.index && Number.isFinite(values[last])
              ? [{ time: candles[last].t, value: values[last] }]
              : []),
          ],
        },
      ]
    }
    const lines = [
      ...line(
        "trendline-resistance",
        "Resistance",
        PAINT_COLORS.down,
        series.highPivots,
        series.resistance
      ),
      ...line(
        "trendline-support",
        "Support",
        PAINT_COLORS.up,
        series.lowPivots,
        series.support
      ),
    ]

    return {
      paint: { indicators: [], lines, zones: [], barColors: [] },
      signals,
    }
  },
}

export function trendlineParamsFromChart(
  params: Record<string, number>
): TrendlineIndicatorParams {
  return paramsSchema.parse({
    swingLookback: params.swingLookback,
    breakBuffer: params.breakBuffer,
    requireCounterSlope: (params.requireCounterSlope ?? 1) !== 0,
  })
}
