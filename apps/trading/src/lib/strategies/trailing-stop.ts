import type { ProtectionSettings } from "./settings"

/**
 * Trailing-stop math shared by the worker's trade manager (live ticks and the
 * backtest's intrabar exitTriggers pauses) and the chart painters. One
 * implementation, so the stop a chart draws is the stop the engine enforces.
 */

/**
 * The best price seen in the trade's favor since entry (the high-water mark
 * for a long, low-water for a short). `dir` pins the side the extreme belongs
 * to so a reversed position never inherits the old side's extreme.
 */
export type TrailState = {
  dir: 1 | -1
  extremePx: number
}

type Position = { szi: number; entryPx: number } | null

/**
 * Advance the trailing extreme with a new price. Pure and monotone: the
 * extreme only ever moves in the trade's favor. Returns the same object when
 * nothing changed so callers can skip a state write, and null when flat.
 */
export function nextTrailState(
  trail: TrailState | null | undefined,
  position: Position,
  px: number
): TrailState | null {
  if (!position || position.szi === 0) return null
  const dir: 1 | -1 = position.szi > 0 ? 1 : -1
  const seed =
    position.entryPx > 0 ? position.entryPx : px > 0 ? px : null
  const current =
    trail && trail.dir === dir ? trail : seed !== null ? { dir, extremePx: seed } : null
  if (!current) return null
  if (!(px > 0)) return current
  const extremePx =
    dir > 0
      ? Math.max(current.extremePx, px)
      : Math.min(current.extremePx, px)
  if (current === trail && extremePx === current.extremePx) return trail
  return { dir, extremePx }
}

/**
 * The stop price currently in force, or null when no stop is set. Fixed mode
 * is the classic entry-distance stop. Trailing mode follows the extreme at
 * `stopLossPct` distance once price has moved `trailActivationPct` in the
 * trade's favor (immediately when unset); until then — and always as a floor —
 * the entry-distance stop applies, so the stop never sits wider than fixed
 * mode and only ever ratchets toward profit.
 */
export function effectiveStopPx(
  settings: ProtectionSettings,
  position: Position,
  trail: TrailState | null | undefined
): number | null {
  if (!settings.stopLossPct || !position || position.szi === 0) return null
  const entry = position.entryPx
  if (!(entry > 0)) return null
  const sign = position.szi > 0 ? 1 : -1
  const base = entry * (1 - (sign * settings.stopLossPct) / 100)
  if (settings.stopLossMode !== "trailing") return base
  const extreme = trail && trail.dir === sign ? trail.extremePx : entry
  const activationPct = settings.trailActivationPct ?? 0
  const activated =
    sign > 0
      ? extreme >= entry * (1 + activationPct / 100)
      : extreme <= entry * (1 - activationPct / 100)
  if (!activated) return base
  const trailed = extreme * (1 - (sign * settings.stopLossPct) / 100)
  return sign > 0 ? Math.max(base, trailed) : Math.min(base, trailed)
}

/**
 * Bar-by-bar stop levels for painting a finished trade's ratchet on a chart.
 * Walks the bars the trade lived through, advancing the extreme with each
 * bar's favorable extreme (high for longs, low for shorts). Purely visual —
 * exits are decided by the engine, never by this path.
 */
export function trailingStopPath(
  settings: ProtectionSettings,
  side: "long" | "short",
  entryPx: number,
  bars: { t: number; h: number; l: number }[]
): { time: number; value: number }[] {
  const dir = side === "long" ? 1 : -1
  const position = { szi: dir, entryPx }
  let trail: TrailState | null = nextTrailState(null, position, entryPx)
  const points: { time: number; value: number }[] = []
  for (const bar of bars) {
    trail = nextTrailState(trail, position, dir > 0 ? bar.h : bar.l)
    const stop = effectiveStopPx(settings, position, trail)
    if (stop !== null) points.push({ time: bar.t, value: stop })
  }
  return points
}
