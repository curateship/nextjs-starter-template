import type { ChartPosition } from "@/lib/trading/chart-positions"
import type { Trendline } from "@/lib/trading/trendlines"

/** Everything a user has drawn on one market's chart. */
export type ChartDrawings = {
  trendlines: Trendline[]
  positions: ChartPosition[]
}

export const EMPTY_CHART_DRAWINGS: ChartDrawings = {
  trendlines: [],
  positions: [],
}

export function cacheChartDrawings(
  current: ReadonlyMap<string, ChartDrawings>,
  key: string,
  drawings: ChartDrawings
): Map<string, ChartDrawings> {
  const next = new Map(current)
  next.set(key, drawings)
  return next
}
