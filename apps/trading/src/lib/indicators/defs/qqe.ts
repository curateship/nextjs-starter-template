import { z } from "zod"

import {
  computeConsolidation,
  computeQqeSeries,
  computeSwings,
} from "@/lib/strategies/qqe"
import type { IndicatorModule, IndicatorOutput, IndicatorSignal } from "../contract"
import { PAINT_COLORS } from "../contract"

const paramsSchema = z.object({
  rsiPeriod: z.number().int().min(2).max(100),
  rsiSmoothing: z.number().int().min(1).max(50),
  qqeFactor: z.number().positive().max(20),
  threshold: z.number().min(0).max(50),
  maType: z.enum([
    "ALMA", "EMA", "DEMA", "TEMA", "WMA", "VWMA", "SMA", "SMMA", "HMA", "LSMA", "PEMA",
  ]),
  rsiSource: z.enum(["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"]),
  /** Suppress signals while the market sits in a consolidation zone. */
  consolidationFilter: z.boolean(),
  loopbackPeriod: z.number().int().min(2).max(400),
  minConsolidationLen: z.number().int().min(2).max(100),
  /** Trailing window (bars) a bar must top/bottom to count as a swing pivot. */
  swingLookback: z.number().int().min(2).max(400),
})

export type QqeIndicatorParams = z.infer<typeof paramsSchema>

/**
 * QQE + consolidation filter, the exact series the legacy QQE strategy traded
 * and the backtest chart painted. Signals: a QQE buy/sell cross on a bar the
 * consolidation filter passes — identical to backtest-overlays' fresh-cross
 * rule and the worker strategy's trigger.
 */
export const qqeIndicator: IndicatorModule<QqeIndicatorParams> = {
  type: "qqe",
  label: "QQE + Consolidation",
  description:
    "Smoothed-RSI trend flips (QQE), with an optional filter that ignores flips inside sideways chop zones.",
  paramsSchema,
  defaultParams: {
    rsiPeriod: 14,
    rsiSmoothing: 5,
    qqeFactor: 4.238,
    threshold: 10,
    maType: "EMA",
    rsiSource: "close",
    consolidationFilter: true,
    loopbackPeriod: 50,
    minConsolidationLen: 5,
    swingLookback: 50,
  },
  paramFields: [
    { key: "rsiPeriod", label: "RSI period" },
    { key: "rsiSmoothing", label: "RSI smoothing" },
    { key: "qqeFactor", label: "QQE factor", step: 0.1 },
    { key: "threshold", label: "Threshold", step: 0.5 },
    {
      key: "maType",
      label: "MA type",
      kind: "select",
      options: ["ALMA", "EMA", "DEMA", "TEMA", "WMA", "VWMA", "SMA", "SMMA", "HMA", "LSMA", "PEMA"],
    },
    {
      key: "rsiSource",
      label: "RSI source",
      kind: "select",
      options: ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"],
    },
    { key: "consolidationFilter", label: "Consolidation filter", kind: "boolean" },
    { key: "loopbackPeriod", label: "Consolidation lookback" },
    { key: "minConsolidationLen", label: "Min consolidation bars" },
    { key: "swingLookback", label: "Swing lookback" },
  ],
  warmupBars: (params) =>
    Math.max(params.loopbackPeriod + params.minConsolidationLen, params.swingLookback * 2, 400),

  compute: (candles, params): IndicatorOutput => {
    const qqe = computeQqeSeries(candles, params)
    const cons = computeConsolidation(
      candles,
      params.loopbackPeriod,
      params.minConsolidationLen
    )

    const signals: IndicatorSignal[] = []
    for (let i = 0; i < candles.length; i += 1) {
      const pass = params.consolidationFilter ? !cons.inZone[i] : true
      if (!pass) continue
      if (qqe.buy[i]) signals.push({ time: candles[i].t, side: "buy" })
      else if (qqe.sell[i]) signals.push({ time: candles[i].t, side: "sell" })
    }

    const barColors: { time: number; color: string }[] = []
    for (let i = 0; i < candles.length; i += 1) {
      const state = qqe.barColor[i]
      if (!state) continue
      const color =
        state === "green"
          ? PAINT_COLORS.up
          : state === "red"
            ? PAINT_COLORS.down
            : PAINT_COLORS.neutral
      barColors.push({ time: candles[i].t, color })
    }

    const zones = cons.zones.map((zone) => ({
      id: `qqe-zone-${zone.startIndex}`,
      fromMs: candles[zone.startIndex].t,
      toMs: candles[zone.endIndex].t,
      top: zone.high,
      bottom: zone.low,
      fillColor: PAINT_COLORS.zone,
    }))

    // Short horizontal marks at swing pivots (a held-forward line reads as a
    // jumbled staircase; a long segment floats as a shelf over later candles).
    const swings = computeSwings(candles, params.swingLookback)
    const HALF = 2
    const mark = (pivot: { index: number; value: number }) => {
      const start = Math.max(0, pivot.index - HALF)
      const end = Math.min(pivot.index + HALF, candles.length - 1)
      return [
        { time: candles[start].t, value: pivot.value },
        { time: candles[end].t, value: pivot.value },
      ]
    }
    const lines = [
      ...swings.highPivots.map((pivot) => ({
        id: `swing-high-${pivot.index}`,
        label: "",
        color: PAINT_COLORS.up,
        points: mark(pivot),
      })),
      ...swings.lowPivots.map((pivot) => ({
        id: `swing-low-${pivot.index}`,
        label: "",
        color: PAINT_COLORS.down,
        points: mark(pivot),
      })),
    ]

    return { paint: { indicators: [], lines, zones, barColors }, signals }
  },
}
