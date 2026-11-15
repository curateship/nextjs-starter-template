import * as React from "react"
import { ListIcon } from "lucide-react"

import {
  signedPct,
  signedUsd,
  toneClass,
  usd,
} from "@/components/backtest/backtest-kpi"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Badge } from "@/components/ui/badge"
import { ErrorRow } from "@/components/ui/error-row"
import { useErrorToast } from "@/lib/toast/error-toast"
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
import {
  openTradePnls,
  type BacktestCoinSummary,
  type BacktestTrade,
} from "@/lib/trade/backtest/result"
import type { BacktestTradeColumn } from "@/lib/trade/trades-popover-columns"
import { cn } from "@/lib/utils"

/**
 * Every round trip the charted coin made — the old app's trade list, column for
 * column, less its #: Side · Entry · Exit · Amount · P&L · Return · Cum. P&L
 * (Tyler, 10 Nov 2026: "remove this", pointing at #, and "reduce the spacing
 * between col": 6px each side of a cell and 2px before a heading's arrow).
 * Amount reads from the left, beside the popover's edge. Every column is as
 * narrow as its figures; when the header is wider than them, the spare width
 * is shared out between the columns, never left as an empty strip at the
 * right (Tyler, 10 Nov 2026: "why is there so much space here?", then "still
 * a gap here"). The last
 * figures keep 24px from the right edge and Amount 24px from the left (Tyler, 10 Nov 2026: "the amount col to align
 * left so it stay close to the edge", "need more spacing on the right").
 * The rows still come in trade order, which is what # sorted by.
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
type Column = "n" | "entry" | "exit" | "amount" | "pnl" | "returnPct" | "cumPnl"

const NONE: readonly BacktestTradeColumn[] = []

export function BacktestTradesPanel({
  symbol,
  summary,
  trades,
  loading,
  error,
  selected,
  onRetry,
  onSelect,
  headerAction,
  hidden = NONE,
  listClassName,
}: {
  /** The trades popover's cap on the list's height. */
  listClassName?: string
  /** The end of its header: the trades popover's ⋮, Pin and close buttons. */
  headerAction?: React.ReactNode
  /** The columns hidden from the popover's ⋮. # always shows. */
  hidden?: readonly BacktestTradeColumn[]
  /** The coin on the chart, or null when none is picked. */
  symbol: string | null
  summary: BacktestCoinSummary | null
  trades: readonly BacktestTrade[]
  loading: boolean
  error: string | null
  selected: number | null
  onRetry: () => void
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
  const openPnl = summary ? openTradePnls(trades, summary) : null

  const head = (label: string, column: Column, right = false) => (
    <TableHead column="meta" className={cn(right && "text-right")}>
      <TableSortButton
        active={sort === column}
        direction={direction}
        onClick={() => toggleSort(column)}
        // Matched to the figures under it. The shared button is 14px, so on a
        // 12px table every heading sat a size above its own column.
        className={cn(
          "gap-0.5 text-xs sm:text-xs",
          // Only the sorted column keeps room for its arrow: an empty slot on
          // every heading pushed the columns apart (Tyler, 10 Nov 2026: "still
          // too much space").
          sort !== column && "[&>span:last-child]:hidden",
          right && "ml-auto flex-row-reverse"
        )}
      >
        {label}
      </TableSortButton>
    </TableHead>
  )

  useErrorToast(symbol ? error : null, onRetry)
  const shown = (column: BacktestTradeColumn) => !hidden.includes(column)

  return (
    <>
      <DashboardCardTitleHeader
        icon={<ListIcon />}
        title={symbol ? `${symbol} trades` : "Trades"}
        meta={
          symbol
            ? `${closed.length} closed${open.length > 0 ? `, ${open.length} open` : ""}`
            : undefined
        }
        action={headerAction}
      />
      {/* Same reason as the Results panel: the scroll box's inner element
          is `display: table` and would let this table outgrow the panel. */}
      <ScrollArea className="min-h-0 flex-1" viewportClassName={cn("[&>div]:block!", listClassName)}>
        {!symbol ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Press a market in Trades to see its trades.
          </p>
        ) : error ? (
          <ErrorRow message={error} onRetry={onRetry} />
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
          <Table className="w-full text-xs [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_td]:px-1.5 [&_td]:py-2 [&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th]:px-1.5 [&_th]:text-xs [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
            <TableHeader>
              <TableRow>
                {shown("side") ? <TableHead column="meta">Side</TableHead> : null}
                {shown("entry") ? head("Entry", "entry") : null}
                {shown("exit") ? head("Exit", "exit") : null}
                {shown("amount") ? head("Amount", "amount") : null}
                {shown("pnl") ? head("P&L", "pnl", true) : null}
                {shown("returnPct") ? head("Return", "returnPct", true) : null}
                {shown("cumPnl") ? head("Cum. P&L", "cumPnl", true) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {closed.map((trade) => (
                <Row
                  key={trade.n}
                  trade={trade}
                  cumPnl={cumulative.get(trade.n) ?? null}
                  shown={shown}
                  selected={selected === trade.n}
                  onSelect={() =>
                    onSelect(selected === trade.n ? null : trade.n)
                  }
                />
              ))}
              {open.map((trade) => (
                <Row
                  key={`open-${trade.n}`}
                  trade={trade}
                  openPnl={openPnl?.get(trade.n) ?? null}
                  cumPnl={null}
                  shown={shown}
                  selected={selected === trade.n}
                  onSelect={() =>
                    onSelect(selected === trade.n ? null : trade.n)
                  }
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
  openPnl,
  cumPnl,
  shown,
  selected,
  onSelect,
}: {
  trade: BacktestTrade
  openPnl?: number | null
  cumPnl: number | null
  shown: (column: BacktestTradeColumn) => boolean
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
      {shown("side") ? (
        <TableCell
          column="meta"
          className={cn(
            trade.direction === "short"
              ? "text-red-600 dark:text-red-400"
              : "text-teal-600 dark:text-teal-400"
          )}
        >
          {trade.direction === "short" ? "Short" : "Long"}
        </TableCell>
      ) : null}
      {shown("entry") ? (
        <TableCell column="meta" className="tabular-nums">
          {formatDateTime(new Date(trade.entryAt))}
        </TableCell>
      ) : null}
      {shown("exit") ? (
        <TableCell column="meta" className="tabular-nums">
          {open ? "still open" : formatDateTime(new Date(trade.exitAt!))}
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
          className={cn(
            "text-right tabular-nums",
            toneClass(open ? (openPnl ?? 0) : trade.pnl)
          )}
        >
          {open
            ? openPnl == null
              ? "—"
              : signedUsd(openPnl)
            : signedUsd(trade.pnl)}
        </TableCell>
      ) : null}
      {shown("returnPct") ? (
        <TableCell
          column="meta"
          className={cn(
            "text-right tabular-nums",
            toneClass(open ? 0 : trade.pnl)
          )}
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
      ) : null}
      {shown("cumPnl") ? (
        <TableCell
          column="meta"
          className={cn("text-right tabular-nums", toneClass(cumPnl ?? 0))}
        >
          {cumPnl === null ? "—" : signedUsd(cumPnl)}
        </TableCell>
      ) : null}
    </TableRow>
  )
}
