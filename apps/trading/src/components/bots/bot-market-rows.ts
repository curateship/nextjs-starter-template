import type { BacktestMarketRow } from "@/components/backtest/backtest-markets-table"
import type { BotMarketState } from "@/lib/api/bots"

import {
  buildBotRoundTrips,
  type BotRoundTrip,
  type RoundTripFill,
} from "./bot-round-trips"

/**
 * Max peak-to-trough drop of a market's realized-equity path (starting cash
 * plus running realized P&L), as a positive percent. Mirrors the backtest
 * drawdown column so `BacktestMarketsTable` reads it the same way.
 */
function maxDrawdownPct(closed: BotRoundTrip[], startingCash: number): number {
  let peak = startingCash
  let worst = 0
  for (const trip of closed) {
    const equity = startingCash + trip.cumPnl
    if (equity > peak) peak = equity
    if (peak > 0) worst = Math.max(worst, (peak - equity) / peak)
  }
  return worst * 100
}

/**
 * One row per market the bot runs, aggregating its CLOSED round trips into the
 * shared `BacktestMarketRow` shape (realized P&L, %-return, max drawdown, win
 * rate, trade count) so the bot view can reuse `BacktestMarketsTable`.
 *
 * %-return and drawdown need a capital base; we use the market's starting cash,
 * derived as current cash minus realized P&L (cash grows by what was realized).
 * When cash is unknown (e.g. a live bot on the real wallet) those two columns
 * report null and render as "—" — honest rather than fabricated.
 *
 * `capitalBase` overrides that derivation for callers whose money is not held
 * per market: the trade journal runs off one real wallet, so every market's
 * return is measured against that wallet's own starting equity.
 */
export function buildBotMarketRows(
  markets: string[],
  states: BotMarketState[],
  trades: RoundTripFill[],
  capitalBase?: (market: string, netPnl: number) => number | null
): BacktestMarketRow[] {
  return markets.map((market) => {
    const marketTrades = trades.filter((trade) => trade.market === market)
    // Only closed trips count toward the history summary; mark price (for the
    // open trip's unrealized) is irrelevant, so pass 0.
    const closed = buildBotRoundTrips(marketTrades, 0).filter(
      (trip) => !trip.open
    )
    const tradeCount = closed.length
    const netPnl = closed.reduce((sum, trip) => sum + trip.pnl, 0)
    const wins = closed.filter((trip) => trip.pnl > 0).length
    const winRate = tradeCount > 0 ? wins / tradeCount : null

    const state = states.find((s) => s.market === market) ?? null
    const cash = state?.paper_cash ?? null
    const derived = cash !== null && cash - netPnl > 0 ? cash - netPnl : null
    const override = capitalBase?.(market, netPnl) ?? null
    const startingCash = capitalBase ? override : derived
    const activePosition = Boolean(
      state?.paper_position && Number(state.paper_position.szi) !== 0
    )

    return {
      id: market,
      market,
      status: "done",
      activePosition,
      netPnl: tradeCount > 0 ? netPnl : null,
      netPnlPct:
        tradeCount > 0 && startingCash !== null
          ? (netPnl / startingCash) * 100
          : null,
      maxDrawdownPct:
        tradeCount > 0 && startingCash !== null
          ? maxDrawdownPct(closed, startingCash)
          : null,
      winRate,
      tradeCount,
    }
  })
}
