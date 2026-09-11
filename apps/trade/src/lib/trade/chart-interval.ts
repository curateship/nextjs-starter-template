import type { CandleInterval, ProtocolId } from "@/lib/protocols/contracts"

/**
 * Which timeframe this browser last charted — remembered like the panel
 * layouts are, and kept here so the header's picker and the chart's fetch can
 * never disagree about the key or the default.
 *
 * 4h is what a fresh browser opens with: the frame the QFL work settled on.
 *
 * Constants only in this file. A server function reads the default from here,
 * so nothing in it may import React.
 */
export const CHART_INTERVAL_FAVORITES_STORAGE_KEY =
  "trade-chart-interval-favorites"
export const DEFAULT_CHART_INTERVAL: CandleInterval = "4h"

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
