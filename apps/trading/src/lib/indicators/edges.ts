import type { IndicatorSignal } from "./contract"

/**
 * Full-series cross detection matching the worker's bar-by-bar semantics
 * exactly: a buy fires at bar i when `a` crosses above `b` between i-1 and i
 * (`a[i-1] <= b[i-1] && a[i] > b[i]`), mirroring `crossedAbove`/`crossedBelow`
 * in lib/strategies/indicators.ts evaluated on every prefix. NaN warmup bars
 * never fire (NaN comparisons are false). `minIndex` reproduces window-length
 * guards (e.g. momentum's `closes.length >= emaSlow + 2` → minIndex slow+1).
 */
export function crossSignals(
  times: number[],
  a: number[],
  b: number[],
  minIndex = 1
): IndicatorSignal[] {
  const signals: IndicatorSignal[] = []
  const n = Math.min(a.length, b.length, times.length)
  for (let i = Math.max(1, minIndex); i < n; i += 1) {
    if (a[i - 1] <= b[i - 1] && a[i] > b[i]) {
      signals.push({ time: times[i], side: "buy" })
    } else if (a[i - 1] >= b[i - 1] && a[i] < b[i]) {
      signals.push({ time: times[i], side: "sell" })
    }
  }
  return signals
}
