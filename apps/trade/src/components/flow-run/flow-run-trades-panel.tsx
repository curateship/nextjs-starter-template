import * as React from "react"
import { ListIcon } from "lucide-react"

import {
  signedPct,
  toneClass,
  usd,
} from "@/components/backtest/backtest-kpi"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
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
import type { FlowRunReport } from "@/lib/api/trade/flow-runs"
import { formatDateTime, formatDuration } from "@/lib/format/format-time"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { tradeEndingLabel } from "@/lib/trade/live-trades"
import { formatPrice, formatSignedUsd } from "@/lib/trade/format"
import type { BotTradeColumn } from "@/lib/trade/trades-popover-columns"
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

const NONE: readonly BotTradeColumn[] = []

export function FlowRunTradesPanel({
  trades,
  selected,
  onSelect,
  title = "Trades",
  headerAction,
  hidden = NONE,
  listClassName,
}: {
  /** The trades popover's cap on the list's height. */
  listClassName?: string
  trades: readonly FlowRunReport["trades"][number][]
  /** Its heading: the coin's trades in the trades popover. */
  title?: string
  /** The end of its header: the trades popover's ⋮, Pin and close buttons. */
  headerAction?: React.ReactNode
  /** The columns hidden from the popover's ⋮. Closed always shows. */
  hidden?: readonly BotTradeColumn[]
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
        className={cn(
          "gap-0.5 text-xs sm:text-xs",
          right && "ml-auto flex-row-reverse",
          // Only the sorted column keeps room for its arrow, as the backtest's.
          sort !== column && "[&>span:last-child]:hidden"
        )}
      >
        {label}
      </TableSortButton>
    </TableHead>
  )

  const total = trades.reduce((sum, trade) => sum + trade.pnl, 0)
  const shown = (column: BotTradeColumn) => !hidden.includes(column)

  return (
    <>
      <DashboardCardTitleHeader
        icon={<ListIcon />}
        title={title}
        meta={
          trades.length === 0
            ? "none finished yet"
            : `${trades.length} finished · ${formatSignedUsd(total)} banked`
        }
        action={headerAction}
      />
      {trades.length === 0 ? (
        <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Nothing has been bought and sold yet. A trade appears here once it is
          all the way out of a coin.
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1" viewportClassName={listClassName}>
          {/* Tight columns, as the backtest's (Tyler, 10 Nov 2026: "reduce
              the spacing between col"). */}
          <Table className="w-full text-xs [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_td]:px-1.5 [&_td]:py-2 [&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th]:px-1.5 [&_th]:text-xs [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
            <TableHeader>
              <TableRow>
                {shown("market") ? head("Market", "coin") : null}
                {shown("opened") ? head("Opened", "opened") : null}
                {head("Closed", "closed")}
                {shown("ended") ? <TableHead column="meta">How it ended</TableHead> : null}
                {shown("amount") ? head("Amount", "amount") : null}
                {shown("pnl") ? head("Made or lost", "pnl", true) : null}
                {shown("returnPct") ? head("Return", "returnPct", true) : null}
                {shown("running") ? (
                  <TableHead column="meta" className="text-right">
                    Running total
                  </TableHead>
                ) : null}
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
                  {shown("market") ? (
                    <TableCell column="meta" className="font-medium whitespace-nowrap">
                      {trade.coin}
                      {trade.direction === "short" ? (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          short
                        </span>
                      ) : null}
                    </TableCell>
                  ) : null}
                  {shown("opened") ? (
                    <TableCell column="meta" className="whitespace-nowrap tabular-nums">
                      {formatDateTime(new Date(trade.openedAt))}
                      <span className="block text-[10px] text-muted-foreground">
                        {formatPrice(trade.entryPx)}
                      </span>
                    </TableCell>
                  ) : null}
                  <TableCell column="meta" className="whitespace-nowrap tabular-nums">
                    {formatDateTime(new Date(trade.closedAt))}
                    <span className="block text-[10px] text-muted-foreground">
                      {formatPrice(trade.exitPx)}
                    </span>
                  </TableCell>
                  {shown("ended") ? (
                    <TableCell column="meta" className="whitespace-nowrap">
                      {tradeEndingLabel(trade)}
                      <span className="block text-[10px] text-muted-foreground">
                        held {formatDuration(trade.heldMs)}
                      </span>
                    </TableCell>
                  ) : null}
                  {shown("amount") ? (
                    <TableCell column="meta" className="tabular-nums">
                      {usd(trade.amountUsd)}
                    </TableCell>
                  ) : null}
                  {shown("pnl") ? (
                    <TableCell
                      column="meta"
                      className={cn("text-right tabular-nums", toneClass(trade.pnl))}
                    >
                      {formatSignedUsd(trade.pnl)}
                    </TableCell>
                  ) : null}
                  {shown("returnPct") ? (
                    <TableCell
                      column="meta"
                      className={cn("text-right tabular-nums", toneClass(trade.pnl))}
                    >
                      {signedPct(trade.returnPct)}
                    </TableCell>
                  ) : null}
                  {shown("running") ? (
                    <TableCell
                      column="meta"
                      className={cn(
                        "text-right tabular-nums",
                        toneClass(cumulative.get(trade.id) ?? 0)
                      )}
                    >
                      {formatSignedUsd(cumulative.get(trade.id) ?? 0)}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      )}
    </>
  )
}
