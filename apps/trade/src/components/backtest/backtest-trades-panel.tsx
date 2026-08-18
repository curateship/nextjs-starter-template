import * as React from "react"
import { ListIcon } from "lucide-react"

import {
  signedPct,
  signedUsd,
  toneClass,
  usd,
} from "@/components/backtest/backtest-kpi"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { Badge } from "@/components/ui/badge"
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
import { formatDateTime } from "@/lib/format/format-time"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import type { BacktestTrade } from "@/lib/trade/backtest/result"
import { cn } from "@/lib/utils"

/**
 * Every round trip the charted coin made — the old app's trade list, column for
 * column: # · Side · Entry · Exit · Amount · P&L · Return · Cum. P&L.
 *
 * One row per **round trip**, not per fill. A list of fills is twice as long
 * and cannot answer the only question anybody has of it, which is how many of
 * these actually worked. The running total down the right is what makes that
 * readable — a row of winners means nothing if the losers between them were
 * bigger.
 *
 * The cycle still open is pinned after the sorted rows rather than sorted among
 * them: it has no exit, no return and no place in a running total, and letting
 * it float would put a row of dashes in the middle of the numbers.
 *
 * Entry and Exit use the app's one date formatter, not a private one. These
 * rows get read beside real fills in the Journal, and that comparison should
 * not start with translating two ways of writing the same minute.
 */
type Column =
  | "n"
  | "entry"
  | "exit"
  | "amount"
  | "pnl"
  | "returnPct"
  | "cumPnl"

export function BacktestTradesPanel({
  symbol,
  trades,
  loading,
  selected,
  onSelect,
}: {
  /** The coin on the chart, or null when none is picked. */
  symbol: string | null
  trades: readonly BacktestTrade[]
  loading: boolean
  selected: number | null
  onSelect: (n: number | null) => void
}) {
  const { sort, direction, toggleSort } = useTableSort<Column>("n", "asc")

  // The running total, worked out in the order the trades actually CLOSED —
  // which is not the order they opened in, so it cannot just accumulate down
  // whatever order the table happens to be sorted in.
  const cumulative = React.useMemo(() => {
    const totals = new Map<number, number>()
    let running = 0
    for (const trade of [...trades]
      .filter((one) => one.exitAt !== null)
      .sort((left, right) => (left.exitAt ?? 0) - (right.exitAt ?? 0))) {
      running += trade.pnl
      totals.set(trade.n, running)
    }
    return totals
  }, [trades])

  const closed = React.useMemo(() => {
    const way = direction === "asc" ? 1 : -1
    const value = (trade: BacktestTrade): number => {
      switch (sort) {
        case "entry":
          return trade.entryAt
        case "exit":
          return trade.exitAt ?? 0
        case "amount":
          return trade.amountUsd
        case "pnl":
          return trade.pnl
        case "returnPct":
          return trade.returnPct
        case "cumPnl":
          return cumulative.get(trade.n) ?? 0
        default:
          return trade.n
      }
    }
    return trades
      .filter((trade) => trade.exitAt !== null)
      .slice()
      .sort((left, right) => way * (value(left) - value(right)))
  }, [trades, sort, direction, cumulative])

  const open = trades.filter((trade) => trade.exitAt === null)

  const head = (label: string, column: Column, right = false) => (
    <TableHead column="meta" className={cn(right && "text-right")}>
      <TableSortButton
        active={sort === column}
        direction={direction}
        onClick={() => toggleSort(column)}
        // Matched to the figures under it. The shared button is 14px, so on a
        // 12px table every heading sat a size above its own column.
        className={cn("text-xs sm:text-xs", right && "ml-auto flex-row-reverse")}
      >
        {label}
      </TableSortButton>
    </TableHead>
  )

  return (
    <>
      <WorkspacePanelHeader
        icon={<ListIcon />}
        title={symbol ? `Trades — ${symbol}` : "Trades"}
        meta={
          symbol
            ? `${closed.length} closed${open.length > 0 ? `, ${open.length} open` : ""}`
            : undefined
        }
      />
      {/* Same reason as the Results panel: the scroll box's inner element
          is `display: table` and would let this table outgrow the panel. */}
      <ScrollArea
        className="min-h-0 flex-1"
        viewportClassName="[&>div]:block!"
      >
        {!symbol ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Pick a market in Results to see its trades.
          </p>
        ) : loading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : trades.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            This market never traded in the window.
          </p>
        ) : (
          // The same type and cell spacing as the Positions, Orders and
          // Journal tables in the bottom panel of the Trade screen: small text,
          // 12px each side, 8px top and bottom. It is the same panel in the
          // same place doing the same job, and it was reading a size larger
          // than all three of them.
          //
          // The outside edges are named separately because the shared table
          // gives its first and last columns 24px there, which is the dashboard
          // rule — twice what this panel's neighbours use.
          <Table className="text-xs [&_td:first-child]:pl-3 [&_td:last-child]:pr-3 [&_td]:px-3 [&_td]:py-2 [&_th:first-child]:pl-3 [&_th:last-child]:pr-3 [&_th]:px-3 [&_th]:text-xs">
            <TableHeader>
              <TableRow>
                {head("#", "n")}
                <TableHead column="meta">Side</TableHead>
                {head("Entry", "entry")}
                {head("Exit", "exit")}
                {head("Amount", "amount", true)}
                {head("P&L", "pnl", true)}
                {head("Return", "returnPct", true)}
                {head("Cum. P&L", "cumPnl", true)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {closed.map((trade) => (
                <Row
                  key={trade.n}
                  trade={trade}
                  cumPnl={cumulative.get(trade.n) ?? null}
                  selected={selected === trade.n}
                  onSelect={() => onSelect(selected === trade.n ? null : trade.n)}
                />
              ))}
              {open.map((trade) => (
                <Row
                  key={`open-${trade.n}`}
                  trade={trade}
                  cumPnl={null}
                  selected={selected === trade.n}
                  onSelect={() => onSelect(selected === trade.n ? null : trade.n)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </ScrollArea>
    </>
  )
}

function Row({
  trade,
  cumPnl,
  selected,
  onSelect,
}: {
  trade: BacktestTrade
  cumPnl: number | null
  selected: boolean
  onSelect: () => void
}) {
  const open = trade.exitAt === null

  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      rowAction={onSelect}
      className={cn(open && "text-muted-foreground")}
    >
      <TableCell column="meta" className="tabular-nums">
        {open ? "—" : trade.n}
      </TableCell>
      {/* Always a buy: the ladder only ever goes long. Written out rather than
          left off, because the column is the old app's and a short strategy
          would need it the day one exists. */}
      <TableCell column="meta" className="text-teal-600 dark:text-teal-400">
        Long
      </TableCell>
      <TableCell column="meta" className="tabular-nums">
        {formatDateTime(new Date(trade.entryAt))}
      </TableCell>
      <TableCell column="meta" className="tabular-nums">
        {open ? "still open" : formatDateTime(new Date(trade.exitAt!))}
      </TableCell>
      <TableCell column="meta" className="text-right tabular-nums">
        {usd(trade.amountUsd)}
      </TableCell>
      <TableCell
        column="meta"
        className={cn("text-right tabular-nums", toneClass(open ? 0 : trade.pnl))}
      >
        {open ? "—" : signedUsd(trade.pnl)}
      </TableCell>
      <TableCell
        column="meta"
        className={cn("text-right tabular-nums", toneClass(open ? 0 : trade.pnl))}
      >
        {/* The chip says the exchange ended this one, not the strategy. Beside
            the return rather than in a column of its own: it is the reason for
            the number next to it, and on a cash run it never appears at all. */}
        {open ? (
          "—"
        ) : trade.exitReason === "liquidated" ? (
          <span className="inline-flex items-center gap-1.5">
            <Badge variant="destructive">Liquidated</Badge>
            {signedPct(trade.returnPct)}
          </span>
        ) : (
          signedPct(trade.returnPct)
        )}
      </TableCell>
      <TableCell
        column="meta"
        className={cn("text-right tabular-nums", toneClass(cumPnl ?? 0))}
      >
        {cumPnl === null ? "—" : signedUsd(cumPnl)}
      </TableCell>
    </TableRow>
  )
}
