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
   * Set when the stop is anchored to something other than a plain percent from
   * entry.
   *
   * `{ kind: "sessionOpen" }` is the opening price of the named session: the
   * engine looks that price up when the trade opens and hands it to
   * {@link resolveProtection}, with `stopLossPct` as the fallback for a trade
   * opened outside the session's hours.
   *
   * `{ kind: "confirmedBase" }` is the price of the confirmed base the wired-in
   * Base node draws — the level the trade is betting holds. Same deal: the
   * engine finds it when the trade opens and hands it over, with `stopLossPct`
   * as the fallback when no base has confirmed yet.
   */
  stopLossLevel?:
    | { kind: "sessionOpen"; session: SessionKey }
    | {
        kind: "confirmedBase"
        basePeriods: number
        pumpPeriods: number
        reclaimDays?: number
      }
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
 * `levelPx` is the price the stop's level sits at — the session's open, or the
 * confirmed base — or null/0 when there was none to read. In that case the
 * configured percent stands, which is what makes an anchored stop safe: there
 * is always a stop, it is just wider or narrower than the level would have
 * been.
 *
 * `position` must carry the entry price the percent will be measured back
 * FROM — the stop's anchor, which is the position's average only when no
 * anchor is set. Hand it a different entry and the stop lands on neither the
 * level nor the percent.
 */
export function resolveProtection(
  settings: ProtectionSettings,
  position: { szi: number; entryPx: number },
  levelPx: number | null | undefined
): ProtectionSettings {
  if (!settings.stopLossLevel && settings.takeProfitRr === undefined) {
    return settings
  }
  const entry = position.entryPx
  let stopLossPct = settings.stopLossPct
  if (settings.stopLossLevel && levelPx && entry > 0) {
    // The level sits below a long's entry and above a short's. On the wrong
    // side it would be a take-profit, not a stop, so the percent stands.
    const distance = position.szi > 0 ? entry - levelPx : levelPx - entry
    if (distance > 0) stopLossPct = (distance / entry) * 100
  }
  const takeProfitPct =
    settings.takeProfitRr !== undefined && stopLossPct
      ? stopLossPct * settings.takeProfitRr
      : settings.takeProfitPct
  return { ...settings, stopLossPct, takeProfitPct }
}
