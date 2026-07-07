import { movingAverage, rsi, type MaType } from "./indicators"

/**
 * QQE (Quantitative Qualitative Estimation) + zigzag consolidation detector,
 * ported from the "tyster QQE threshold consolidation" Pine v5 indicator.
 * Shared by the worker strategy (signals) and the backtest chart overlays
 * (zones + bar colors) so both compute identical series.
 */

export type QqeSourceKey =
  | "close"
  | "open"
  | "high"
  | "low"
  | "hl2"
  | "hlc3"
  | "ohlc4"

type QqeCandle = {
  o: number | string
  h: number | string
  l: number | string
  c: number | string
  v: number | string
}

export type QqeInputs = {
  rsiPeriod: number
  rsiSmoothing: number
  qqeFactor: number
  threshold: number
  maType: MaType
  lsmaOffset?: number
  almaOffset?: number
  almaSigma?: number
  rsiSource: QqeSourceKey
}

export type QqeBarColor = "green" | "red" | "orange"

export type QqeSeries = {
  rsi: number[]
  rsiMa: number[]
  /** FastAtrRsiTL — the QQE trailing line on the 0–100 RSI scale. */
  trailing: number[]
  /** True on the first bar RsiMa crosses above 50 + threshold (counter == 1). */
  buy: boolean[]
  sell: boolean[]
  barColor: (QqeBarColor | null)[]
}

function sourceSeries(candles: QqeCandle[], source: QqeSourceKey): number[] {
  return candles.map((candle) => {
    const o = Number(candle.o)
    const h = Number(candle.h)
    const l = Number(candle.l)
    const c = Number(candle.c)
    switch (source) {
      case "open":
        return o
      case "high":
        return h
      case "low":
        return l
      case "hl2":
        return (h + l) / 2
      case "hlc3":
        return (h + l + c) / 3
      case "ohlc4":
        return (o + h + l + c) / 4
      default:
        return c
    }
  })
}

export function computeQqeSeries(candles: QqeCandle[], inputs: QqeInputs): QqeSeries {
  const n = candles.length
  const src = sourceSeries(candles, inputs.rsiSource)
  const maOpts = {
    volumes: candles.map((candle) => Number(candle.v)),
    lsmaOffset: inputs.lsmaOffset,
    almaOffset: inputs.almaOffset,
    almaSigma: inputs.almaSigma,
  }
  const wilders = inputs.rsiPeriod * 2 - 1

  const rsiArr = rsi(src, inputs.rsiPeriod)
  const rsiMa = movingAverage(inputs.maType, rsiArr, inputs.rsiSmoothing, maOpts)
  const atrRsi = rsiMa.map((value, i) =>
    i > 0 ? Math.abs(rsiMa[i - 1] - value) : Number.NaN
  )
  const dar = movingAverage(
    inputs.maType,
    movingAverage(inputs.maType, atrRsi, wilders, maOpts),
    wilders,
    maOpts
  ).map((value) => value * inputs.qqeFactor)

  const trailing = new Array<number>(n).fill(Number.NaN)
  const buy = new Array<boolean>(n).fill(false)
  const sell = new Array<boolean>(n).fill(false)
  const barColor = new Array<QqeBarColor | null>(n).fill(null)

  let longband = Number.NaN
  let shortband = Number.NaN
  let trend = 1
  let longCount = 0
  let shortCount = 0

  for (let i = 0; i < n; i += 1) {
    const index = rsiMa[i]
    if (Number.isNaN(index)) continue

    // Trailing bands ratchet toward the index and flip trend on band crosses.
    if (!Number.isNaN(dar[i])) {
      const newLong = index - dar[i]
      const newShort = index + dar[i]
      const prevIndex = rsiMa[i - 1]
      const prevLong = longband
      const prevShort = shortband
      longband =
        !Number.isNaN(prevLong) && prevIndex > prevLong && index > prevLong
          ? Math.max(prevLong, newLong)
          : newLong
      shortband =
        !Number.isNaN(prevShort) && prevIndex < prevShort && index < prevShort
          ? Math.min(prevShort, newShort)
          : newShort
      if (!Number.isNaN(prevShort) && prevIndex <= prevShort && index > prevShort) {
        trend = 1
      } else if (!Number.isNaN(prevLong) && prevIndex >= prevLong && index < prevLong) {
        trend = -1
      }
      trailing[i] = trend === 1 ? longband : shortband
    }

    longCount = index > 50 + inputs.threshold ? longCount + 1 : 0
    shortCount = index < 50 - inputs.threshold ? shortCount + 1 : 0
    buy[i] = longCount === 1
    sell[i] = shortCount === 1

    // Pine's bgc rule: green reads the smoothed RSI, red reads the raw RSI.
    barColor[i] =
      index - 50 > inputs.threshold
        ? "green"
        : rsiArr[i] - 50 < -inputs.threshold
          ? "red"
          : "orange"
  }

  return { rsi: rsiArr, rsiMa, trailing, buy, sell, barColor }
}

export type ConsolidationZone = {
  startIndex: number
  endIndex: number
  high: number
  low: number
}

export type ConsolidationSeries = {
  /** conscnt > minLength at each bar (no look-ahead). */
  inZone: boolean[]
  /** Contiguous painted runs with their final bounds. */
  zones: ConsolidationZone[]
}

/**
 * The machine's carried state between bars. Nullable numbers instead of NaN
 * so it survives a JSON round-trip when persisted as live-bot strategy state.
 */
export type ConsolidationState = {
  dir: number
  pp: number | null
  conscnt: number
  condhigh: number | null
  condlow: number | null
}

export function initialConsolidationState(): ConsolidationState {
  return { dir: 0, pp: null, conscnt: 0, condhigh: null, condlow: null }
}

/**
 * Advance the zigzag consolidation machine by the bar at index `i` (mutates
 * `state`) and report whether that bar sits inside a consolidation zone. A
 * pivot forms when the bar ties-or-beats the trailing `loopbackPeriod`
 * window's extreme; the running pivot `pp` is the extreme of the current
 * zigzag leg (incremental rewrite of Pine's back-walk loop). Consecutive bars
 * whose pivots stay inside the tracked band count toward a consolidation; a
 * pivot outside the band resets the count. Only the trailing
 * `loopbackPeriod`/`minLength` bars of `highs`/`lows` are read.
 */
export function stepConsolidation(
  state: ConsolidationState,
  highs: number[],
  lows: number[],
  i: number,
  loopbackPeriod: number,
  minLength: number
): boolean {
  let isHigh = i >= loopbackPeriod - 1
  let isLow = isHigh
  for (let j = i - loopbackPeriod + 1; j < i && (isHigh || isLow); j += 1) {
    if (highs[j] > highs[i]) isHigh = false
    if (lows[j] < lows[i]) isLow = false
  }

  const prevDir = state.dir
  if (isHigh && !isLow) state.dir = 1
  else if (isLow && !isHigh) state.dir = -1

  let zz: number | null = null
  if (isHigh && isLow) zz = state.dir === 1 ? highs[i] : lows[i]
  else if (isHigh) zz = highs[i]
  else if (isLow) zz = lows[i]

  const prevPp = state.pp
  if (zz !== null) {
    if (state.dir !== prevDir || state.pp === null) state.pp = zz
    else if (state.dir === 1 && zz > state.pp) state.pp = zz
    else if (state.dir === -1 && zz < state.pp) state.pp = zz
  }

  // Pine's `if ta.change(pp)` is false while either side is na, so the
  // counter free-runs until two distinct pivot values exist.
  const ppChanged = state.pp !== null && prevPp !== null && state.pp !== prevPp
  if (ppChanged) {
    state.conscnt =
      state.conscnt > 0 &&
      state.condhigh !== null &&
      state.condlow !== null &&
      state.pp! <= state.condhigh &&
      state.pp! >= state.condlow
        ? state.conscnt + 1
        : 0
  } else {
    state.conscnt += 1
  }

  if (state.conscnt >= minLength) {
    if (state.conscnt === minLength) {
      let hi = -Infinity
      let lo = Infinity
      for (let j = Math.max(0, i - minLength + 1); j <= i; j += 1) {
        hi = Math.max(hi, highs[j])
        lo = Math.min(lo, lows[j])
      }
      state.condhigh = hi
      state.condlow = lo
    } else {
      state.condhigh = Math.max(state.condhigh ?? -Infinity, highs[i])
      state.condlow = Math.min(state.condlow ?? Infinity, lows[i])
    }
  }

  return state.conscnt > minLength
}

export type SwingPivot = { index: number; value: number }

export type SwingSeries = {
  /** Discrete confirmed swing pivots (a bar that tops/bottoms `lookback` bars each side). */
  highPivots: SwingPivot[]
  lowPivots: SwingPivot[]
  /**
   * Price of the most recent pivot *confirmed* by each bar, held forward
   * (NaN before the first). A pivot at index p is confirmed at bar p+lookback,
   * so this series has no look-ahead — safe for the stop-loss.
   */
  swingHigh: number[]
  swingLow: number[]
}

/**
 * Two-sided swing pivots: bar `p` is a swing high when its high strictly
 * exceeds every bar within `lookback` bars on both sides (swing low = strictly
 * below), giving sparse, meaningful structure rather than every local wiggle.
 * Returns the discrete pivots (for painting a short mark at each) plus a
 * held-forward "most recent confirmed pivot" series (for the swing stop).
 */
export function computeSwings(
  candles: { h: number | string; l: number | string }[],
  lookback: number
): SwingSeries {
  const n = candles.length
  const highs = candles.map((candle) => Number(candle.h))
  const lows = candles.map((candle) => Number(candle.l))
  const highPivots: SwingPivot[] = []
  const lowPivots: SwingPivot[] = []

  for (let p = lookback; p < n - lookback; p += 1) {
    let isHigh = true
    let isLow = true
    for (let j = p - lookback; j <= p + lookback && (isHigh || isLow); j += 1) {
      if (j === p) continue
      if (highs[j] >= highs[p]) isHigh = false
      if (lows[j] <= lows[p]) isLow = false
    }
    if (isHigh) highPivots.push({ index: p, value: highs[p] })
    if (isLow) lowPivots.push({ index: p, value: lows[p] })
  }

  const swingHigh = new Array<number>(n).fill(Number.NaN)
  const swingLow = new Array<number>(n).fill(Number.NaN)
  let hi = 0
  let lo = 0
  let lastHigh = Number.NaN
  let lastLow = Number.NaN
  for (let i = 0; i < n; i += 1) {
    while (hi < highPivots.length && highPivots[hi].index + lookback <= i) {
      lastHigh = highPivots[hi].value
      hi += 1
    }
    while (lo < lowPivots.length && lowPivots[lo].index + lookback <= i) {
      lastLow = lowPivots[lo].value
      lo += 1
    }
    swingHigh[i] = lastHigh
    swingLow[i] = lastLow
  }

  return { highPivots, lowPivots, swingHigh, swingLow }
}

/** Batch form of the machine over a full candle series (chart overlays). */
export function computeConsolidation(
  candles: { h: number | string; l: number | string }[],
  loopbackPeriod: number,
  minLength: number
): ConsolidationSeries {
  const n = candles.length
  const highs = candles.map((candle) => Number(candle.h))
  const lows = candles.map((candle) => Number(candle.l))
  const inZone = new Array<boolean>(n).fill(false)
  const zones: ConsolidationZone[] = []

  const state = initialConsolidationState()
  let zoneStart = -1
  let zoneEnd = -1
  let zoneHigh = Number.NaN
  let zoneLow = Number.NaN

  for (let i = 0; i < n; i += 1) {
    inZone[i] = stepConsolidation(state, highs, lows, i, loopbackPeriod, minLength)
    if (inZone[i]) {
      if (zoneStart < 0) zoneStart = Math.max(0, i - state.conscnt)
      zoneEnd = i
      zoneHigh = state.condhigh ?? Number.NaN
      zoneLow = state.condlow ?? Number.NaN
    } else if (zoneStart >= 0) {
      zones.push({ startIndex: zoneStart, endIndex: zoneEnd, high: zoneHigh, low: zoneLow })
      zoneStart = -1
    }
  }
  if (zoneStart >= 0) {
    zones.push({ startIndex: zoneStart, endIndex: zoneEnd, high: zoneHigh, low: zoneLow })
  }

  return { inZone, zones }
}
