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

/** How many candles a replay cutoff reveals: opens at or before it. */
export function countRevealed<T extends { t: number }>(
  candles: T[],
  cutoffMs: number | null
): number {
  if (cutoffMs === null) return candles.length
  let lo = 0
  let hi = candles.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (candles[mid].t <= cutoffMs) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Candles revealed at a replay cutoff: everything opening at or before it. */
export function visibleCandlesUpTo<T extends { t: number }>(
  candles: T[],
  cutoffMs: number | null
): T[] {
  const count = countRevealed(candles, cutoffMs)
  return count === candles.length ? candles : candles.slice(0, count)
}

/**
 * Bars a replay chart keeps, and the slack allowed above that before they are
 * trimmed back.
 *
 * A chart's drawing cost grows with how much data it holds, so this has to be
 * bounded. But trimming a bar off the front for every bar added on the back is
 * worse than not trimming at all: a chart can append or it can be re-sent
 * wholesale, there is no append-and-drop, so a window that slides every bar
 * forces a full repaint every bar — and every one of those shifts every bar's
 * position underneath whatever is drawn on top.
 */
export const REPLAY_KEEP_BARS = 6000
export const REPLAY_TRIM_STEP = 2000

/**
 * The trailing slice of `candles` a replay chart should hold: it grows a bar at
 * a time up to KEEP+STEP, then snaps back to KEEP.
 *
 * Deliberately a pure function of the revealed count, so the start only moves
 * on a step boundary. Between boundaries the chart is handed an array with the
 * same first bar and can simply append to what it already holds; the expensive
 * full repaint lands once every STEP bars instead of once per bar.
 */
export function trailingWindow<T>(candles: T[], revealed: number): T[] {
  if (revealed <= REPLAY_KEEP_BARS) {
    return revealed === candles.length ? candles : candles.slice(0, revealed)
  }
  const slack = (revealed - REPLAY_KEEP_BARS) % REPLAY_TRIM_STEP
  return candles.slice(revealed - REPLAY_KEEP_BARS - slack, revealed)
}

/**
 * Drops history older than the runway that was actually asked for. The candle
 * loader can return a good deal more than requested (it serves whole cached
 * spans), and every surplus bar is then carried through the chart's per-frame
 * work for the rest of the session.
 */
export function trimToRunway<T extends { t: number }>(
  candles: T[],
  fromMs: number
): T[] {
  if (candles.length === 0 || candles[0].t >= fromMs) return candles
  const start = candles.findIndex((candle) => candle.t >= fromMs)
  return start <= 0 ? candles : candles.slice(start)
}
