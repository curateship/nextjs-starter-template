import {
  buildStrategyOverlays,
  type StrategyChartOverlays,
} from "@/components/backtest/backtest-overlays"
import { PARAM_DEFAULTS, buildParams } from "@/components/bots/strategy-params-form"
import { strategyParamsSchema, type StrategyType } from "@/lib/strategies/params"
import type { HistoryCandle } from "@/server/backtest/history"

/** Strategies whose overlays are worth painting on the live chart. */
export const CHART_STRATEGIES: StrategyType[] = ["qqe", "momentum", "dca", "grid"]

/** Which strategy to paint on the live chart, and how much of it to show. */
export type ChartStrategyState = {
  /** null = no strategy applied. */
  strategy: StrategyType | null
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
  strategy: null,
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
 * Runs the selected strategy over the chart's candles with the backtest's own
 * painter, then trims the output to what the settings ask for: display toggles
 * hide overlay groups, and `maxSignals` keeps only the most-recent signals and
 * zones so the strategy never paints the whole chart.
 */
export function buildChartStrategyOverlays(
  candles: OhlcCandle[],
  state: ChartStrategyState
): StrategyChartOverlays {
  if (!state.strategy || candles.length === 0) return EMPTY_STRATEGY_OVERLAYS

  // Build every overlay group (paint flags on); the display toggles below
  // decide what actually renders. consolidationFilter changes which signals
  // fire, so it must be a real param, not a post-filter.
  const parsed = strategyParamsSchema.safeParse(
    buildParams(state.strategy, {
      ...PARAM_DEFAULTS[state.strategy],
      consolidationFilter: state.consolidationFilter ? "true" : "false",
      paintConsolidation: "true",
      paintSwings: "true",
      colorBars: "true",
    })
  )
  if (!parsed.success) return EMPTY_STRATEGY_OVERLAYS

  const numeric: HistoryCandle[] = candles.map((candle) => ({
    t: candle.t,
    T: candle.t,
    o: Number(candle.o),
    h: Number(candle.h),
    l: Number(candle.l),
    c: Number(candle.c),
    v: Number(candle.v),
    n: 0,
  }))

  const overlays = buildStrategyOverlays(parsed.data, numeric, null)
  // Keep only the most-recent N (0 = paint none). Guard against slice(-0),
  // which returns the whole array.
  const limit = Math.max(0, state.maxSignals)
  const recent = <T>(items: T[]) => (limit > 0 ? items.slice(-limit) : [])

  // Swing marks toggle on their own; other overlay lines follow Indicators.
  const overlayLines = overlays.overlayLines.filter((line) =>
    line.id.startsWith("swing-") ? state.showSwings : state.showIndicators
  )

  return {
    indicators: state.showIndicators ? overlays.indicators : [],
    overlayLines,
    // DCA/Grid ladders live in priceLines; gate them with the same toggle.
    priceLines: state.showIndicators ? overlays.priceLines : [],
    zones: state.showZones ? recent(overlays.zones) : [],
    barColors: state.showBarColors ? overlays.barColors : [],
    markers: state.showSignals ? recent(overlays.markers) : [],
  }
}
