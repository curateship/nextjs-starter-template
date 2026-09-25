/**
 * Turning a time into the chart's own horizontal position, and back.
 *
 * The chart library measures sideways in bars, not in time: bar 0 is the
 * oldest candle, bar 1 the next, and the pixels between any two bars are the
 * same width no matter how long the gap in real time was. Anything drawn on
 * top has to speak both languages — a drawing is stored in real time so it
 * survives a timeframe change, and it is painted in bars.
 *
 * Both directions run over the same list of candle open-times, so a point
 * converted one way and back lands where it started. Between two candles the
 * answer is interpolated; past either end it carries on at the spacing of the
 * nearest pair, which is what lets a line be drawn out into the empty space to
 * the right of the last candle.
 *
 * A chart with fewer than two candles has no spacing to work from, so both
 * directions stand still on the single time it has rather than inventing one.
 */

/** A time in epoch milliseconds as a bar position — fractional, unbounded. */
export function barOfTime(times: number[], time: number): number {
  if (times.length < 2) return 0

  const last = times.length - 1
  if (time <= times[0]) return (time - times[0]) / (times[1] - times[0])
  if (time >= times[last]) {
    return last + (time - times[last]) / (times[last] - times[last - 1])
  }

  // The last candle at or before this time. Binary search: a 1m chart holds
  // thousands of candles and this runs for every point on every repaint.
  let low = 0
  let high = last
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (times[middle] <= time) low = middle
    else high = middle
  }
  const width = times[high] - times[low]
  return width > 0 ? low + (time - times[low]) / width : low
}

/** A bar position back to a time in epoch milliseconds. */
export function timeOfBar(times: number[], bar: number): number {
  if (times.length === 0) return 0
  if (times.length === 1) return times[0]

  const last = times.length - 1
  if (bar <= 0) return Math.round(times[0] + bar * (times[1] - times[0]))
  if (bar >= last) {
    return Math.round(times[last] + (bar - last) * (times[last] - times[last - 1]))
  }

  const low = Math.floor(bar)
  return Math.round(times[low] + (bar - low) * (times[low + 1] - times[low]))
}
