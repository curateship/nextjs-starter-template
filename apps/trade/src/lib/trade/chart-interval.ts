import {
  CANDLE_INTERVALS,
  type CandleInterval,
  type ProtocolId,
} from "@/lib/protocols/contracts"

/**
 * Which timeframe this browser last charted — remembered like the panel
 * layouts are, and kept here so the header's picker and the chart's fetch can
 * never disagree about the key or the default.
 *
 * 4h is what a fresh browser opens with: the frame the QFL work settled on.
 *
 * Constants and plain functions only in this file. A server function reads
 * the default from here, so nothing in it may import React.
 */
export const CHART_INTERVAL_FAVORITES_STORAGE_KEY =
  "trade-chart-interval-favorites"
export const DEFAULT_CHART_INTERVAL: CandleInterval = "4h"

/**
 * The timeframes the chart offers: every timeframe an exchange is asked in,
 * then a week and a month.
 *
 * **A week and a month are drawn from the day bars.** No exchange is asked
 * for them. The chart loads the 1d history it already keeps in full and adds
 * each calendar week (Monday to Sunday, UTC) or calendar month into one bar,
 * so every exchange gets them the same way and nothing new is stored.
 *
 * "1M" is the month and "1m" the minute, the way TradingView writes them.
 * Like the others, the strings are the stored per-browser choice.
 *
 * They are chart timeframes only. Backtests, scanners, alerts and orders keep
 * to `CANDLE_INTERVALS`, because their rules are judged bar by bar on bars an
 * exchange actually sends.
 */
export const CHART_INTERVALS = [...CANDLE_INTERVALS, "1w", "1M"] as const

export type ChartInterval = (typeof CHART_INTERVALS)[number]

/** A chart timeframe built out of day bars rather than asked for. */
export type GroupedChartInterval = Exclude<ChartInterval, CandleInterval>

export function isGroupedChartInterval(
  interval: ChartInterval
): interval is GroupedChartInterval {
  return interval === "1w" || interval === "1M"
}

/** The timeframe a chart's bars are actually fetched and streamed in. */
export function chartSourceInterval(interval: ChartInterval): CandleInterval {
  return isGroupedChartInterval(interval) ? "1d" : interval
}

/**
 * **Each exchange remembers its own timeframe.** Hyperliquid can sit on 1d
 * while KuCoin sits on 1h, and moving between them no longer drags one screen's
 * frame onto the other. Tyler's rule, 10 September 2026.
 *
 * The favourite timeframes in the picker stay shared, because those are about
 * how somebody reads a chart rather than about a particular exchange.
 */
export function chartIntervalStorageKey(protocol: ProtocolId): string {
  return `trade-chart-interval-${protocol}`
}
