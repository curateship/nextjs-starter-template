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
 * Both are NaN until the first base is confirmed.
 */
export function qflBase(
  candles: LowCandle[],
  basePeriods: number,
  pumpPeriods: number
): { raw: number[]; line: number[] } {
  const n = candles.length
  const raw = new Array<number>(n).fill(Number.NaN)
  const line = new Array<number>(n).fill(Number.NaN)
  if (n === 0 || basePeriods < 4) return { raw, line }
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
      const lowBar = i - pump
      const from = Math.max(0, lowBar - halfSpan)
      const to = Math.min(n - 1, lowBar + halfSpan)
      for (let k = from; k <= to; k += 1) line[k] = now
    }
    raw[i] = current
  }

  return { raw, line }
}

/**
 * Session-anchored VWAP: cumulative Σ(typicalPrice·volume)/Σvolume that
 * resets at each UTC-day boundary. `t` is a ms epoch; h/l/c/v may be strings.
 */
export function vwap(
  candles: {
    t: number
    h: number | string
    l: number | string
    c: number | string
    v: number | string
  }[]
): number[] {
  const out = new Array<number>(candles.length).fill(Number.NaN)
  let day: number | null = null
  let cumPV = 0
  let cumV = 0
  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i]
    const d = Math.floor(candle.t / 86_400_000)
    if (day === null || d !== day) {
      day = d
      cumPV = 0
      cumV = 0
    }
    const tp = (Number(candle.h) + Number(candle.l) + Number(candle.c)) / 3
    const vol = Number(candle.v)
    cumPV += tp * vol
    cumV += vol
    if (cumV > 0) out[i] = cumPV / cumV
  }
  return out
}
