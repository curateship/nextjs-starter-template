import { z } from "zod"

import { ema } from "@/lib/strategies/indicators"
import type { IndicatorModule, IndicatorOutput } from "../contract"
import { crossSignals } from "../edges"

// Defaults keep configs saved before the third EMA existed behaving exactly
// as they did: EMA 3 stays off unless the user turns it on.
const paramsSchema = z
  .object({
    fast: z.number().int().min(2).max(400),
    slow: z.number().int().min(3).max(400),
    third: z.number().int().min(2).max(400).default(200),
    showFast: z.boolean().default(true),
    showSlow: z.boolean().default(true),
    showThird: z.boolean().default(false),
  })
  .refine((p) => p.fast < p.slow, {
    message: "EMA 1 period must be below EMA 2",
  })
  .refine(
    (p) => [p.showFast, p.showSlow, p.showThird].filter(Boolean).length >= 2,
    { message: "Turn on at least two EMAs" }
  )

export type EmaCrossParams = z.infer<typeof paramsSchema>

/**
 * Seed strategy params from the chart's saved EMA settings (numeric, toggles
 * as 0/1) so a fresh EMA Cross node starts as an exact copy of the chart.
 */
export function emaCrossParamsFromChart(
  chartParams: Record<string, number>
): EmaCrossParams {
  const params = { ...emaCrossIndicator.defaultParams }
  params.fast = chartParams.fast ?? params.fast
  params.slow = chartParams.slow ?? params.slow
  params.third = chartParams.third ?? params.third
  if (chartParams.showFast !== undefined) params.showFast = chartParams.showFast !== 0
  if (chartParams.showSlow !== undefined) params.showSlow = chartParams.showSlow !== 0
  if (chartParams.showThird !== undefined) params.showThird = chartParams.showThird !== 0
  return params
}

function enabledEmas(params: EmaCrossParams) {
  return [
    { id: "ema-fast", period: params.fast, on: params.showFast },
    { id: "ema-slow", period: params.slow, on: params.showSlow },
    { id: "ema-third", period: params.third, on: params.showThird },
  ]
    .filter((entry) => entry.on)
    .sort((a, b) => a.period - b.period)
}

/**
 * Up to three EMAs, each toggleable. All switched-on EMAs draw on the chart;
 * the buy/sell signal is the cross of the two FASTEST switched-on EMAs (buy
 * when the faster crosses above the slower, sell on the opposite cross).
 * minIndex reproduces the legacy momentum `closes.length >= slow + 2` guard.
 */
export const emaCrossIndicator: IndicatorModule<EmaCrossParams> = {
  type: "ema_cross",
  label: "EMA Cross",
  description:
    "Up to three moving averages with on/off switches: fires buy when the two fastest switched-on EMAs cross up, sell on the cross down.",
  paramsSchema,
  defaultParams: {
    fast: 20,
    slow: 50,
    third: 200,
    showFast: true,
    showSlow: true,
    showThird: true,
  },
  paramFields: [
    { key: "showFast", label: "EMA 1 on", kind: "boolean" },
    { key: "fast", label: "EMA 1 period" },
    { key: "showSlow", label: "EMA 2 on", kind: "boolean" },
    { key: "slow", label: "EMA 2 period" },
    { key: "showThird", label: "EMA 3 on", kind: "boolean" },
    { key: "third", label: "EMA 3 period" },
  ],
  warmupBars: (params) =>
    Math.max(
      Math.max(params.slow, params.showThird ? params.third : 0) * 3,
      60
    ),

  compute: (candles, params): IndicatorOutput => {
    const closes = candles.map((candle) => candle.c)
    const times = candles.map((candle) => candle.t)
    const emas = enabledEmas(params)
    const [faster, slower] = emas
    return {
      paint: {
        // One multi-line EMA indicator — the exact shape the chart's own EMA
        // overlay uses, so chart and strategy always draw the same thing.
        indicators: [
          {
            // Distinct from the chart overlay's own "ema" id so a previewed
            // strategy never collides with the user's enabled EMA series.
            id: "ema-cross",
            type: "ema" as const,
            enabled: true,
            params: {
              fast: params.fast,
              slow: params.slow,
              third: params.third,
              showFast: params.showFast ? 1 : 0,
              showSlow: params.showSlow ? 1 : 0,
              showThird: params.showThird ? 1 : 0,
            },
          },
        ],
        lines: [],
        zones: [],
        barColors: [],
      },
      signals: crossSignals(
        times,
        ema(closes, faster.period),
        ema(closes, slower.period),
        slower.period + 1
      ),
    }
  },
}
