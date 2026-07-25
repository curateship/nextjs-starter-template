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
  /**
   * What the stop measures from.
   * - Absent or "average" (today's behavior): the position's blended average
   *   entry. A DCA ladder drags that average down with every rung it adds, and
   *   the stop follows it down — so the earliest buys can lose far more than
   *   `stopLossPct` before it triggers.
   * - "first": the position's FIRST entry, so the stop stays put and
   *   `stopLossPct` means that much from where the position started.
   * Take profit always measures from the average.
   */
  stopAnchor?: "average" | "first"
}
