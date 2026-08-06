import type { CandleInterval } from "@/lib/protocols/contracts"

/**
 * Which timeframe this browser last charted — remembered like the panel
 * layouts are, and kept here so the header's picker and the chart's fetch can
 * never disagree about the key or the default.
 *
 * 4h is what a fresh browser opens with: the frame the QFL work settled on.
 */
export const CHART_INTERVAL_STORAGE_KEY = "trade-chart-interval"
export const DEFAULT_CHART_INTERVAL: CandleInterval = "4h"
