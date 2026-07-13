import { computeSwings, type SwingPivot } from "./qqe"

export type TrendlineInputs = {
  swingLookback: number
  breakBuffer: number
  requireCounterSlope: boolean
}

export type TrendlineSeries = {
  resistance: number[]
  support: number[]
  buy: boolean[]
  sell: boolean[]
  highPivots: SwingPivot[]
  lowPivots: SwingPivot[]
}

/** Connects the two latest confirmed swing highs/lows and fires once when a
 * candle closes through the projected line. A new confirmed pivot re-arms it. */
export function computeTrendlines(
  candles: { h: number | string; l: number | string; c: number | string }[],
  inputs: TrendlineInputs
): TrendlineSeries {
  const n = candles.length
  const resistance = new Array<number>(n).fill(Number.NaN)
  const support = new Array<number>(n).fill(Number.NaN)
  const buy = new Array<boolean>(n).fill(false)
  const sell = new Array<boolean>(n).fill(false)
  const swings = computeSwings(candles, inputs.swingLookback)
  const highs: typeof swings.highPivots = []
  const lows: typeof swings.lowPivots = []
  let highAt = 0
  let lowAt = 0
  let buyArmed = false
  let sellArmed = false

  for (let i = 0; i < n; i += 1) {
    while (
      highAt < swings.highPivots.length &&
      swings.highPivots[highAt].index + inputs.swingLookback <= i
    ) {
      highs.push(swings.highPivots[highAt])
      highAt += 1
      buyArmed = true
    }
    while (
      lowAt < swings.lowPivots.length &&
      swings.lowPivots[lowAt].index + inputs.swingLookback <= i
    ) {
      lows.push(swings.lowPivots[lowAt])
      lowAt += 1
      sellArmed = true
    }

    if (highs.length >= 2) {
      const a = highs[highs.length - 2]
      const b = highs[highs.length - 1]
      const slope = (b.value - a.value) / (b.index - a.index)
      const line = a.value + slope * (i - a.index)
      resistance[i] = line
      if (
        buyArmed &&
        Number.isFinite(line) &&
        (!inputs.requireCounterSlope || slope < 0) &&
        Number(candles[i].c) > line * (1 + inputs.breakBuffer / 100)
      ) {
        buy[i] = true
        buyArmed = false
      }
    }

    if (lows.length >= 2) {
      const a = lows[lows.length - 2]
      const b = lows[lows.length - 1]
      const slope = (b.value - a.value) / (b.index - a.index)
      const line = a.value + slope * (i - a.index)
      support[i] = line
      if (
        sellArmed &&
        Number.isFinite(line) &&
        (!inputs.requireCounterSlope || slope > 0) &&
        Number(candles[i].c) < line * (1 - inputs.breakBuffer / 100)
      ) {
        sell[i] = true
        sellArmed = false
      }
    }
  }

  return {
    resistance,
    support,
    buy,
    sell,
    highPivots: swings.highPivots,
    lowPivots: swings.lowPivots,
  }
}
