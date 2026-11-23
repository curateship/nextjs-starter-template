import * as React from "react"

import { TradeTable, type TradeTableRow } from "@/components/trade-table"
import type { BacktestResult, BacktestTrade } from "@/lib/backtest/types"

/** Adapts BacktestResult trades (+ open position) to the shared trade table. */
export function BacktestTradesTable({
  result,
  markPrice,
  selectedTradeN,
  onSelectTrade,
  dimAfterMs,
  emptyText = "No trades — run a backtest or adjust the strategy.",
}: {
  result: BacktestResult | null
  markPrice: number
  selectedTradeN: number | null
  onSelectTrade?: (trade: BacktestTrade | null) => void
  /** Replay playhead — rows whose exit is after this time render dimmed. */
  dimAfterMs?: number | null
  /** Override for callers that are not backtests, e.g. the trade journal. */
  emptyText?: string
}) {
  const trades = result?.trades ?? []
  const rows = React.useMemo<TradeTableRow[]>(
    () =>
      trades.map((trade) => ({
        id: String(trade.n),
        n: trade.n,
        side: trade.side,
        entryTime: trade.entryTime,
        exitTime: trade.exitTime,
        amount: trade.entryPx * trade.qty,
        pnl: trade.pnl,
        returnPct: trade.returnPct,
        cumPnl: trade.cumPnl,
        dimmed:
          dimAfterMs != null &&
          (trade.exitTime == null || trade.exitTime > dimAfterMs),
      })),
    [trades, dimAfterMs]
  )
  const open = result?.openPosition ?? null
  const openRow = React.useMemo<TradeTableRow | null>(() => {
    if (!open) return null
    const pnl = markPrice > 0 ? (markPrice - open.entryPx) * open.szi : 0
    return {
      id: "open",
      n: 0,
      side: open.side,
      entryTime: open.entryTime,
      exitTime: null,
      amount: open.entryPx * Math.abs(open.szi),
      pnl,
      returnPct: null,
      cumPnl: null,
      dimmed: dimAfterMs != null,
    }
  }, [open, markPrice, dimAfterMs])

  if (!result || (trades.length === 0 && !open)) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
        {emptyText}
      </div>
    )
  }

  return (
    <TradeTable
      rows={rows}
      openRow={openRow}
      selectedId={selectedTradeN != null ? String(selectedTradeN) : null}
      onSelect={(id) => {
        const trade = id ? trades.find((t) => String(t.n) === id) ?? null : null
        onSelectTrade?.(trade)
      }}
      emptyText={emptyText}
    />
  )
}
