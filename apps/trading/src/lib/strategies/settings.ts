/**
 * The protective-exit settings every strategy config carries (an Automation's
 * `protection` block). Consumed by the worker's trade manager and the bot
 * chart's TP/SL line drawing — one shape, so live exits and drawn lines can
 * never disagree.
 */

import type { SessionKey } from "@/lib/trading/sessions"
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
  /**
   * Set when the stop is anchored to a price instead of a percent — today only
   * `{ kind: "sessionOpen" }`, the opening price of the named session. The
   * engine looks that price up when the trade opens and hands it to
   * {@link resolveProtection}; `stopLossPct` stays the fallback for a trade
   * opened outside the session's hours.
   */
  stopLossLevel?: { kind: "sessionOpen"; session: SessionKey }
  /**
   * Take profit as a multiple of the stop's realised distance (1 = 1:1). Only
   * present alongside a `stopLossLevel`, where the distance isn't known until
   * entry — a ratio against a plain percent stop is already folded into
   * `takeProfitPct` when the automation compiles.
   */
  takeProfitRr?: number
}

/**
 * The percentages actually in force for a trade. Everything downstream (the
 * trade manager, the trailing-stop math, the chart painters) works in percent
 * from entry, so an anchored stop is converted to its percent here — once, in
 * one place — and a risk-reward take profit is measured off the result.
 *
 * `sessionOpenPx` is the price the session opened at, or null/0 when the trade
 * opened outside the session or the price could not be read. In that case the
 * configured percent stands, which is what makes an anchored stop safe: there
 * is always a stop, it is just wider or narrower than the level would have
 * been.
 */
export function resolveProtection(
  settings: ProtectionSettings,
  position: { szi: number; entryPx: number },
  sessionOpenPx: number | null | undefined
): ProtectionSettings {
  if (!settings.stopLossLevel && settings.takeProfitRr === undefined) {
    return settings
  }
  const entry = position.entryPx
  let stopLossPct = settings.stopLossPct
  if (settings.stopLossLevel && sessionOpenPx && entry > 0) {
    // The level sits below a long's entry and above a short's. On the wrong
    // side it would be a take-profit, not a stop, so the percent stands.
    const distance =
      position.szi > 0 ? entry - sessionOpenPx : sessionOpenPx - entry
    if (distance > 0) stopLossPct = (distance / entry) * 100
  }
  const takeProfitPct =
    settings.takeProfitRr !== undefined && stopLossPct
      ? stopLossPct * settings.takeProfitRr
      : settings.takeProfitPct
  return { ...settings, stopLossPct, takeProfitPct }
}
