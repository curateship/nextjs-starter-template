import type { StrategyChartOverlays } from "@/components/backtest/backtest-overlays"
import type { IndicatorCandle } from "@/lib/indicators/contract"
import { INDICATORS, type IndicatorSelection } from "@/lib/indicators/registry"

type OhlcCandle = {
  t: number
  o: string | number
  h: string | number
  l: string | number
  c: string | number
  v: string | number
}

const EMPTY: StrategyChartOverlays = {
  indicators: [],
  overlayLines: [],
  priceLines: [],
  zones: [],
  barColors: [],
  markers: [],
}

/**
 * One indicator definition → chart overlays. This is the "what you see is
 * what it trades" adapter: the same `compute` the engine trades on produces
 * the paint and the signal arrows here. Invalid params paint nothing.
 */
export function indicatorOverlays(
  selection: IndicatorSelection,
  candles: OhlcCandle[]
): StrategyChartOverlays {
  if (candles.length === 0) return EMPTY
  const module = INDICATORS[selection.type]
  const parsed = module.paramsSchema.safeParse(selection.params)
  if (!parsed.success) return EMPTY

  const numeric: IndicatorCandle[] = candles.map((candle) => ({
    t: candle.t,
    o: Number(candle.o),
    h: Number(candle.h),
    l: Number(candle.l),
    c: Number(candle.c),
    v: Number(candle.v),
  }))

  const out = module.compute(numeric, parsed.data as never)
  return outputToOverlays(out)
}

/** IndicatorOutput → chart overlays (concrete colors, signal arrows). */
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
    markers: out.signals.map((signal) => ({ time: signal.time, side: signal.side })),
  }
}
