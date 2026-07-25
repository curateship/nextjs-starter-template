/** Pure indicator math over close arrays (oldest → newest). */

export function ema(values: number[], period: number): number[] {
  if (period <= 0 || values.length === 0) return []
  const k = 2 / (period + 1)
  const out: number[] = []
  let previous = values[0]
  for (const value of values) {
    previous = value * k + previous * (1 - k)
    out.push(previous)
  }
  return out
}

/** Wilder-smoothed RSI; returns NaN entries until enough data. */
export function rsi(closes: number[], period: number): number[] {
  const out = new Array<number>(closes.length).fill(Number.NaN)
  if (period <= 0 || closes.length <= period) return out

  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i] - closes[i - 1]
    if (change >= 0) gain += change
    else loss -= change
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = toRsi(avgGain, avgLoss)

  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period
    out[i] = toRsi(avgGain, avgLoss)
  }
  return out
}

function toRsi(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100
  return 100 - 100 / (1 + avgGain / avgLoss)
}

/** Linearly-weighted moving average; NaN until `period` samples exist. */
export function wma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN)
  if (period <= 0) return out
  const denom = (period * (period + 1)) / 2
  for (let i = period - 1; i < values.length; i += 1) {
    let acc = 0
    for (let j = 0; j < period; j += 1) acc += values[i - j] * (period - j)
    out[i] = acc / denom
  }
  return out
}

/** Wilder-smoothed (RMA) moving average; NaN until `period` samples exist. */
export function smma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN)
  if (period <= 0 || values.length < period) return out
  let previous = 0
  for (let i = 0; i < period; i += 1) previous += values[i]
  previous /= period
  out[period - 1] = previous
  for (let i = period; i < values.length; i += 1) {
    previous = (previous * (period - 1) + values[i]) / period
    out[i] = previous
  }
  return out
}

/** Double exponential moving average: 2·EMA − EMA(EMA). */
export function dema(values: number[], period: number): number[] {
  const e1 = ema(values, period)
  const e2 = ema(e1, period)
  return e1.map((v, i) => 2 * v - e2[i])
}

/** Triple exponential moving average: 3·(EMA − EMA²) + EMA³. */
export function tema(values: number[], period: number): number[] {
  const e1 = ema(values, period)
  const e2 = ema(e1, period)
  const e3 = ema(e2, period)
  return e1.map((v, i) => 3 * (v - e2[i]) + e3[i])
}

/** Pentuple exponential moving average (Bruno Pio's 8-stage EMA blend). */
export function pema(values: number[], period: number): number[] {
  const e1 = ema(values, period)
  const e2 = ema(e1, period)
  const e3 = ema(e2, period)
  const e4 = ema(e3, period)
  const e5 = ema(e4, period)
  const e6 = ema(e5, period)
  const e7 = ema(e6, period)
  const e8 = ema(e7, period)
  return e1.map(
    (v, i) =>
      8 * v - 28 * e2[i] + 56 * e3[i] - 70 * e4[i] + 56 * e5[i] - 28 * e6[i] + 8 * e7[i] - e8[i]
  )
}

/** Hull moving average: WMA(2·WMA(n/2) − WMA(n), √n). */
export function hma(values: number[], period: number): number[] {
  const half = wma(values, Math.max(1, Math.floor(period / 2)))
  const full = wma(values, period)
  const diff = half.map((v, i) => 2 * v - full[i])
  return afterNanPrefix(diff, (tail) =>
    wma(tail, Math.max(1, Math.round(Math.sqrt(period))))
  )
}

/** Volume-weighted moving average; NaN until `period` samples exist. */
export function vwma(values: number[], volumes: number[], period: number): number[] {
  const pv = values.map((value, i) => value * (volumes[i] ?? Number.NaN))
  const num = sma(pv, period)
  const den = sma(volumes.slice(0, values.length), period)
  return num.map((value, i) => value / den[i])
}

/** Least-squares (linear regression) value `offset` bars back from the fit's end. */
export function lsma(values: number[], period: number, offset: number): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN)
  if (period <= 0) return out
  const sumX = ((period - 1) * period) / 2
  const sumX2 = ((period - 1) * period * (2 * period - 1)) / 6
  const denom = period * sumX2 - sumX * sumX
  for (let i = period - 1; i < values.length; i += 1) {
    let sumY = 0
    let sumXY = 0
    for (let j = 0; j < period; j += 1) {
      const y = values[i - period + 1 + j]
      sumY += y
      sumXY += j * y
    }
    const slope = denom === 0 ? 0 : (period * sumXY - sumX * sumY) / denom
    const intercept = (sumY - slope * sumX) / period
    out[i] = intercept + slope * (period - 1 - offset)
  }
  return out
}

/** Arnaud Legoux moving average (gaussian-weighted window). */
export function alma(
  values: number[],
  period: number,
  offset: number,
  sigma: number
): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN)
  if (period <= 0 || sigma <= 0) return out
  const m = offset * (period - 1)
  const s = period / sigma
  const weights: number[] = []
  let norm = 0
  for (let j = 0; j < period; j += 1) {
    const w = Math.exp(-((j - m) * (j - m)) / (2 * s * s))
    weights.push(w)
    norm += w
  }
  for (let i = period - 1; i < values.length; i += 1) {
    let acc = 0
    for (let j = 0; j < period; j += 1) acc += values[i - period + 1 + j] * weights[j]
    out[i] = acc / norm
  }
  return out
}

export type MaType =
  | "ALMA"
  | "EMA"
  | "DEMA"
  | "TEMA"
  | "WMA"
  | "VWMA"
  | "SMA"
  | "SMMA"
  | "HMA"
  | "LSMA"
  | "PEMA"

/** Applies `fn` past any leading-NaN prefix, re-padding the prefix with NaN. */
function afterNanPrefix(values: number[], fn: (tail: number[]) => number[]): number[] {
  const start = values.findIndex((value) => !Number.isNaN(value))
  if (start < 0) return new Array<number>(values.length).fill(Number.NaN)
  if (start === 0) return fn(values)
  return new Array<number>(start).fill(Number.NaN).concat(fn(values.slice(start)))
}

/**
 * Dispatches to the selected MA. Leading-NaN warmup prefixes (e.g. RSI
 * output) are trimmed before computing and re-padded after — `ema` seeds
 * from the first sample, so feeding it NaN would poison the whole series.
 */
export function movingAverage(
  type: MaType,
  values: number[],
  period: number,
  opts?: {
    volumes?: number[]
    lsmaOffset?: number
    almaOffset?: number
    almaSigma?: number
  }
): number[] {
  const start = Math.max(0, values.findIndex((value) => !Number.isNaN(value)))
  return afterNanPrefix(values, (tail) => {
    switch (type) {
      case "EMA":
        return ema(tail, period)
      case "SMA":
        return sma(tail, period)
      case "WMA":
        return wma(tail, period)
      case "SMMA":
        return smma(tail, period)
      case "DEMA":
        return dema(tail, period)
      case "TEMA":
        return tema(tail, period)
      case "HMA":
        return hma(tail, period)
      case "PEMA":
        return pema(tail, period)
      case "VWMA":
        return vwma(tail, (opts?.volumes ?? []).slice(start), period)
      case "LSMA":
        return lsma(tail, period, opts?.lsmaOffset ?? 0)
      case "ALMA":
        return alma(tail, period, opts?.almaOffset ?? 0.85, opts?.almaSigma ?? 6)
    }
  })
}

export function highest(values: number[]): number {
  return values.reduce((max, value) => Math.max(max, value), -Infinity)
}

export function lowest(values: number[]): number {
  return values.reduce((min, value) => Math.min(min, value), Infinity)
}

/** True when series a crosses above series b at the last index. */
export function crossedAbove(a: number[], b: number[]): boolean {
  const n = Math.min(a.length, b.length)
  if (n < 2) return false
  return a[n - 2] <= b[n - 2] && a[n - 1] > b[n - 1]
}

export function crossedBelow(a: number[], b: number[]): boolean {
  const n = Math.min(a.length, b.length)
  if (n < 2) return false
  return a[n - 2] >= b[n - 2] && a[n - 1] < b[n - 1]
}

/** Windowed simple moving average; NaN until `period` samples exist. */
export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN)
  if (period <= 0) return out
  let sum = 0
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/** Windowed population standard deviation; NaN until `period` samples exist. */
export function stddev(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN)
  if (period <= 0) return out
  const means = sma(values, period)
  for (let i = period - 1; i < values.length; i += 1) {
    let acc = 0
    for (let j = i - period + 1; j <= i; j += 1) {
      const diff = values[j] - means[i]
      acc += diff * diff
    }
    out[i] = Math.sqrt(acc / period)
  }
  return out
}

/** Bollinger Bands around an SMA basis, `k` standard deviations wide. */
export function bollinger(
  values: number[],
  period: number,
  k: number
): { upper: number[]; mid: number[]; lower: number[] } {
  const mid = sma(values, period)
  const dev = stddev(values, period)
  const upper = mid.map((m, i) => m + k * dev[i])
  const lower = mid.map((m, i) => m - k * dev[i])
  return { upper, mid, lower }
}



/**
 * MACD line, signal line and histogram (reusing `ema`). Warmup entries
 * before the slow EMA has spun up are NaN so the chart renders a gap.
 */
export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number[]; signal: number[]; hist: number[] } {
  const n = values.length
  const fastEma = ema(values, fast)
  const slowEma = ema(values, slow)
  const macdLine = new Array<number>(n).fill(Number.NaN)
  const signalLine = new Array<number>(n).fill(Number.NaN)
  const hist = new Array<number>(n).fill(Number.NaN)
  const warmup = Math.max(0, slow - 1)
  if (warmup >= n) return { macd: macdLine, signal: signalLine, hist }

  for (let i = warmup; i < n; i += 1) {
    macdLine[i] = fastEma[i] - slowEma[i]
  }
  // macdLine is fully populated from `warmup` on, so its tail is the EMA input.
  const sig = ema(macdLine.slice(warmup), signal)
  for (let i = 0; i < sig.length; i += 1) {
    const idx = warmup + i
    signalLine[idx] = sig[i]
    hist[idx] = macdLine[idx] - sig[i]
  }
  return { macd: macdLine, signal: signalLine, hist }
}

type LowCandle = { l: number | string }

/**
 * QFL (Quickfingers Luc) base scanner. A "base" is confirmed at the lowest low
 * of the last `basePeriods` bars once that low has held for `pumpPeriods` bars
 * (price bounced off it without making a lower low). Adapted from rex_wolfe's
 * Pine v5 "QFL Zaphod". Returns:
 *  - `raw`: the confirmed base level held at each bar (no look-ahead) — what a
 *    stop reads as the current support.
 *  - `line`: a SHORT horizontal mark drawn at each base's low bar (NaN
 *    elsewhere) — what to plot, so bases show as separate short lines rather
 *    than one level held across the whole chart.
 *  - `confirmed`: true on the bar a base became confirmed (the bar the hold
 *    completed, `pumpPeriods` after the low itself) — the "base formed" event.
 * `raw` and `line` are NaN until the first base is confirmed.
 */
export function qflBase(
  candles: LowCandle[],
  basePeriods: number,
  pumpPeriods: number
): { raw: number[]; line: number[]; confirmed: boolean[] } {
  const n = candles.length
  const raw = new Array<number>(n).fill(Number.NaN)
  const line = new Array<number>(n).fill(Number.NaN)
  const confirmed = new Array<boolean>(n).fill(false)
  if (n === 0 || basePeriods < 4) return { raw, line, confirmed }
  // Pine clamps pumpPeriods below basePeriods.
  const pump = pumpPeriods >= basePeriods ? basePeriods - 1 : pumpPeriods

  const lows = candles.map((candle) => Number(candle.l))
  // lowestLow[i] = min low over the trailing basePeriods window.
  const lowestLow = new Array<number>(n).fill(Number.NaN)
  for (let i = basePeriods - 1; i < n; i += 1) {
    let lo = Infinity
    for (let j = i - basePeriods + 1; j <= i; j += 1) lo = Math.min(lo, lows[j])
    lowestLow[i] = lo
  }

  // Short marks span a few bars each side of the low that formed the base.
  const halfSpan = Math.max(2, Math.round(pump))
  let current = Number.NaN
  for (let i = 0; i < n; i += 1) {
    const prior = lowestLow[i - pump - 1]
    const held = lowestLow[i - pump]
    const now = lowestLow[i]
    // A new low was set `pump` bars ago and has held ever since.
    const newBase =
      i - pump - 1 >= 0 &&
      !Number.isNaN(prior) &&
      !Number.isNaN(held) &&
      !Number.isNaN(now) &&
      prior > held &&
      held === now
    if (newBase) {
      current = now
      confirmed[i] = true
      const lowBar = i - pump
      const from = Math.max(0, lowBar - halfSpan)
      const to = Math.min(n - 1, lowBar + halfSpan)
      for (let k = from; k <= to; k += 1) line[k] = now
    }
    raw[i] = current
  }

  return { raw, line, confirmed }
}

type HighCandle = { h: number | string }

/**
 * The mirror of {@link qflBase}: a "ceiling" is confirmed at the HIGHEST high of
 * the last `basePeriods` bars once that high has held for `pumpPeriods` bars
 * (price rejected off it without making a higher high). Same three outputs, read
 * the same way — `raw` is the resistance in force, `line` is the short dash to
 * plot, `confirmed` is the bar the ceiling completed. A short entry uses these the
 * way a long entry uses bases; the base is then the level to take profit at.
 */
export function qflCeiling(
  candles: HighCandle[],
  basePeriods: number,
  pumpPeriods: number
): { raw: number[]; line: number[]; confirmed: boolean[] } {
  const n = candles.length
  const raw = new Array<number>(n).fill(Number.NaN)
  const line = new Array<number>(n).fill(Number.NaN)
  const confirmed = new Array<boolean>(n).fill(false)
  if (n === 0 || basePeriods < 4) return { raw, line, confirmed }
  const pump = pumpPeriods >= basePeriods ? basePeriods - 1 : pumpPeriods

  const highs = candles.map((candle) => Number(candle.h))
  const highestHigh = new Array<number>(n).fill(Number.NaN)
  for (let i = basePeriods - 1; i < n; i += 1) {
    let hi = -Infinity
    for (let j = i - basePeriods + 1; j <= i; j += 1) hi = Math.max(hi, highs[j])
    highestHigh[i] = hi
  }

  const halfSpan = Math.max(2, Math.round(pump))
  let current = Number.NaN
  for (let i = 0; i < n; i += 1) {
    const prior = highestHigh[i - pump - 1]
    const held = highestHigh[i - pump]
    const now = highestHigh[i]
    // A new high was set `pump` bars ago and has capped price ever since.
    const newCeiling =
      i - pump - 1 >= 0 &&
      !Number.isNaN(prior) &&
      !Number.isNaN(held) &&
      !Number.isNaN(now) &&
      prior < held &&
      held === now
    if (newCeiling) {
      current = now
      confirmed[i] = true
      const highBar = i - pump
      const from = Math.max(0, highBar - halfSpan)
      const to = Math.min(n - 1, highBar + halfSpan)
      for (let k = from; k <= to; k += 1) line[k] = now
    }
    raw[i] = current
  }

  return { raw, line, confirmed }
}
