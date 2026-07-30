import * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { signedUsd, toneClass } from "@/lib/format"

/** One market's result row — the shape every backtest markets table renders. */
export type BacktestMarketRow = {
  id: string
  market: string
  status: "pending" | "running" | "done" | "error"
  netPnl: number | null
  netPnlPct: number | null
  maxDrawdownPct: number | null
  winRate: number | null
  tradeCount: number | null
  /** Live-bot tables flag markets currently holding a position with a dot. */
  activePosition?: boolean
}

export type MarketSort = "market" | "net" | "dd" | "win" | "trades"

type SortState = {
  sortColumn: MarketSort
  sortDirection: TableSortDirection
  toggleSort: (column: MarketSort) => void
}

/** Optional bulk-select adapter (group dashboard only). */
type MarketSelection = {
  selected: Set<string>
  toggle: (id: string) => void
  headerState: (ids: string[]) => boolean | "indeterminate"
  toggleVisible: (ids: string[], checked: boolean) => void
}

/**
 * Sortable header cell shared by every backtest table. Right-aligned columns
 * flip the sort button so the arrow hugs the number.
 */
export function sortHead<Column extends string>(
  label: string,
  column: Column,
  state: {
    sortColumn: Column
    sortDirection: TableSortDirection
    toggleSort: (c: Column) => void
  },
  align: "left" | "right" = "left",
  hoverChevron = false,
  grow = false
) {
  const active = state.sortColumn === column
  return (
    <TableHead
      column="meta"
      key={column}
      className={cn(grow && "w-full", align === "right" && "text-right")}
    >
      <TableSortButton
        active={active}
        direction={state.sortDirection}
        onClick={() => state.toggleSort(column)}
        className={cn(
          align === "right" && "ml-auto flex-row-reverse",
          // Idle columns keep their chevron hidden until the header is hovered;
          // the active column always shows its arrow so the sort stays legible.
          hoverChevron &&
            !active &&
            "[&_svg]:opacity-0 [&_svg]:transition-opacity hover:[&_svg]:opacity-60"
        )}
      >
        {label}
      </TableSortButton>
    </TableHead>
  )
}

const num = (value: number | null) => value ?? -Infinity

/** Filter by market symbol, then sort — one comparator for both dashboards. */
export function sortMarketRows(
  rows: BacktestMarketRow[],
  column: MarketSort,
  direction: TableSortDirection,
  search = ""
): BacktestMarketRow[] {
  const dir = direction === "asc" ? 1 : -1
  const query = search.trim().toLowerCase()
  const matches = query
    ? rows.filter((row) => row.market.toLowerCase().includes(query))
    : rows
  return [...matches].sort((a, b) => {
    if (column === "market") return a.market.localeCompare(b.market) * dir
    if (column === "dd")
      return (num(a.maxDrawdownPct) - num(b.maxDrawdownPct)) * dir
    if (column === "win") return (num(a.winRate) - num(b.winRate)) * dir
    if (column === "trades")
      return (num(a.tradeCount) - num(b.tradeCount)) * dir
    return (num(a.netPnlPct) - num(b.netPnlPct)) * dir
  })
}

/** Local sort state for tables that don't need the full dashboard toolbar. */
export function useMarketSort(defaultColumn: MarketSort = "net") {
  const [sortColumn, setSortColumn] = React.useState<MarketSort>(defaultColumn)
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")
  const toggleSort = React.useCallback((column: MarketSort) => {
    setSortColumn((currentColumn) => {
      if (currentColumn === column) {
        setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      } else {
        setSortDirection("asc")
      }
      return column
    })
  }, [])
  return { sortColumn, sortDirection, toggleSort }
}

const mean = (values: number[]) =>
  values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null

const sum = (values: number[]) =>
  values.length ? values.reduce((total, value) => total + value, 0) : null

const nums = (values: (number | null)[]) =>
  values.filter((value): value is number => value !== null)

/**
 * The markets table shared by the group-history dashboard and the editor's
 * backtest mode: Market · P&L · DD · Win · Trades, closed by an averages/total
 * footer. Rows arrive pre-sorted; a done row is clickable and loads that market.
 */
export function BacktestMarketsTable({
  rows,
  state,
  selectedId,
  onSelect,
  selection,
  emptyLabel = "No market results in this run.",
}: {
  rows: BacktestMarketRow[]
  state: SortState
  selectedId: string | null
  onSelect: (row: BacktestMarketRow) => void
  selection?: MarketSelection
  emptyLabel?: string
}) {
  const ids = rows.map((row) => row.id)
  const colSpan = selection ? 6 : 5

  // Footer aggregates over finished markets only: P&L and trades are summed
  // totals across the basket (the whole run's take, not a per-market average);
  // DD and Win stay averages, since summing a rate is meaningless.
  const doneRows = rows.filter((row) => row.status === "done")
  const summary =
    doneRows.length > 0
      ? {
          netPnl: sum(nums(doneRows.map((row) => row.netPnl))),
          dd: mean(nums(doneRows.map((row) => row.maxDrawdownPct))),
          win: mean(nums(doneRows.map((row) => row.winRate))),
          trades: doneRows.reduce(
            (total, row) => total + (row.tradeCount ?? 0),
            0
          ),
        }
      : null

  return (
    <Table className="text-xs [&_td]:px-2 [&_td:first-child]:pl-3 [&_td:last-child]:pr-3 [&_th]:px-2 [&_th:first-child]:pl-3 [&_th:last-child]:pr-3">
      <TableHeader>
        <TableRow>
          {selection ? (
            <TableHead column="select">
              <Checkbox
                checked={selection.headerState(ids)}
                onCheckedChange={(checked) =>
                  selection.toggleVisible(ids, checked === true)
                }
                aria-label="Select visible markets"
              />
            </TableHead>
          ) : null}
          {sortHead("Market", "market", state, "left", true, true)}
          {sortHead("P&L", "net", state, "right", true)}
          {sortHead("DD", "dd", state, "right", true)}
          {sortHead("Win", "win", state, "right", true)}
          {sortHead("Trades", "trades", state, "right", true)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={colSpan}
              className="h-24 text-center text-xs text-muted-foreground"
            >
              {emptyLabel}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => {
            const done = row.status === "done"
            return (
              <TableRow
                key={row.id}
                className={cn(
                  done && "cursor-pointer",
                  row.id === selectedId && "bg-muted/30 hover:bg-muted/30"
                )}
                onClick={() => {
                  if (done) onSelect(row)
                }}
              >
                {selection ? (
                  <TableCell
                    column="select"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      checked={selection.selected.has(row.id)}
                      onCheckedChange={() => selection.toggle(row.id)}
                      aria-label={`Select ${row.market}`}
                    />
                  </TableCell>
                ) : null}
                <TableCell column="meta" className="w-full">
                  <span className="flex items-center gap-1.5 font-medium">
                    {row.market}
                    {row.activePosition ? (
                      <span
                        className="size-1.5 rounded-full bg-emerald-500"
                        title="Open position"
                      />
                    ) : null}
                  </span>
                </TableCell>
                <TableCell
                  column="meta"
                  className={cn(
                    "text-right font-mono tabular-nums",
                    row.netPnl !== null ? toneClass(row.netPnl) : undefined
                  )}
                >
                  {done && row.netPnl !== null ? signedUsd(row.netPnl) : "—"}
                </TableCell>
                <TableCell
                  column="meta"
                  className="text-right font-mono text-red-500 tabular-nums"
                >
                  {row.maxDrawdownPct !== null
                    ? `-${row.maxDrawdownPct.toFixed(2)}%`
                    : "—"}
                </TableCell>
                <TableCell
                  column="meta"
                  className="text-right font-mono tabular-nums"
                >
                  {row.winRate !== null
                    ? `${(row.winRate * 100).toFixed(1)}%`
                    : "—"}
                </TableCell>
                <TableCell
                  column="meta"
                  className="text-right font-mono tabular-nums"
                >
                  {row.tradeCount ?? "—"}
                </TableCell>
              </TableRow>
            )
          })
        )}
      </TableBody>
      {summary ? (
        <TableFooter>
          <TableRow>
            {selection ? <TableCell column="select" /> : null}
            <TableCell column="meta" className="w-full">
              <span className="text-muted-foreground">Total</span>
            </TableCell>
            <TableCell
              column="meta"
              className={cn(
                "text-right font-mono tabular-nums",
                summary.netPnl !== null ? toneClass(summary.netPnl) : undefined
              )}
            >
              {summary.netPnl !== null ? signedUsd(summary.netPnl) : "—"}
            </TableCell>
            <TableCell
              column="meta"
              className="text-right font-mono text-red-500 tabular-nums"
            >
              {summary.dd !== null ? `-${summary.dd.toFixed(2)}%` : "—"}
            </TableCell>
            <TableCell
              column="meta"
              className="text-right font-mono tabular-nums"
            >
              {summary.win !== null
                ? `${(summary.win * 100).toFixed(1)}%`
                : "—"}
            </TableCell>
            <TableCell
              column="meta"
              className="text-right font-mono tabular-nums"
            >
              {summary.trades}
            </TableCell>
          </TableRow>
        </TableFooter>
      ) : null}
    </Table>
  )
}
