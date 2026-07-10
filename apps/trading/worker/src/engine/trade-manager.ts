import type { StrategySettings } from "@/lib/strategies/settings"

/**
 * THE trade manager: the only TP/SL/flip implementation in the system. Pure
 * functions consumed by the signal engine's live tick path AND the backtest
 * runner's intrabar `exitTriggers` pause — written once, so live and simulated
 * exits can never drift apart (the old per-strategy duplication is gone).
 */

/** The engine's whole per-market state; shaped for `marketEntryExitOrders`. */
export type TradeState = {
  pendingEntry: "long" | "short" | null
  exitRequested: boolean
}

export const INITIAL_TRADE_STATE: TradeState = {
  pendingEntry: null,
  exitRequested: false,
}

type Position = { szi: number; entryPx: number } | null

/**
 * Signal → intent. Applies the direction filter and flip-on-opposite rule:
 *  - flat + allowed direction → pending entry
 *  - positioned, same direction → nothing (already in)
 *  - positioned, opposite signal + flip on → flip (re-enter if the new
 *    direction is allowed, otherwise exit only)
 *  - flip off → the signal is ignored; only TP/SL exit the trade
 */
export function applySignal(
  state: TradeState,
  settings: StrategySettings,
  positionSzi: number,
  side: "buy" | "sell"
): TradeState {
  const wantLong = side === "buy"
  const allowed =
    settings.direction === "both" ||
    (settings.direction === "long") === wantLong

  if (positionSzi === 0) {
    return allowed
      ? { ...state, pendingEntry: wantLong ? "long" : "short" }
      : state
  }

  const positionLong = positionSzi > 0
  if (positionLong === wantLong) return state
  if (!settings.flipOnOppositeSignal) return state
  return allowed
    ? { ...state, pendingEntry: wantLong ? "long" : "short" }
    : { ...state, exitRequested: true }
}

/**
 * The TP/SL price levels for the current position. The backtest runner pauses
 * its intrabar price path at each of these so threshold exits fill exactly at
 * their trigger; the live tick path checks the same numbers via `tickExit`.
 */
export function exitLevels(
  settings: StrategySettings,
  position: Position,
  state: TradeState
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
  settings: StrategySettings,
  position: Position,
  state: TradeState,
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
