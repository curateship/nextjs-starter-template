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
