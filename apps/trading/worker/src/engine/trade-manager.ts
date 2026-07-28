import {
  resolveProtection,
  type ProtectionSettings,
} from "@/lib/strategies/settings"
import { effectiveStopPx, type TrailState } from "@/lib/strategies/trailing-stop"

/**
 * THE trade manager: the only TP/SL implementation in the system. Pure
 * functions consumed by the automation engine's live tick path AND the
 * backtest runner's intrabar `exitTriggers` pause — written once, so live and
 * simulated exits can never drift apart. The stop-price math (fixed and
 * trailing) lives in `@/lib/strategies/trailing-stop` so the chart painters
 * draw the exact levels enforced here.
 */

type Position = { szi: number; entryPx: number } | null

type ExitState = {
  exitRequested: boolean
  /** Trailing-stop extreme, ratcheted by the strategy's tick handler. */
  trail?: TrailState | null
  /**
   * Measure the stop from THIS price instead of the position's average entry.
   * A DCA ladder drags its average down with every rung it adds, which drags a
   * percentage stop down with it — so the earliest buys can bleed far past the
   * percentage you set. Anchoring to the first entry makes "10%" mean 10% from
   * where the position started. Take profit still measures off the average.
   */
  stopAnchorPx?: number | null
  /**
   * The price a level-anchored stop sits at — the session's open, or the
   * confirmed base — looked up once when the position opened. 0 means "looked
   * and there was nothing there" (the trade opened outside its session, or no
   * base had confirmed), so the configured percent stands. Absent while flat.
   */
  stopLevelPx?: number | null
}

/** The percentages in force right now: an anchored stop and a risk-reward
 * take profit become plain percents here, before any level math runs. */
function inForce(
  settings: ProtectionSettings,
  position: { szi: number; entryPx: number },
  state: ExitState
): ProtectionSettings {
  return resolveProtection(settings, position, state.stopLevelPx)
}

/** The position the stop measures against — the anchor when one is set. */
function stopBasis(
  position: { szi: number; entryPx: number },
  state: ExitState
): { szi: number; entryPx: number } {
  const anchor = state.stopAnchorPx
  return anchor && anchor > 0 ? { szi: position.szi, entryPx: anchor } : position
}

/**
 * The TP/SL price levels for the current position. The backtest runner pauses
 * its intrabar price path at each of these so threshold exits fill exactly at
 * their trigger; the live tick path checks the same numbers via `tickExit`.
 * A trailing stop's level moves with `state.trail`, so the runner re-reading
 * this after every pause sees the freshly ratcheted stop.
 */
export function exitLevels(
  config: ProtectionSettings,
  position: Position,
  state: ExitState
): number[] {
  if (!position || position.szi === 0 || state.exitRequested) return []
  const entry = position.entryPx
  if (!(entry > 0)) return []
  const settings = inForce(config, position, state)
  const sign = position.szi > 0 ? 1 : -1
  const levels: number[] = []
  if (settings.takeProfitPct) {
    levels.push(entry * (1 + (sign * settings.takeProfitPct) / 100))
  }
  const stop = effectiveStopPx(settings, stopBasis(position, state), state.trail)
  if (stop !== null) levels.push(stop)
  return levels
}

/** Which exit (if any) the current price triggers. Same math as exitLevels. */
export function tickExit(
  config: ProtectionSettings,
  position: Position,
  state: ExitState,
  mid: number
): "tp" | "sl" | null {
  if (!position || position.szi === 0 || state.exitRequested) return null
  const entry = position.entryPx
  if (!(entry > 0) || !(mid > 0)) return null
  const settings = inForce(config, position, state)
  const long = position.szi > 0

  if (settings.takeProfitPct) {
    const tp = entry * (1 + ((long ? 1 : -1) * settings.takeProfitPct) / 100)
    if (long ? mid >= tp : mid <= tp) return "tp"
  }
  const sl = effectiveStopPx(settings, stopBasis(position, state), state.trail)
  if (sl !== null && (long ? mid <= sl : mid >= sl)) return "sl"
  return null
}
