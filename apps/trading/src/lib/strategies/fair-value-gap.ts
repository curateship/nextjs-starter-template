/**
 * Fair Value Gaps (imbalances): the untraded price band a fast three-candle
 * move skips over. In 24/7 crypto there are no session gaps; this is the real
 * "gap" — a space left when price jumps so hard the middle candle never trades
 * back across it. Big gaps mark strong impulsive moves and tend to get filled
 * later; a size filter throws away the tiny gaps that just mean chop.
 *
 * Pure and causal: a gap at bar `i` is confirmed by candle `i` alone (looking
 * back two bars), so the buy/sell flags never depend on future candles. A
 * gap's `fillIndex` is the one forward-looking field — a fill is by definition
 * a later event — and is used only for painting, never for a signal.
 */

type FvgCandle = {
  h: number | string
  l: number | string
  c: number | string
}

export type FairValueGap = {
  /** Index of the third candle, where the gap is confirmed. */
  index: number
  side: "bull" | "bear"
  /** Band edges (top strictly above bottom). */
  top: number
  bottom: number
  /** Band height as a percent of the confirming candle's close. */
  sizePct: number
  /** First later bar that fully fills the band, or null while still open. */
  fillIndex: number | null
}

export type FairValueGapSeries = {
  gaps: FairValueGap[]
  /** True on the bar a significant bullish gap is confirmed. */
  buy: boolean[]
  /** True on the bar a significant bearish gap is confirmed. */
  sell: boolean[]
}

/**
 * Detect three-candle imbalances whose height is at least `minGapSize` percent
 * of price. Bullish gap: candle i's low sits entirely above candle i-2's high,
 * leaving the untraded band [high[i-2], low[i]]. Bearish mirrors it. A gap
 * fills when a later candle trades all the way back through the band.
 */
export function computeFairValueGaps(
  candles: FvgCandle[],
  minGapSize: number
): FairValueGapSeries {
  const n = candles.length
  const highs = candles.map((candle) => Number(candle.h))
  const lows = candles.map((candle) => Number(candle.l))
  const closes = candles.map((candle) => Number(candle.c))
  const buy = new Array<boolean>(n).fill(false)
  const sell = new Array<boolean>(n).fill(false)
  const gaps: FairValueGap[] = []

  for (let i = 2; i < n; i += 1) {
    let side: "bull" | "bear" | null = null
    let top = Number.NaN
    let bottom = Number.NaN
    if (lows[i] > highs[i - 2]) {
      side = "bull"
      top = lows[i]
      bottom = highs[i - 2]
    } else if (highs[i] < lows[i - 2]) {
      side = "bear"
      top = lows[i - 2]
      bottom = highs[i]
    }
    if (side === null) continue

    const close = closes[i]
    const sizePct = close > 0 ? ((top - bottom) / close) * 100 : 0
    if (!(sizePct >= minGapSize)) continue

    // Fill: the first later bar that trades all the way back through the band.
    let fillIndex: number | null = null
    for (let j = i + 1; j < n; j += 1) {
      const filled = side === "bull" ? lows[j] <= bottom : highs[j] >= top
      if (filled) {
        fillIndex = j
        break
      }
    }

    gaps.push({ index: i, side, top, bottom, sizePct, fillIndex })
    if (side === "bull") buy[i] = true
    else sell[i] = true
  }

  return { gaps, buy, sell }
}
