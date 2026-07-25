/** Shared replay-playback helpers for the run chart and manual sessions. */

export const REPLAY_SPEED_OPTIONS = [1, 5, 15, 30, 60] as const
export type ReplaySpeed = (typeof REPLAY_SPEED_OPTIONS)[number]

/**
 * Folds fine candles into coarser buckets aligned to the target interval.
 * Built from whatever candles are passed in — feed it only REVEALED candles
 * and the newest bucket stays honestly partial, growing as the tape plays,
 * exactly like a forming bar in live trading (a natively fetched coarse
 * candle would leak the rest of its bucket from the future).
 */
export function aggregateCandles<
  T extends {
    t: number
    T: number
    o: number
    h: number
    l: number
    c: number
    v: number
    n: number
  },
>(candles: T[], targetMs: number): T[] {
  if (candles.length === 0) return []
  const buckets: T[] = []
  let current: T | null = null
  for (const candle of candles) {
    const bucketStart = Math.floor(candle.t / targetMs) * targetMs
    if (!current || current.t !== bucketStart) {
      if (current) buckets.push(current)
      current = {
        ...candle,
        t: bucketStart,
        T: bucketStart + targetMs,
      }
      continue
    }
    current = {
      ...current,
      h: Math.max(current.h, candle.h),
      l: Math.min(current.l, candle.l),
      c: candle.c,
      v: current.v + candle.v,
      n: current.n + candle.n,
    }
  }
  if (current) buckets.push(current)
  return buckets
}

/** Candles revealed at a replay cutoff: everything opening at or before it. */
export function visibleCandlesUpTo<T extends { t: number }>(
  candles: T[],
  cutoffMs: number | null
): T[] {
  if (cutoffMs === null) return candles
  let lo = 0
  let hi = candles.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (candles[mid].t <= cutoffMs) lo = mid + 1
    else hi = mid
  }
  return candles.slice(0, lo)
}
