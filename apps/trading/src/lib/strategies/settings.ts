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
}
