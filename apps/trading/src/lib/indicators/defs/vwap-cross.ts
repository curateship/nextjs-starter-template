import { z } from "zod"

import { vwap, vwapBands } from "@/lib/strategies/indicators"
import type { IndicatorModule, IndicatorOutput } from "../contract"
import { PAINT_COLORS } from "../contract"
import { crossSignals } from "../edges"

const paramsSchema = z.object({
  /** 0 hides the σ-bands; > 0 paints them at k standard deviations. */
  bandK: z.number().min(0).max(10),
})

export type VwapCrossParams = z.infer<typeof paramsSchema>

/**
 * Session-anchored VWAP cross — the legacy VWAP strategy's cross mode.
 * VWAP re-anchors at each UTC-day boundary; signals fire when the close
 * crosses the line, exactly like the worker's crossedAbove/Below check.
 */
export const vwapCrossIndicator: IndicatorModule<VwapCrossParams> = {
  type: "vwap_cross",
  label: "VWAP Cross",
  description:
    "Buys when price crosses above the day's volume-weighted average price, sells when it crosses below.",
  paramsSchema,
  defaultParams: { bandK: 0 },
  paramFields: [{ key: "bandK", label: "Band σ (0 = off)", step: 0.5 }],
  // Session-anchored: two 1-minute days is the worst case a window must cover.
  warmupBars: () => 600,

  compute: (candles, params): IndicatorOutput => {
    const closes = candles.map((candle) => candle.c)
    const times = candles.map((candle) => candle.t)
    const line = vwap(candles)

    const lines: IndicatorOutput["paint"]["lines"] = []
    if (params.bandK > 0) {
      const { upper, lower } = vwapBands(candles, params.bandK)
      const upperPts: { time: number; value: number }[] = []
      const lowerPts: { time: number; value: number }[] = []
      for (let i = 0; i < candles.length; i += 1) {
        if (Number.isFinite(upper[i])) {
          upperPts.push({ time: candles[i].t, value: upper[i] })
          lowerPts.push({ time: candles[i].t, value: lower[i] })
        }
      }
      lines.push(
        { id: "vwap-upper", label: `+${params.bandK}σ`, color: PAINT_COLORS.channelUpper, points: upperPts },
        { id: "vwap-lower", label: `−${params.bandK}σ`, color: PAINT_COLORS.channelLower, points: lowerPts }
      )
    }

    return {
      paint: {
        indicators: [{ id: "vwap", type: "vwap", enabled: true, params: {} }],
        lines,
        zones: [],
        barColors: [],
      },
      // minIndex 2 mirrors the legacy worker's `candles.length < 3` guard.
      signals: crossSignals(times, closes, line, 2),
    }
  },
}
