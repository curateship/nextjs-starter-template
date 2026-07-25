/**
 * Pure indicator paint, shared by every chart that shows the user's pinned
 * indicators (live trading chart, practice replay). Each function maps the
 * user's IndicatorConfig + a plain candle array to chart-ready markers,
 * overlay lines, zones, and bar colors through the SAME indicator modules the
 * strategies trade — no websocket or component coupling.
 */

import {
  outputToOverlays,
} from "@/components/chart/indicator-overlays"
import type { ChartMarker } from "@/components/chart/chart-markers"
import type {
  ChartBarColor,
  ChartCandle,
  ChartOverlayLine,
  ChartZone,
} from "@/components/chart/price-chart"
import { INDICATORS } from "@/lib/indicators/registry"
import {
  baseChartToModuleParams,
  bollingerChartToModuleParams,
  emaLines,
  fairValueGapChartToModuleParams,
  priceActionChartToModuleParams,
  qqeChartToModuleParams,
  trendlineChartToModuleParams,
  type IndicatorConfig,
} from "@/lib/trading/indicators-config"
import { sessionsInRange } from "@/lib/trading/sessions"

type NumericCandle = {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

export type IndicatorPaint = {
  markers: ChartMarker[]
  overlayLines: ChartOverlayLine[]
  zones: ChartZone[]
  barColors: ChartBarColor[]
}

export const EMPTY_INDICATOR_PAINT: IndicatorPaint = {
  markers: [],
  overlayLines: [],
  zones: [],
  barColors: [],
}

export function toNumericCandles(candles: ChartCandle[]): NumericCandle[] {
  return candles.map((c) => ({
    t: c.t,
    o: Number(c.o),
    h: Number(c.h),
    l: Number(c.l),
    c: Number(c.c),
    v: Number(c.v),
  }))
}

/** Signal → native arrow at that candle's close price. */
function signalMarkers(
  signals: { time: number; side: "buy" | "sell" }[],
  numeric: NumericCandle[]
): ChartMarker[] {
  const closeAt = new Map(numeric.map((c) => [c.t, c.c]))
  return signals.flatMap((signal) => {
    const price = closeAt.get(signal.time)
    return price ? [{ time: signal.time, side: signal.side, price }] : []
  })
}

/** QQE: chop zones, bar colors, swing overlays, and buy/sell arrows. */
export function qqePaint(
  cfg: IndicatorConfig | undefined,
  numeric: NumericCandle[]
): IndicatorPaint {
  if (!cfg?.enabled || numeric.length === 0) return EMPTY_INDICATOR_PAINT
  const out = INDICATORS.qqe.compute(
    numeric,
    qqeChartToModuleParams(cfg.params) as never
  )
  const overlays = outputToOverlays(out)
  return {
    overlayLines: overlays.overlayLines,
    zones: overlays.zones,
    barColors: overlays.barColors,
    markers: signalMarkers(out.signals, numeric),
  }
}

/**
 * EMA cross arrows: with at least two EMA lines on, the two FASTEST fire a
 * long arrow when the faster crosses above the slower and a short on the
 * cross back — the same signal the EMA Cross strategy trades.
 */
export function emaCrossPaint(
  cfg: IndicatorConfig | undefined,
  numeric: NumericCandle[]
): ChartMarker[] {
  if (!cfg?.enabled || numeric.length === 0) return []
  const periods = emaLines(cfg.params)
    .map((line) => cfg.params[line.periodKey])
    .sort((a, b) => a - b)
  if (periods.length < 2) return []
  const [fast, slow] = periods
  if (fast === slow) return []
  const out = INDICATORS.ema_cross.compute(numeric, {
    fast,
    slow,
    third: slow,
    showFast: true,
    showSlow: true,
    showThird: false,
  } as never)
  return signalMarkers(out.signals, numeric)
}

/** Price Action pattern arrows — the same detector the strategy trades. */
export function priceActionPaint(
  cfg: IndicatorConfig | undefined,
  numeric: NumericCandle[]
): ChartMarker[] {
  if (!cfg?.enabled || numeric.length === 0) return []
  const out = INDICATORS.price_action.compute(
    numeric,
    priceActionChartToModuleParams(cfg.params) as never
  )
  return signalMarkers(out.signals, numeric)
}

/** Fair Value Gap imbalance boxes (no signal arrows by design). */
export function fvgPaint(
  cfg: IndicatorConfig | undefined,
  numeric: NumericCandle[]
): ChartZone[] {
  if (!cfg?.enabled || numeric.length === 0) return []
  const out = INDICATORS.fair_value_gap.compute(
    numeric,
    fairValueGapChartToModuleParams(cfg.params) as never
  )
  return outputToOverlays(out).zones
}

/** Auto-drawn trendlines plus their break arrows. */
export function trendlinePaint(
  cfg: IndicatorConfig | undefined,
  numeric: NumericCandle[]
): { overlayLines: ChartOverlayLine[]; markers: ChartMarker[] } {
  if (!cfg?.enabled || numeric.length === 0) {
    return { overlayLines: [], markers: [] }
  }
  const out = INDICATORS.trendline.compute(
    numeric,
    trendlineChartToModuleParams(cfg.params) as never
  )
  return {
    overlayLines: outputToOverlays(out).overlayLines,
    markers: signalMarkers(out.signals, numeric),
  }
}

/** Base arrows: one green up arrow per formed base. */
export function basePaint(
  cfg: IndicatorConfig | undefined,
  numeric: NumericCandle[]
): ChartMarker[] {
  if (!cfg?.enabled || numeric.length === 0) return []
  const out = INDICATORS.base.compute(
    numeric,
    baseChartToModuleParams(cfg.params) as never
  )
  return signalMarkers(out.signals, numeric)
}

/** Bollinger band-touch arrows — what the Bollinger strategy would trade. */
export function bollingerPaint(
  cfg: IndicatorConfig | undefined,
  numeric: NumericCandle[]
): ChartMarker[] {
  if (!cfg?.enabled || numeric.length === 0) return []
  const out = INDICATORS.bollinger.compute(
    numeric,
    bollingerChartToModuleParams(cfg.params) as never
  )
  return signalMarkers(out.signals, numeric)
}

const SESSION_FILL_ALPHA = 0.2
const SESSION_BORDER_ALPHA = 0.55

function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) return `rgba(41, 98, 255, ${alpha})`
  const value = parseInt(match[1], 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

/**
 * Session shading: each picked session paints a translucent box from open to
 * close bounded by that session's high/low, snapped to candle boundaries.
 */
export function sessionZonesPaint(
  cfg: IndicatorConfig | undefined,
  candles: { t: number; h: number | string; l: number | string }[],
  intervalMs: number
): ChartZone[] {
  if (!cfg?.enabled || candles.length === 0) return []
  const sessionHex = cfg.color ?? "#2962ff"
  const sessionKey = cfg.session ?? "nyse"
  const firstMs = candles[0].t
  const lastMs = candles[candles.length - 1].t
  const spans: { fromMs: number; toMs: number }[] = []
  for (const session of sessionsInRange(sessionKey, firstMs, lastMs)) {
    const fromMs = Math.max(
      Math.floor(session.openMs / intervalMs) * intervalMs,
      firstMs
    )
    const toMs = Math.min(
      Math.ceil(session.closeMs / intervalMs) * intervalMs,
      lastMs
    )
    const prev = spans[spans.length - 1]
    if (prev && fromMs <= prev.toMs) prev.toMs = Math.max(prev.toMs, toMs)
    else spans.push({ fromMs, toMs })
  }
  const fill = hexToRgba(sessionHex, SESSION_FILL_ALPHA)
  const border = hexToRgba(sessionHex, SESSION_BORDER_ALPHA)
  const zones: ChartZone[] = []
  let index = 0
  for (const span of spans) {
    if (!(span.toMs > span.fromMs)) continue
    while (index < candles.length && candles[index].t < span.fromMs) index += 1
    let high = -Infinity
    let low = Infinity
    while (
      index < candles.length &&
      (candles[index].t < span.toMs ||
        (candles[index].t === span.toMs && span.toMs === lastMs))
    ) {
      const candleHigh = Number(candles[index].h)
      const candleLow = Number(candles[index].l)
      if (candleHigh > high) high = candleHigh
      if (candleLow < low) low = candleLow
      index += 1
    }
    if (!(high > low)) continue
    zones.push({
      id: `session-${span.fromMs}`,
      fromMs: span.fromMs,
      toMs: span.toMs,
      top: high,
      bottom: low,
      fillColor: fill,
      borderColor: border,
    })
  }
  return zones
}

/**
 * Everything the user's pinned indicators paint over one candle array, in one
 * call — for charts (like practice replay) whose candles change wholesale so
 * per-indicator memo granularity buys nothing. Line-series indicators (EMA,
 * Bollinger bands, RSI, MACD, Base dashes) still render inside PriceChartView
 * from the configs themselves; this covers the derived paint.
 */
export function computeIndicatorPaint(
  indicators: IndicatorConfig[],
  candles: ChartCandle[],
  intervalMs: number
): IndicatorPaint {
  if (candles.length === 0) return EMPTY_INDICATOR_PAINT
  const byType = (type: string) =>
    indicators.find((ind) => ind.type === type && ind.enabled)
  const numeric = toNumericCandles(candles)
  const qqe = qqePaint(byType("qqe"), numeric)
  const trendline = trendlinePaint(byType("trendline"), numeric)
  return {
    markers: [
      ...qqe.markers,
      ...emaCrossPaint(byType("ema"), numeric),
      ...priceActionPaint(byType("priceAction"), numeric),
      ...bollingerPaint(byType("bollinger"), numeric),
      ...basePaint(byType("base"), numeric),
      ...trendline.markers,
    ],
    overlayLines: [...qqe.overlayLines, ...trendline.overlayLines],
    zones: [
      ...qqe.zones,
      ...fvgPaint(byType("fairValueGap"), numeric),
      ...sessionZonesPaint(byType("session"), candles, intervalMs),
    ],
    barColors: qqe.barColors,
  }
}
