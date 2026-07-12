import type { ProtectionSettings } from "@/lib/strategies/settings"

/**
 * THE trade manager: the only TP/SL implementation in the system. Pure
 * functions consumed by the automation engine's live tick path AND the
 * backtest runner's intrabar `exitTriggers` pause — written once, so live and
 * simulated exits can never drift apart.
 */

type Position = { szi: number; entryPx: number } | null

type ExitState = { exitRequested: boolean }

/**
 * The TP/SL price levels for the current position. The backtest runner pauses
 * its intrabar price path at each of these so threshold exits fill exactly at
 * their trigger; the live tick path checks the same numbers via `tickExit`.
 */
export function exitLevels(
  settings: ProtectionSettings,
  position: Position,
  state: ExitState
): number[] {
  if (!position || position.szi === 0 || state.exitRequested) return []
  const entry = position.entryPx
  if (!(entry > 0)) return []
  const sign = position.szi > 0 ? 1 : -1
  const levels: number[] = []
  if (settings.takeProfitPct) {
    levels.push(entry * (1 + (sign * settings.takeProfitPct) / 100))
  }
  if (settings.stopLossPct) {
    levels.push(entry * (1 - (sign * settings.stopLossPct) / 100))
  }
  return levels
}

/** Which exit (if any) the current price triggers. Same math as exitLevels. */
export function tickExit(
  settings: ProtectionSettings,
  position: Position,
  state: ExitState,
  mid: number
): "tp" | "sl" | null {
  if (!position || position.szi === 0 || state.exitRequested) return null
  const entry = position.entryPx
  if (!(entry > 0) || !(mid > 0)) return null
  const long = position.szi > 0

  if (settings.takeProfitPct) {
    const tp = entry * (1 + ((long ? 1 : -1) * settings.takeProfitPct) / 100)
    if (long ? mid >= tp : mid <= tp) return "tp"
  }
  if (settings.stopLossPct) {
    const sl = entry * (1 - ((long ? 1 : -1) * settings.stopLossPct) / 100)
    if (long ? mid <= sl : mid >= sl) return "sl"
  }
  return null
}
