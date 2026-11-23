import { formatWholeUsd } from "@/lib/trade/format"
import type {
  ActiveTradesSnapshot,
  TradingOverviewActiveTrade,
} from "@/lib/trade/dashboard/overview"

export type ActiveTradesSummary = {
  totalValue: number | null
  totalProfit: number | null
}

/** The complete totals for the rows currently shown. */
export function summarizeActiveTrades(
  trades: readonly TradingOverviewActiveTrade[]
): ActiveTradesSummary {
  return {
    totalValue: completeTotal(trades.map((trade) => trade.value)),
    totalProfit: completeTotal(trades.map((trade) => trade.profit)),
  }
}

function completeTotal(values: readonly (number | null)[]) {
  if (values.length === 0) return null
  let total = 0
  for (const value of values) {
    if (value === null) return null
    total += value
  }
  return total
}

/** Keep known rows when one wallet misses a header refresh. */
export function mergeActiveTradesSnapshot(
  was: ActiveTradesSnapshot,
  fresh: ActiveTradesSnapshot
): ActiveTradesSnapshot {
  const unavailable = new Set(fresh.activeTradesUnavailable)
  const freshIds = new Set(fresh.activeTrades.map((trade) => trade.id))
  const held = was.activeTrades.filter(
    (trade) => unavailable.has(trade.walletId) && !freshIds.has(trade.id)
  )
  return {
    ...fresh,
    readAt: unavailable.size
      ? Math.min(was.readAt, fresh.readAt)
      : fresh.readAt,
    activeTrades: [...fresh.activeTrades, ...held],
  }
}


/** What the header button says: the money in trades, and what it has made. */
export type ActiveTradesFigures = {
  value: string
  profit: string
  profitValue: number
}

function signedWholeUsd(value: number) {
  if (value === 0) return "$0"
  return `${value > 0 ? "+" : ""}${formatWholeUsd(value)}`
}

/**
 * The two figures on the header button, or null when they cannot be said.
 *
 * Null is the honest answer while an exchange has not answered, because a
 * total missing one venue is not this account's total. It lives here rather
 * than in the button so the server can work out the same pair and remember
 * the last one that came out — see `server/trade/header-figures.ts`.
 */
export function activeTradesFigures(
  snapshot: ActiveTradesSnapshot
): ActiveTradesFigures | null {
  if (snapshot.activeTradesUnavailable.length) return null
  if (snapshot.activeTrades.length === 0) {
    return { value: "$0", profit: "$0", profitValue: 0 }
  }
  const summary = summarizeActiveTrades(snapshot.activeTrades)
  if (summary.totalValue === null || summary.totalProfit === null) return null
  return {
    value: formatWholeUsd(summary.totalValue),
    profit: signedWholeUsd(summary.totalProfit),
    profitValue: summary.totalProfit,
  }
}
