import type { BacktestTrade } from "@/lib/trade/backtest/result"

type SelectableCoin = {
  marketKey: string
  summary: { madeOrLost: number; trades: number } | null
}

export type RememberedBacktestSelection = {
  marketKey: string
  trade: number | null
}

const SELECTION_PREFIX = "trade-backtest-selection-"

/** The first row in the Results panel's default order. */
export function firstBacktestMarket(
  coins: readonly SelectableCoin[]
): string | null {
  return [...coins]
    .sort((left, right) => {
      const leftBand = marketBand(left)
      const rightBand = marketBand(right)
      if (leftBand !== rightBand) return leftBand - rightBand
      return (right.summary?.madeOrLost ?? 0) - (left.summary?.madeOrLost ?? 0)
    })[0]?.marketKey ?? null
}

/** The first row in the Trades panel's default order. */
export function firstBacktestTrade(
  trades: readonly BacktestTrade[]
): number | null {
  const closed = trades
    .filter((trade) => trade.exitAt !== null)
    .sort((left, right) => left.n - right.n)[0]
  return closed?.n ?? trades.find((trade) => trade.exitAt === null)?.n ?? null
}

export function readBacktestSelection(
  runId: string
): RememberedBacktestSelection | null {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(`${SELECTION_PREFIX}${runId}`) ?? "null"
    ) as unknown
    if (!parsed || typeof parsed !== "object") return null
    const value = parsed as Record<string, unknown>
    if (typeof value.marketKey !== "string") return null
    if (value.trade !== null && !Number.isInteger(value.trade)) return null
    return {
      marketKey: value.marketKey,
      trade: value.trade as number | null,
    }
  } catch {
    return null
  }
}

export function rememberBacktestSelection(
  runId: string,
  selection: RememberedBacktestSelection
): void {
  try {
    window.localStorage.setItem(
      `${SELECTION_PREFIX}${runId}`,
      JSON.stringify(selection)
    )
  } catch {
    // A blocked store should not stop the chart from working for this visit.
  }
}

function marketBand(coin: SelectableCoin): number {
  if (!coin.summary) return 2
  return coin.summary.trades > 0 ? 0 : 1
}
