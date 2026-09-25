import { dayKeyOf, dayStart } from "@/lib/trade/pnl/periods"

/**
 * The figures on a public profile, worked out from the permanent record.
 *
 * **The same counting as the P&L page.** Money comes from each fill's `money`,
 * priced exactly as the P&L page's month grid prices it (`priceFills` on the
 * server), so the 30-day figure is the sum of the last 30 tiles of that grid.
 * A fill the exchange has not priced is counted apart, never as zero. Trades
 * are the Journal's flat-to-flat trades, and one "made money" when its own
 * money after fees is above zero.
 *
 * Nothing here talks to a database or a clock; `now` is handed in.
 */

/** One priced fill: when, what it made after fees, and the fee itself. */
export type RecordFillMoney = { at: number; money: number | null; fee: number }

/** One finished trade: when it closed and what it made after fees. */
export type RecordTrade = { closedAt: number; pnl: number }

export type PeriodMoney = {
  /** Dollars made after fees. */
  money: number
  /** Dollars paid in fees inside the same window. */
  fees: number
  /** Fills the exchange has not priced yet, left out of `money`. */
  unpriced: number
}

export type PublicFigures = {
  made: { "7d": PeriodMoney; "30d": PeriodMoney; all: PeriodMoney }
  /** Finished trades, and how many of them made money. */
  closedTrades: number
  wonTrades: number
  /** Trades that made money out of 100, or null with no closed trades. */
  wonPer100: number | null
  /**
   * The biggest fall in the running total of dollars made, from its highest
   * point to the lowest point after it. Null when it never fell.
   */
  worstStretch: { from: number; to: number; recovered: boolean } | null
  /** Toronto days with at least one fill. */
  daysTraded: number
}

/** Midnight in Toronto `days - 1` days before today: the window's first day. */
export function windowStart(days: number, now: number): number {
  const [year, month, day] = dayKeyOf(now).split("-").map(Number)
  const first = new Date(Date.UTC(year, month - 1, day - (days - 1)))
  const pad = (value: number) => String(value).padStart(2, "0")
  return dayStart(
    `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(first.getUTCDate())}`
  )
}

function periodMoney(
  fills: readonly RecordFillMoney[],
  since: number
): PeriodMoney {
  const period: PeriodMoney = { money: 0, fees: 0, unpriced: 0 }
  for (const fill of fills) {
    if (fill.at < since) continue
    period.fees += fill.fee
    if (fill.money === null) period.unpriced += 1
    else period.money += fill.money
  }
  return period
}

/**
 * The biggest peak-to-low fall of the running total, oldest fill first.
 * "Recovered" means the running total later climbed back to the peak.
 */
export function worstStretch(
  fills: readonly RecordFillMoney[]
): PublicFigures["worstStretch"] {
  const ordered = fills
    .filter((fill) => fill.money !== null)
    .sort((left, right) => left.at - right.at)
  let total = 0
  let peak = 0
  let worst: { from: number; to: number } | null = null
  let recovered = true
  for (const fill of ordered) {
    total += fill.money as number
    if (total >= peak) {
      peak = total
      if (worst && total >= worst.from) recovered = true
      continue
    }
    if (!worst || peak - total > worst.from - worst.to) {
      worst = { from: peak, to: total }
      recovered = false
    }
  }
  return worst ? { ...worst, recovered } : null
}

export function publicFigures(
  fills: readonly RecordFillMoney[],
  trades: readonly RecordTrade[],
  now: number
): PublicFigures {
  const closedTrades = trades.length
  const wonTrades = trades.filter((trade) => trade.pnl > 0).length
  return {
    made: {
      "7d": periodMoney(fills, windowStart(7, now)),
      "30d": periodMoney(fills, windowStart(30, now)),
      all: periodMoney(fills, -Infinity),
    },
    closedTrades,
    wonTrades,
    wonPer100:
      closedTrades === 0 ? null : Math.round((wonTrades / closedTrades) * 100),
    worstStretch: worstStretch(fills),
    daysTraded: new Set(fills.map((fill) => dayKeyOf(fill.at))).size,
  }
}
