import type { StrategyChartOverlays } from "@/components/backtest/backtest-overlays"
import { indicatorOverlays } from "@/components/chart/indicator-overlays"
import type { IndicatorSelection } from "@/lib/indicators/registry"

/** Which indicator to paint on the live chart, and how much of it to show. */
export type ChartStrategyState = {
  /**
   * The picked indicator (type + params) — the chart paints and signals from
   * the indicator module, the same compute the strategy engine trades on.
   * null = nothing applied.
   */
  indicator?: IndicatorSelection | null
  /** Cap on the most-recent signals/zones painted, so it never floods the chart. */
  maxSignals: number
  showSignals: boolean
  showIndicators: boolean
  showZones: boolean
  showBarColors: boolean
  /** QQE only — paint the previous swing high/low marks. */
  showSwings: boolean
  /** QQE only — gate signals to fire outside consolidation. */
  consolidationFilter: boolean
}

export const DEFAULT_CHART_STRATEGY: ChartStrategyState = {
  indicator: null,
  maxSignals: 30,
  showSignals: true,
  showIndicators: true,
  showZones: true,
  showBarColors: false,
  showSwings: true,
  consolidationFilter: true,
}

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
  markers: [],
}

/**
 * Paints the picked indicator over the chart's candles — the exact compute
 * the strategy engine trades on — then trims the output to what the display
 * settings ask for: toggles hide overlay groups, and `maxSignals` keeps only
 * the most-recent signals and zones.
 */
export function buildChartStrategyOverlays(
  candles: OhlcCandle[],
  state: ChartStrategyState
): StrategyChartOverlays {
  if (!state.indicator || candles.length === 0) return EMPTY_STRATEGY_OVERLAYS
  return trimOverlays(indicatorOverlays(state.indicator, candles), state)
}

function trimOverlays(
  overlays: StrategyChartOverlays,
  state: ChartStrategyState
): StrategyChartOverlays {
  // Keep only the most-recent N (0 = paint none). Guard against slice(-0),
  // which returns the whole array.
  const limit = Math.max(0, state.maxSignals)
  const recent = <T,>(items: T[]) => (limit > 0 ? items.slice(-limit) : [])

  // Swing marks toggle on their own; other overlay lines follow Indicators.
  const overlayLines = overlays.overlayLines.filter((line) =>
    line.id.startsWith("swing-") ? state.showSwings : state.showIndicators
  )

  return {
    indicators: state.showIndicators ? overlays.indicators : [],
    overlayLines,
    priceLines: state.showIndicators ? overlays.priceLines : [],
    zones: state.showZones ? recent(overlays.zones) : [],
    barColors: state.showBarColors ? overlays.barColors : [],
    markers: state.showSignals ? recent(overlays.markers) : [],
  }
}
