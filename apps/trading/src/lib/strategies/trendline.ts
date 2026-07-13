import type { SwingPivot } from "./qqe"

export type TrendlineInputs = {
  swingLookback: number
  confirmationBars: number
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

function computeTrendlineSwings(
  candles: { h: number | string; l: number | string }[],
  lookback: number,
  confirmationBars: number
) {
  const highs = candles.map((candle) => Number(candle.h))
  const lows = candles.map((candle) => Number(candle.l))
  const highPivots: SwingPivot[] = []
  const lowPivots: SwingPivot[] = []
  for (let pivot = lookback; pivot < candles.length - confirmationBars; pivot += 1) {
    let isHigh = true
    let isLow = true
    for (
      let index = pivot - lookback;
      index <= pivot + confirmationBars && (isHigh || isLow);
      index += 1
    ) {
      if (index === pivot) continue
      if (highs[index] >= highs[pivot]) isHigh = false
      if (lows[index] <= lows[pivot]) isLow = false
    }
    if (isHigh) highPivots.push({ index: pivot, value: highs[pivot] })
    if (isLow) lowPivots.push({ index: pivot, value: lows[pivot] })
  }
  return { highPivots, lowPivots }
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
  const swings = computeTrendlineSwings(
    candles,
    inputs.swingLookback,
    inputs.confirmationBars
  )
  const highs: typeof swings.highPivots = []
  const lows: typeof swings.lowPivots = []
  let highAt = 0
  let lowAt = 0
  let buyArmed = false
  let sellArmed = false
  let buyReadyAfter = -1
  let sellReadyAfter = -1

  for (let i = 0; i < n; i += 1) {
    while (
      highAt < swings.highPivots.length &&
      swings.highPivots[highAt].index + inputs.confirmationBars <= i
    ) {
      highs.push(swings.highPivots[highAt])
      highAt += 1
      buyArmed = true
      buyReadyAfter = i
    }
    while (
      lowAt < swings.lowPivots.length &&
      swings.lowPivots[lowAt].index + inputs.confirmationBars <= i
    ) {
      lows.push(swings.lowPivots[lowAt])
      lowAt += 1
      sellArmed = true
      sellReadyAfter = i
    }

    if (highs.length >= 2) {
      const a = highs[highs.length - 2]
      const b = highs[highs.length - 1]
      const slope = (b.value - a.value) / (b.index - a.index)
      const line = a.value + slope * (i - a.index)
      const previousLine = line - slope
      const threshold = 1 + inputs.breakBuffer / 100
      resistance[i] = line
      if (
        buyArmed &&
        i > buyReadyAfter &&
        Number.isFinite(line) &&
        (!inputs.requireCounterSlope || slope < 0) &&
        Number(candles[i - 1].c) <= previousLine * threshold &&
        Number(candles[i].c) > line * threshold
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
      const previousLine = line - slope
      const threshold = 1 - inputs.breakBuffer / 100
      support[i] = line
      if (
        sellArmed &&
        i > sellReadyAfter &&
        Number.isFinite(line) &&
        (!inputs.requireCounterSlope || slope > 0) &&
        Number(candles[i - 1].c) >= previousLine * threshold &&
        Number(candles[i].c) < line * threshold
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
