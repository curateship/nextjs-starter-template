import { differenceInCalendarDays, parseISO } from "date-fns"

/**
 * The fee comparison's one table of rates: each exchange's published base
 * maker and taker fee on perpetual futures, the page it came from, and the
 * day someone last read that page.
 *
 * "Base" means a new account with no discount: no trading volume, no staked
 * tokens, no referral code. Rates are percents of the trade's size, so 0.045
 * is 0.045%, which is $4.50 on a $10,000 trade.
 *
 * No rate here is a guess. An exchange whose own page does not state a rate is
 * left out and named in `LEFT_OUT` instead. To refresh a row, open its source,
 * copy the base rate, and set `checkedOn` to that day.
 */

export type FeeRow = {
  id: string
  name: string
  /** Which account or markets the rate is for, where the exchange has more than one. */
  note?: string
  makerPercent: number
  takerPercent: number
  sourceUrl: string
  /** The day the rate was last read off `sourceUrl`, as YYYY-MM-DD. */
  checkedOn: string
}

export const FEE_TABLE: readonly FeeRow[] = [
  {
    id: "hyperliquid",
    name: "Hyperliquid",
    makerPercent: 0.015,
    takerPercent: 0.045,
    sourceUrl: "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees",
    checkedOn: "2026-09-25",
  },
  {
    id: "lighter",
    name: "Lighter",
    note: "Standard account",
    makerPercent: 0,
    takerPercent: 0,
    sourceUrl: "https://docs.lighter.xyz/trading/trading-fees",
    checkedOn: "2026-09-25",
  },
  {
    id: "aster",
    name: "Aster",
    note: "Most coins",
    makerPercent: 0,
    takerPercent: 0.04,
    sourceUrl:
      "https://docs.asterdex.com/trading/perpetuals/fees-and-specs/fees",
    checkedOn: "2026-09-25",
  },
  {
    id: "kucoin",
    name: "KuCoin",
    makerPercent: 0.02,
    takerPercent: 0.06,
    sourceUrl: "https://www.kucoin.com/announcement/en-futures-fee",
    checkedOn: "2026-09-25",
  },
  {
    id: "phemex",
    name: "Phemex",
    makerPercent: 0.01,
    takerPercent: 0.06,
    sourceUrl: "https://phemex.com/fees-conditions",
    checkedOn: "2026-09-25",
  },
  {
    id: "apex",
    name: "ApeX",
    makerPercent: 0.02,
    takerPercent: 0.05,
    sourceUrl:
      "https://www.apex.exchange/blog/detail/Enhancing-Your-Trading-Experience-on-ApeX-Omni-Fee-Structure-Updates",
    checkedOn: "2026-09-25",
  },
  {
    id: "edgex",
    name: "edgeX",
    makerPercent: 0.04,
    takerPercent: 0.045,
    sourceUrl: "https://pro.edgex.exchange/vip",
    checkedOn: "2026-09-25",
  },
  {
    id: "binance",
    name: "Binance",
    note: "USDT markets",
    makerPercent: 0.02,
    takerPercent: 0.05,
    sourceUrl: "https://www.binance.com/en/fee/futureFee",
    checkedOn: "2026-09-25",
  },
]

/**
 * Places Trade trades on that have no single rate to show. A swap goes
 * through one or more pools, and each pool sets its own fee.
 */
export const LEFT_OUT: readonly { name: string; reason: string }[] = [
  {
    name: "Solana",
    reason:
      "Swaps through Jupiter, where each pool on the route charges its own fee.",
  },
  {
    name: "BNB Chain",
    reason:
      "Swaps through KyberSwap, where each pool on the route charges its own fee.",
  },
  {
    name: "Robinhood Chain",
    reason:
      "Swaps through KyberSwap and Velora, where each pool charges its own fee.",
  },
]

/** A row checked longer ago than this shows a warning on the page. */
export const STALE_AFTER_DAYS = 90

/** True when the row was last checked more than 90 days before `today` (YYYY-MM-DD). */
export function isStale(row: FeeRow, today: string): boolean {
  return (
    differenceInCalendarDays(parseISO(today), parseISO(row.checkedOn)) >
    STALE_AFTER_DAYS
  )
}

export type FeeInput = {
  /** Dollars per trade. */
  tradeSize: number
  tradesPerMonth: number
  /** How many trades out of every 100 rest on the book and pay the maker fee. */
  makerPer100: number
}

export type FeeResult = FeeRow & {
  perTrade: number
  perMonth: number
}

/**
 * What each exchange charges for the same trading, cheapest first, with ties
 * in name order.
 *
 * The fee on one trade mixes the two rates: with 30 out of 100 as maker,
 * $10,000 × (0.30 × maker% + 0.70 × taker%). The month is that times the
 * number of trades.
 */
export function compareFees(
  input: FeeInput,
  table: readonly FeeRow[] = FEE_TABLE
): FeeResult[] {
  const makerShare = input.makerPer100 / 100
  return table
    .map((row) => {
      const blendedPercent =
        makerShare * row.makerPercent + (1 - makerShare) * row.takerPercent
      const perTrade = (input.tradeSize * blendedPercent) / 100
      return { ...row, perTrade, perMonth: perTrade * input.tradesPerMonth }
    })
    .sort((a, b) => a.perMonth - b.perMonth || a.name.localeCompare(b.name))
}

/** A rate as the exchanges write it: 0.045 reads "0.045%", 0 reads "0%". */
export function formatRate(percent: number): string {
  return `${percent.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`
}
