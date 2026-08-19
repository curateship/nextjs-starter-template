import * as React from "react"
import { ListIcon } from "lucide-react"

import {
  signedPct,
  signedUsd,
  toneClass,
  usd,
} from "@/components/backtest/backtest-kpi"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import type { FlowRunReport } from "@/lib/api/flow-runs"
import { formatDateTime } from "@/lib/format/format-time"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { formatHeld, tradeEndingLabel } from "@/lib/trade/live-trades"
import { formatPrice } from "@/lib/trade/format"
import { cn } from "@/lib/utils"

/**
 * Every finished trade this run has made, along the bottom.
 *
 * **One row per round trip, flat to flat** — the same thing the Journal shows,
 * built by the same `buildLiveTrades`, so a trade cannot read one way here and
 * another way there. A ladder that bought five times and sold once did one
 * trade, and five rows would be five answers to "did that work".
 *
 * Deliberately not the backtest's trade table. That one numbers its rows by
 * rung, and a live round trip has no rung number — putting one there would be
 * inventing a fact in the first column. What it has instead is how it ended,
 * which is the thing worth knowing about a trade nobody was watching.
 *
 * The running total is worked out in the order the trades actually closed, so
 * re-sorting the table cannot change it.
 */
type Column = "coin" | "opened" | "closed" | "amount" | "pnl" | "returnPct"

export function FlowRunTradesPanel({
  trades,
  selected,
  onSelect,
}: {
  trades: readonly FlowRunReport["trades"][number][]
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const { sort, direction, toggleSort } = useTableSort<Column>("closed", "desc")

  const cumulative = React.useMemo(() => {
    const totals = new Map<string, number>()
    let running = 0
    for (const trade of [...trades].sort(
      (left, right) => left.closedAt - right.closedAt
    )) {
      running += trade.pnl
      totals.set(trade.id, running)
    }
    return totals
  }, [trades])

  const sorted = React.useMemo(() => {
    const way = direction === "asc" ? 1 : -1
    return [...trades].sort((left, right) => {
      if (sort === "coin") return way * left.coin.localeCompare(right.coin)
      const pick =
        sort === "opened"
          ? "openedAt"
          : sort === "amount"
            ? "amountUsd"
            : sort === "pnl"
              ? "pnl"
              : sort === "returnPct"
                ? "returnPct"
                : "closedAt"
      return way * (left[pick] - right[pick])
    })
  }, [trades, sort, direction])

  const head = (label: string, column: Column, right = false) => (
    <TableHead column="meta" className={cn(right && "text-right")}>
      <TableSortButton
        active={sort === column}
        direction={direction}
        onClick={() => toggleSort(column)}
        className={cn("gap-1 text-xs sm:text-xs", right && "ml-auto flex-row-reverse")}
      >
        {label}
      </TableSortButton>
    </TableHead>
  )

  const total = trades.reduce((sum, trade) => sum + trade.pnl, 0)

  return (
    <>
      <WorkspacePanelHeader
        icon={<ListIcon />}
        title="Trades"
        meta={
          trades.length === 0
            ? "none finished yet"
            : `${trades.length} finished · ${signedUsd(total)} banked`
        }
      />
      {trades.length === 0 ? (
        <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Nothing has been bought and sold yet. A trade appears here once it is
          all the way out of a coin.
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                {head("Market", "coin")}
                {head("Opened", "opened")}
                {head("Closed", "closed")}
                <TableHead column="meta">How it ended</TableHead>
                {head("Amount", "amount", true)}
                {head("Made or lost", "pnl", true)}
                {head("Return", "returnPct", true)}
                <TableHead column="meta" className="text-right">
                  Running total
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((trade) => (
                <TableRow
                  key={trade.id}
                  data-state={trade.id === selected ? "selected" : undefined}
                  rowAction={() =>
                    onSelect(trade.id === selected ? null : trade.id)
                  }
                >
                  <TableCell column="meta" className="font-medium whitespace-nowrap">
                    {trade.coin}
                    {trade.direction === "short" ? (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        short
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell column="meta" className="whitespace-nowrap tabular-nums">
                    {formatDateTime(new Date(trade.openedAt))}
                    <span className="block text-[10px] text-muted-foreground">
                      {formatPrice(trade.entryPx)}
                    </span>
                  </TableCell>
                  <TableCell column="meta" className="whitespace-nowrap tabular-nums">
                    {formatDateTime(new Date(trade.closedAt))}
                    <span className="block text-[10px] text-muted-foreground">
                      {formatPrice(trade.exitPx)}
                    </span>
                  </TableCell>
                  <TableCell column="meta" className="whitespace-nowrap">
                    {tradeEndingLabel(trade)}
                    <span className="block text-[10px] text-muted-foreground">
                      held {formatHeld(trade.heldMs)}
                    </span>
                  </TableCell>
                  <TableCell column="meta" className="text-right tabular-nums">
                    {usd(trade.amountUsd)}
                  </TableCell>
                  <TableCell
                    column="meta"
                    className={cn("text-right tabular-nums", toneClass(trade.pnl))}
                  >
                    {signedUsd(trade.pnl)}
                  </TableCell>
                  <TableCell
                    column="meta"
                    className={cn("text-right tabular-nums", toneClass(trade.pnl))}
                  >
                    {signedPct(trade.returnPct)}
                  </TableCell>
                  <TableCell
                    column="meta"
                    className={cn(
                      "text-right tabular-nums",
                      toneClass(cumulative.get(trade.id) ?? 0)
                    )}
                  >
                    {signedUsd(cumulative.get(trade.id) ?? 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      )}
    </>
  )
}
