import { dayKeyOf, type DayKey } from "@/lib/trade/pnl/periods"

/** What one day on the month grid says. */
export type DayResult = {
  day: DayKey
  /** Settled dollars from every priced fill that day, after fees. */
  money: number
  /** Fills whose money the exchange has not stated, kept out of `money`. */
  unpriced: number
  /** Finished trades that closed that day. */
  trades: number
}

/**
 * Folds the overview's fills into one figure per Toronto day.
 *
 * **The same fills, the same money, the same clock as the PnL Graph.** The
 * graph adds each fill's `money` in time order; a month on this grid is those
 * same fills split by the day they landed. Add every day of a month up and
 * you get the graph's figure for that month, which is the whole point of
 * building it this way rather than from the trades.
 *
 * A fill the exchange has not priced counts as unpriced, never as zero — the
 * overview's own rule. Trades are counted on the day they closed.
 */
export function bucketDays(
  fills: readonly { at: number; money: number | null }[],
  trades: readonly { closedAt: number }[],
  since: number
): Map<DayKey, DayResult> {
  const days = new Map<DayKey, DayResult>()
  const dayFor = (at: number) => {
    const key = dayKeyOf(at)
    let day = days.get(key)
    if (!day) {
      day = { day: key, money: 0, unpriced: 0, trades: 0 }
      days.set(key, day)
    }
    return day
  }
  for (const fill of fills) {
    if (fill.at < since) continue
    const day = dayFor(fill.at)
    if (fill.money === null) day.unpriced += 1
    else day.money += fill.money
  }
  for (const trade of trades) {
    if (trade.closedAt < since) continue
    dayFor(trade.closedAt).trades += 1
  }
  return days
}

/** The month's total, the sum of its days, so the tile and the graph agree. */
export function monthTotal(
  days: ReadonlyMap<DayKey, DayResult>,
  monthPrefix: string
): { money: number; trades: number; unpriced: number } {
  let money = 0
  let trades = 0
  let unpriced = 0
  for (const day of days.values()) {
    if (!day.day.startsWith(monthPrefix)) continue
    money += day.money
    trades += day.trades
    unpriced += day.unpriced
  }
  return { money, trades, unpriced }
}
