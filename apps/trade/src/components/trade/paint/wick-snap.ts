import type { CandleBar } from "@/lib/protocols/contracts"

type WickCoordinates = {
  xOf: (time: number) => number
  yOf: (price: number) => number | null
}

type WickTimeRange = { from: number; to: number }

type ScreenWick = { price: number; y: number }

/** One candle's two wick tips after the chart has placed them on screen. */
export type ScreenCandleWicks = {
  time: number
  x: number
  high: ScreenWick | null
  low: ScreenWick | null
}

export type WickTip = {
  time: number
  price: number
  x: number
  y: number
}

/**
 * Read candle prices through the chart's own coordinate helpers once per
 * viewport change. Pointer movement can then search screen pixels without
 * converting the whole candle history on every event.
 */
export function projectCandleWicks(
  candles: readonly CandleBar[],
  coordinates: WickCoordinates,
  timeRange?: WickTimeRange
): ScreenCandleWicks[] {
  const from = timeRange ? Math.min(timeRange.from, timeRange.to) : -Infinity
  const to = timeRange ? Math.max(timeRange.from, timeRange.to) : Infinity
  let first = 0
  let last = candles.length
  while (first < last) {
    const middle = Math.floor((first + last) / 2)
    if (candles[middle].openTime < from) first = middle + 1
    else last = middle
  }

  const projected: ScreenCandleWicks[] = []
  for (let index = first; index < candles.length; index += 1) {
    const candle = candles[index]
    if (candle.openTime > to) break
    const x = coordinates.xOf(candle.openTime)
    const highY = coordinates.yOf(candle.high)
    const lowY = coordinates.yOf(candle.low)
    if (!Number.isFinite(x) || (highY === null && lowY === null)) continue
    projected.push({
      time: candle.openTime,
      x,
      high:
        highY === null || !Number.isFinite(highY)
          ? null
          : { price: candle.high, y: highY },
      low:
        lowY === null || !Number.isFinite(lowY)
          ? null
          : { price: candle.low, y: lowY },
    })
  }
  return projected
}

/**
 * The closest high or low inside a screen-pixel circle.
 *
 * Several candles can share that small circle when the chart is zoomed out.
 * Vertical distance wins because the price being marked matters more than
 * which nearby candle happens to be one pixel closer sideways.
 */
export function nearestWickTip(
  candles: readonly ScreenCandleWicks[],
  x: number,
  y: number,
  radiusPx: number
): WickTip | null {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(radiusPx) ||
    radiusPx < 0
  ) {
    return null
  }

  const left = x - radiusPx
  let low = 0
  let high = candles.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (candles[middle].x < left) low = middle + 1
    else high = middle
  }

  const radiusSquared = radiusPx * radiusPx
  let nearest: WickTip | null = null
  let nearestVertical = Number.POSITIVE_INFINITY
  let nearestHorizontal = Number.POSITIVE_INFINITY

  for (let index = low; index < candles.length; index += 1) {
    const candle = candles[index]
    const horizontal = Math.abs(candle.x - x)
    if (candle.x > x + radiusPx) break

    for (const wick of [candle.high, candle.low]) {
      if (!wick) continue
      const vertical = Math.abs(wick.y - y)
      if (horizontal * horizontal + vertical * vertical > radiusSquared) {
        continue
      }
      if (
        vertical > nearestVertical ||
        (vertical === nearestVertical && horizontal >= nearestHorizontal)
      ) {
        continue
      }
      nearest = {
        time: candle.time,
        price: wick.price,
        x: candle.x,
        y: wick.y,
      }
      nearestVertical = vertical
      nearestHorizontal = horizontal
    }
  }

  return nearest
}
