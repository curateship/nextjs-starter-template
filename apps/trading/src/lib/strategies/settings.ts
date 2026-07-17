/**
 * The protective-exit settings every strategy config carries (an Automation's
 * `protection` block). Consumed by the worker's trade manager and the bot
 * chart's TP/SL line drawing — one shape, so live exits and drawn lines can
 * never disagree.
 */
export type ProtectionSettings = {
  /** Optional hard take-profit, percent from entry. */
  takeProfitPct?: number
  /** Optional hard stop-loss, percent from entry. */
  stopLossPct?: number
  /**
   * How the stop behaves. Absent or "fixed": stays `stopLossPct` from entry
   * (today's behavior). "trailing": follows the best price seen since entry at
   * `stopLossPct` distance, only ever moving in the trade's favor.
   */
  stopLossMode?: "fixed" | "trailing"
  /**
   * Trailing only: start following the best price after it has moved this
   * percent in the trade's favor. Unset or 0 trails immediately. Until
   * activation the stop waits at the fixed entry distance.
   */
  trailActivationPct?: number
}
