export type TrendlinePoint = {
  /** Chart time in epoch seconds. */
  time: number
  price: number
}

export type Trendline = {
  id: string
  start: TrendlinePoint
  end: TrendlinePoint
  color: string
}

export type PixelPoint = { x: number; y: number }

export const DEFAULT_TRENDLINE_COLOR = "#2962ff"

export function cacheTrendlines(
  current: ReadonlyMap<string, Trendline[]>,
  key: string,
  trendlines: Trendline[]
): Map<string, Trendline[]> {
  const next = new Map(current)
  next.set(key, trendlines)
  return next
}

export function distanceToSegment(
  point: PixelPoint,
  start: PixelPoint,
  end: PixelPoint
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0)
    return Math.hypot(point.x - start.x, point.y - start.y)
  const amount = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
        (dx * dx + dy * dy)
    )
  )
  return Math.hypot(
    point.x - (start.x + amount * dx),
    point.y - (start.y + amount * dy)
  )
}

export function moveTrendlinePoint(
  line: Trendline,
  endpoint: "start" | "end",
  point: TrendlinePoint
): Trendline {
  return { ...line, [endpoint]: point }
}

/** Existing candle time nearest to an arbitrary saved drawing anchor. */
export function nearestCandleTime(
  candleTimes: number[],
  time: number
): number | null {
  if (candleTimes.length === 0) return null
  if (candleTimes.length === 1) return candleTimes[0]

  let low = 0
  let high = candleTimes.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (candleTimes[middle] < time) low = middle + 1
    else high = middle
  }

  if (low === 0) return candleTimes[0]
  if (low === candleTimes.length) return candleTimes[candleTimes.length - 1]

  const before = candleTimes[low - 1]
  const after = candleTimes[low]
  return time - before <= after - time ? before : after
}
