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

/**
 * The line's price at a moment in time, extending the segment past both
 * anchors. This is what a drawn-line alert triggers against: for a sloped
 * line the trigger price keeps moving as time passes.
 *
 * Returns null when the line has no single price at a time — a vertical
 * line (both anchors on the same candle) — or when the extension has left
 * positive price territory, where no market price can ever touch it.
 */
export function trendlinePriceAt(
  line: Pick<Trendline, "start" | "end">,
  timeMs: number
): number | null {
  const { start, end } = line
  if (start.time === end.time) {
    return start.price === end.price ? positiveOrNull(start.price) : null
  }
  const slope = (end.price - start.price) / (end.time - start.time)
  const price = start.price + slope * (timeMs / 1000 - start.time)
  return positiveOrNull(price)
}

function positiveOrNull(price: number) {
  return Number.isFinite(price) && price > 0 ? price : null
}

export const DEFAULT_TRENDLINE_COLOR = "#2962ff"

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

/** Chart times must stay inside the saved-drawing schema's bounds. */
const MAX_CHART_TIME = 4_102_444_800
const MAX_CHART_PRICE = 1_000_000_000_000_000

/**
 * Slides the whole line by the pointer's travel since the grab, keeping its
 * slope — grabbing the body moves the line, grabbing an endpoint stretches
 * it. The shift is clamped so both anchors stay inside the times and
 * positive prices the drawing store accepts.
 */
export function moveTrendline(
  origin: Trendline,
  grab: TrendlinePoint,
  point: TrendlinePoint
): Trendline {
  let timeDelta = Math.round(point.time - grab.time)
  let priceDelta = point.price - grab.price

  const minTime = Math.min(origin.start.time, origin.end.time)
  const maxTime = Math.max(origin.start.time, origin.end.time)
  timeDelta = Math.max(
    1 - minTime,
    Math.min(MAX_CHART_TIME - maxTime, timeDelta)
  )

  const minPrice = Math.min(origin.start.price, origin.end.price)
  const maxPrice = Math.max(origin.start.price, origin.end.price)
  const priceFloor = minPrice * 1e-6
  if (minPrice + priceDelta < priceFloor) priceDelta = priceFloor - minPrice
  if (maxPrice + priceDelta > MAX_CHART_PRICE)
    priceDelta = MAX_CHART_PRICE - maxPrice

  return {
    ...origin,
    start: {
      time: origin.start.time + timeDelta,
      price: origin.start.price + priceDelta,
    },
    end: {
      time: origin.end.time + timeDelta,
      price: origin.end.price + priceDelta,
    },
  }
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
