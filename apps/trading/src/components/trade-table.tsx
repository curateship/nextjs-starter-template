import * as React from "react"

import {
  signedPct,
  signedUsd,
  toneClass,
  usd,
} from "@/lib/format"
import {
  STICKY_TABLE_HEADER,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

/**
 * One row of the shared trade list — the same 8 columns everywhere a list of
 * round trips is shown (backtest results, bot history), so every dashboard
 * reads identically. Closed trips fill every field; the still-open cycle is
 * passed separately and pinned after the sorted rows.
 */
export type TradeTableRow = {
  /** Stable selection key. */
  id: string
  n: number
  side: "long" | "short"
  entryTime: number
  /** null while the cycle is still open. */
  exitTime: number | null
  /** Entry notional in dollars. */
  amount: number
  pnl: number
  /** null renders as "—". */
  returnPct: number | null
  /** null renders as "—". */
  cumPnl: number | null
  /** Render faded — e.g. replay rows the playhead hasn't reached yet. */
  dimmed?: boolean
}

type TradeSortKey =
  | "n"
  | "side"
  | "entryTime"
  | "exitTime"
  | "amount"
  | "pnl"
  | "returnPct"
  | "cumPnl"

const TRADE_COLUMNS: {
  key: TradeSortKey
  label: string
  right?: boolean
  value: (row: TradeTableRow) => number | string
}[] = [
  { key: "n", label: "#", value: (t) => t.n },
  { key: "side", label: "Side", value: (t) => t.side },
  { key: "entryTime", label: "Entry", value: (t) => t.entryTime },
  { key: "exitTime", label: "Exit", value: (t) => t.exitTime ?? 0 },
  { key: "amount", label: "Amount", right: true, value: (t) => t.amount },
  { key: "pnl", label: "P&L", right: true, value: (t) => t.pnl },
  { key: "returnPct", label: "Return", right: true, value: (t) => t.returnPct ?? 0 },
  { key: "cumPnl", label: "Cum. P&L", right: true, value: (t) => t.cumPnl ?? 0 },
]

export function fmtTradeDate(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

export function TradeTable({
  rows,
  openRow,
  selectedId,
  onSelect,
  emptyText,
}: {
  /** Closed round trips; the table sorts these. */
  rows: TradeTableRow[]
  /** Still-open cycle, pinned after the sorted rows. */
  openRow?: TradeTableRow | null
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  emptyText: string
}) {
  const [sort, setSort] = React.useState<{
    key: TradeSortKey
    dir: TableSortDirection
  }>({ key: "n", dir: "asc" })

  const sorted = React.useMemo(() => {
    const column = TRADE_COLUMNS.find((c) => c.key === sort.key) ?? TRADE_COLUMNS[0]
    const out = [...rows]
    out.sort((a, b) => {
      const av = column.value(a)
      const bv = column.value(b)
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv))
      return sort.dir === "asc" ? cmp : -cmp
    })
    return out
  }, [rows, sort])

  if (rows.length === 0 && !openRow) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
        {emptyText}
      </div>
    )
  }

  const toggleSort = (key: TradeSortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    )

  const rowProps = (row: TradeTableRow) => ({
    onClick: () => onSelect?.(row.id === selectedId ? null : row.id),
    className: cn(
      "cursor-pointer font-mono text-[11px]",
      row.id === selectedId && "bg-muted/60 hover:bg-muted/60",
      row.dimmed && "opacity-40"
    ),
  })

  return (
    <Table>
      <TableHeader className={STICKY_TABLE_HEADER}>
        <TableRow>
          {TRADE_COLUMNS.map((column) => (
            <TableHead
              key={column.key}
              className={column.right ? "text-right" : undefined}
            >
              <TableSortButton
                active={sort.key === column.key}
                direction={sort.dir}
                onClick={() => toggleSort(column.key)}
                className={column.right ? "ml-auto flex-row-reverse" : undefined}
              >
                {column.label}
              </TableSortButton>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => (
          <TableRow key={row.id} {...rowProps(row)}>
            <TableCell className="text-muted-foreground">{row.n}</TableCell>
            <TableCell
              className={cn(
                "font-sans font-semibold",
                row.side === "long" ? "text-emerald-600" : "text-red-500"
              )}
            >
              {row.side === "long" ? "Long" : "Short"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {fmtTradeDate(row.entryTime)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {row.exitTime != null ? fmtTradeDate(row.exitTime) : "—"}
            </TableCell>
            <TableCell className="text-right text-muted-foreground">
              {usd(row.amount)}
            </TableCell>
            <TableCell className={cn("text-right", toneClass(row.pnl))}>
              {signedUsd(row.pnl)}
            </TableCell>
            <TableCell
              className={cn(
                "text-right",
                row.returnPct != null ? toneClass(row.returnPct) : "text-muted-foreground"
              )}
            >
              {row.returnPct != null ? signedPct(row.returnPct) : "—"}
            </TableCell>
            <TableCell
              className={cn(
                "text-right",
                row.cumPnl != null ? toneClass(row.cumPnl) : "text-muted-foreground"
              )}
            >
              {row.cumPnl != null ? signedUsd(row.cumPnl) : "—"}
            </TableCell>
          </TableRow>
        ))}
        {openRow ? (
          <TableRow key={openRow.id} {...rowProps(openRow)}>
            <TableCell className="text-muted-foreground">·</TableCell>
            <TableCell className="font-sans font-semibold text-amber-600">
              Open {openRow.side === "long" ? "Long" : "Short"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {fmtTradeDate(openRow.entryTime)}
            </TableCell>
            <TableCell className="text-muted-foreground">—</TableCell>
            <TableCell className="text-right text-muted-foreground">
              {usd(openRow.amount)}
            </TableCell>
            <TableCell className={cn("text-right", toneClass(openRow.pnl))}>
              {signedUsd(openRow.pnl)}
            </TableCell>
            <TableCell className="text-right text-muted-foreground">—</TableCell>
            <TableCell className="text-right text-muted-foreground">—</TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  )
}
