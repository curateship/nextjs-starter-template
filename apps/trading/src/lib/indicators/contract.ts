import type { z } from "zod"

import type { IndicatorConfig } from "@/lib/trading/indicators-config"

/**
 * The indicator layer — the source of truth of the strategy system.
 * One module computes values, paints the chart, and emits buy/sell signals;
 * the SAME definition powers the chart, the live bot, and the backtest, so
 * what the chart paints is exactly what the strategy trades on.
 */

/** Numeric candle every indicator computes over (ms epoch open time). */
export type IndicatorCandle = {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

/** A discrete trigger the strategy acts on, at a closed candle's open time. */
export type IndicatorSignal = { time: number; side: "buy" | "sell" }

/**
 * Chart-agnostic paint. `indicators` rides the existing theme-aware
 * IndicatorConfig render path (EMA/Bollinger/base overlays and the
 * RSI/MACD sub-panes); lines/zones/barColors are raw series for anything
 * that path can't express (channels, consolidation zones, bar recoloring).
 */
export type IndicatorPaint = {
  indicators: IndicatorConfig[]
  lines: {
    id: string
    label: string
    color?: string
    points: { time: number; value: number }[]
  }[]
  zones: {
    id: string
    fromMs: number
    toMs: number
    top: number
    bottom: number
    fillColor?: string
  }[]
  barColors: { time: number; color: string }[]
}

export type IndicatorOutput = {
  paint: IndicatorPaint
  signals: IndicatorSignal[]
}

/** Field metadata the generic params form renders. */
export type IndicatorParamField = {
  key: string
  label: string
  kind?: "number" | "select" | "boolean"
  step?: number
  options?: string[]
  /** One plain sentence shown in an info tooltip beside the field's label. */
  info?: string
}

export type IndicatorModule<P = Record<string, unknown>> = {
  type: string
  label: string
  /** One plain-English sentence: what it watches and when it fires. */
  description: string
  paramsSchema: z.ZodType<P>
  defaultParams: P
  paramFields: IndicatorParamField[]
  /** Optional inspector sections. Fields not listed remain visible in Other settings. */
  paramGroups?: { title: string; keys: string[] }[]
  /** Bars of history needed before the last-bar signal is trustworthy. */
  warmupBars: (params: P) => number
  /** Pure and causal: computing over a prefix matches the full series. */
  compute: (candles: IndicatorCandle[], params: P) => IndicatorOutput
}

/** Static hexes legible on both themes (the chart lib can't read oklch). */
export const PAINT_COLORS = {
  up: "#089981",
  down: "#f23645",
  neutral: "#f59e0b",
  channelUpper: "#3b82f6",
  channelLower: "#f59e0b",
  zone: "rgba(41, 98, 255, 0.2)",
} as const
