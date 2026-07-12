import type { StrategyChartOverlays } from "@/components/backtest/backtest-overlays"
import type { IndicatorCandle } from "@/lib/indicators/contract"
import { computeStrategyOutput } from "@/lib/strategies/config-output"
import type { AutomationConfig } from "@/lib/strategies/strategy-config"

type OhlcCandle = {
  t: number
  o: string | number
  h: string | number
  l: string | number
  c: string | number
  v: string | number
}

export const EMPTY_STRATEGY_OVERLAYS: StrategyChartOverlays = {
  indicators: [],
  overlayLines: [],
  priceLines: [],
  zones: [],
  barColors: [],
}

/** A strategy config → chart overlays (indicator lines, zones, bar colors). */
export function configOverlays(
  config: AutomationConfig,
  candles: OhlcCandle[]
): StrategyChartOverlays {
  if (candles.length === 0) return EMPTY_STRATEGY_OVERLAYS
  const numeric: IndicatorCandle[] = candles.map((candle) => ({
    t: candle.t,
    o: Number(candle.o),
    h: Number(candle.h),
    l: Number(candle.l),
    c: Number(candle.c),
    v: Number(candle.v),
  }))
  return outputToOverlays(computeStrategyOutput(numeric, config))
}

/** IndicatorOutput → chart overlays (concrete colors; no signal arrows). */
export function outputToOverlays(
  out: import("@/lib/indicators/contract").IndicatorOutput
): StrategyChartOverlays {
  return {
    indicators: out.paint.indicators,
    // The chart requires a concrete color; unpainted lines fall back to gray.
    overlayLines: out.paint.lines.map((line) => ({
      id: line.id,
      label: line.label,
      color: line.color ?? "#a1a1aa",
      points: line.points,
    })),
    priceLines: [],
    zones: out.paint.zones.map((zone) => ({
      ...zone,
      fillColor: zone.fillColor ?? "rgba(41, 98, 255, 0.2)",
    })),
    barColors: out.paint.barColors,
  }
}
