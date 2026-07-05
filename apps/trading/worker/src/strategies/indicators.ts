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
