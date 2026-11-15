import { whyNoLadder, type BacktestSkip } from "@/lib/trade/backtest/result"

import type { BacktestCoinRow } from "./backtest-run-page"

export type SkippedCoin = { marketKey: string; symbol: string; reason: string }

/**
 * Every coin that produced nothing, whichever way it produced nothing: ruled
 * out before the walk began, failed, or walked all the way through without
 * opening a trade. One list, so the Skipped card's count and its rows can
 * never disagree.
 */
export function listSkipped(
  coins: readonly BacktestCoinRow[],
  skipped: readonly BacktestSkip[]
): SkippedCoin[] {
  const rows = new Map<string, { symbol: string; reason: string }>()
  for (const coin of coins) {
    if (coin.status === "skipped" || coin.status === "error") {
      rows.set(coin.marketKey, {
        symbol: coin.symbol,
        reason:
          (coin.status === "error"
            ? coin.error
            : (coin.skipReason ?? coin.error)) ?? "No reason recorded.",
      })
      continue
    }
    // Walked to the end and never opened a trade. `whyNoLadder` works out
    // which reason it was and says it in words.
    if (coin.status === "done" && coin.summary && coin.summary.trades === 0) {
      rows.set(coin.marketKey, {
        symbol: coin.symbol,
        reason:
          whyNoLadder(coin.summary)?.words ??
          "Walked the whole window without a trade.",
      })
    }
  }
  for (const skip of skipped) {
    if (rows.has(skip.marketKey)) continue
    rows.set(skip.marketKey, { symbol: skip.symbol, reason: skip.reason })
  }
  return [...rows.entries()]
    .map(([marketKey, row]) => ({ marketKey, ...row }))
    .sort((left, right) => left.symbol.localeCompare(right.symbol))
}
