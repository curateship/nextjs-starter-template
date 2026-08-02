import * as React from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { BotMarketState } from "@/lib/api/bots"
import { cn } from "@/lib/utils"
import { formatPrice, signedPct, signedUsd, toneClass, usd } from "@/lib/format"

import { buildBotRoundTrips, fillTimeMs, type RoundTripFill } from "./bot-round-trips"

/**
 * Every market the bot currently holds, in one list — the cross-market answer
 * the per-market trades tab can't give. Live unrealized P&L comes from the
 * websocket mark prices; clicking a row jumps the workspace to that market.
 */
export function BotPositionsTable({
  states,
  trades,
  priceOf,
  selectedMarket,
  onSelectMarket,
}: {
  states: BotMarketState[]
  trades: (RoundTripFill & { order_px?: string | null })[]
  /** Live mark price per market from the shared feed; 0 when unknown. */
  priceOf: (market: string) => number
  selectedMarket: string
  onSelectMarket: (market: string) => void
}) {
  const rows = React.useMemo(() => {
    return states
      .filter(
        (state) =>
          state.paper_position && Math.abs(Number(state.paper_position.szi)) > 0
      )
      .map((state) => {
        const position = state.paper_position as {
          szi: number
          entryPx: number
        }
        const szi = Number(position.szi)
        const entryPx = Number(position.entryPx)
        const amount = Math.abs(szi) * entryPx
        const mark = priceOf(state.market)
        const pnl = mark > 0 ? (mark - entryPx) * szi : null
        const marketFills = trades.filter(
          (trade) => trade.market === state.market
        )
        const openTrip = buildBotRoundTrips(marketFills, 0).find(
          (trip) => trip.open
        )
        // The open cycle's own fills: everything from its entry onward.
        const cycleFills = openTrip
          ? marketFills.filter(
              (fill) => fillTimeMs(fill.fill_time) >= openTrip.entryTime
            )
          : []
        const fees = cycleFills.reduce((sum, fill) => sum + Number(fill.fee), 0)
        // Notional-weighted fill-vs-limit slippage; positive = paid worse.
        let slipNotional = 0
        let slipWeighted = 0
        for (const fill of cycleFills) {
          const limitPx = Number(fill.order_px ?? 0)
          const fillPx = Number(fill.px)
          if (!(limitPx > 0) || !(fillPx > 0)) continue
          const notional = fillPx * Number(fill.sz)
          const signed =
            fill.side === "buy"
              ? (fillPx - limitPx) / limitPx
              : (limitPx - fillPx) / limitPx
          slipNotional += notional
          slipWeighted += signed * notional
        }
        const slippagePct =
          slipNotional > 0 ? (slipWeighted / slipNotional) * 100 : null
        return {
          market: state.market,
          side: szi > 0 ? "long" : "short",
          size: Math.abs(szi),
          entryPx,
          mark,
          amount,
          pnl,
          returnPct: pnl !== null && amount > 0 ? (pnl / amount) * 100 : null,
          entryTime: openTrip?.entryTime ?? null,
          fees,
          slippagePct,
        }
      })
      .sort((a, b) => b.amount - a.amount)
  }, [states, trades, priceOf])

  if (rows.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
        No open positions.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Market</TableHead>
          <TableHead>Side</TableHead>
          <TableHead className="text-right">Entered</TableHead>
          <TableHead className="text-right">Entry</TableHead>
          <TableHead className="text-right">Mark</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Slippage</TableHead>
          <TableHead className="text-right">Fees</TableHead>
          <TableHead className="text-right">P&L</TableHead>
          <TableHead className="text-right">Return</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={row.market}
            className={cn(
              "cursor-pointer",
              row.market === selectedMarket && "bg-muted/50"
            )}
            onClick={() => onSelectMarket(row.market)}
          >
            <TableCell className="font-medium">{row.market}</TableCell>
            <TableCell
              className={cn(
                "uppercase",
                row.side === "long" ? "text-emerald-600" : "text-red-500"
              )}
            >
              {row.side}
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums">
              {row.entryTime
                ? new Date(row.entryTime).toLocaleString("en-US", {
                    hour12: false,
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums">
              {formatPrice(row.entryPx)}
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums">
              {row.mark > 0 ? formatPrice(row.mark) : "—"}
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums">
              {usd(row.amount)}
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums">
              {row.slippagePct !== null ? signedPct(row.slippagePct) : "—"}
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums">
              {usd(row.fees)}
            </TableCell>
            <TableCell
              className={cn(
                "text-right font-mono text-xs tabular-nums",
                row.pnl !== null ? toneClass(row.pnl) : undefined
              )}
            >
              {row.pnl !== null ? signedUsd(row.pnl) : "—"}
            </TableCell>
            <TableCell
              className={cn(
                "text-right font-mono text-xs tabular-nums",
                row.returnPct !== null ? toneClass(row.returnPct) : undefined
              )}
            >
              {row.returnPct !== null ? signedPct(row.returnPct) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
