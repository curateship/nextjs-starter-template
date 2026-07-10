/**
 * Retired strategy families. Their engines, editors, and validation schemas
 * are gone — these types remain only so archived bots and old backtest rows
 * stay readable. New bots and runs use StrategyConfig (strategy-config.ts).
 */
export type StrategyType = "grid" | "dca" | "momentum" | "qqe" | "vwap" | "copy"

/** JSON value — legacy blobs cross the server-function boundary, so they
 * must be concretely serializable (unknown is rejected there). */
type LegacyValue =
  | string
  | number
  | boolean
  | null
  | LegacyValue[]
  | { [key: string]: LegacyValue }

/**
 * Opaque legacy params blob on an archived row. Read for display only —
 * never parsed, never executed.
 */
export type StrategyParams = {
  strategyType: StrategyType
  [key: string]: LegacyValue | undefined
}

/** Legacy per-bot risk block, kept on archived rows. Display only. */
export type RiskParams = {
  maxPositionNotionalUsd?: number
  maxLeverage?: number
  dailyLossLimitUsd?: number
  maxDrawdownPct?: number
  maxOpenOrders?: number
  cooldownLosses?: number
  cooldownMinutes?: number
}

/** Bot rows carry the new-model "signal" type alongside the archived types. */
export type BotStrategyType = StrategyType | "signal"

/** Label for any bot strategy type, incl. new-model and retired ones. */
export function strategyLabel(type: string): string {
  if (type === "signal") return "Strategy"
  return (STRATEGY_LABELS as Record<string, string>)[type] ?? type
}

export const STRATEGY_LABELS: Record<StrategyType, string> = {
  grid: "Grid",
  dca: "DCA / Martingale",
  momentum: "Momentum",
  qqe: "QQE + Consolidation",
  vwap: "VWAP",
  copy: "Copy Trader",
}

export const STRATEGY_DESCRIPTIONS: Record<StrategyType, string> = {
  grid: "Ladders resting buys and sells across a price range; re-arms the opposite side after each fill.",
  dca: "Averages in with martingale safety orders and exits the whole position at a take-profit from average entry.",
  momentum: "Enters on EMA cross, RSI, or breakout signals at candle close; exits on a trailing stop or a break of the QFL base.",
  qqe: "Stop-and-reverse on the smoothed RSI's first cross out of the 50±threshold channel, filtered by a zigzag consolidation detector; optional TP/SL.",
  vwap: "Trades the session-anchored VWAP: fade stretches past its σ-bands back to fair value (reversion), or follow the close crossing the VWAP line (cross).",
  copy: "Mirrors every fill of a Hyperliquid address with scaled size at market, capped by slippage.",
}
