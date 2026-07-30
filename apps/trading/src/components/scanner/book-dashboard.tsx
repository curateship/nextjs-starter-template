import * as React from "react"
import { BookOpenIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { Badge } from "@/components/ui/badge"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatNotional } from "@/components/scanner/format"
import { SortHeaderRow, type SortDir } from "@/components/scanner/sort-head"
import { OrderBook } from "@/components/trading/order-book"
import { formatPriceDisplay } from "@/components/trading/format"
import {
  loadBookMetrics,
  type BookMetricsItem,
  type BookMetricsResponse,
} from "@/lib/api/scanner"
import { cn } from "@/lib/utils"
import { useVisibleInterval } from "@/lib/use-visible-interval"

const POLL_MS = 5_000

type BookSortKey =
  | "coin"
  | "mid"
  | "spread"
  | "bids"
  | "asks"
  | "imbalance"
  | "walls"
  | "updated"

const COLUMNS: { key: BookSortKey; label: string; main?: boolean }[] = [
  { key: "coin", label: "Coin", main: true },
  { key: "mid", label: "Mid" },
  { key: "spread", label: "Spread" },
  { key: "bids", label: "Bids 1%" },
  { key: "asks", label: "Asks 1%" },
  { key: "imbalance", label: "Imbalance" },
  { key: "walls", label: "Walls" },
  { key: "updated", label: "Updated" },
]

// Numeric value for a column; NaN (missing) always sorts last. Coin is the
// one string column, handled separately in the comparator.
function sortValue(item: BookMetricsItem, key: BookSortKey): number {
  switch (key) {
    case "mid":
      return item.mid === null ? NaN : Number(item.mid)
    case "spread":
      return item.spreadBps === null ? NaN : Number(item.spreadBps)
    case "bids":
      return item.bidLiquidity["0.01"] ?? NaN
    case "asks":
      return item.askLiquidity["0.01"] ?? NaN
    case "imbalance":
      return item.imbalance === null ? NaN : Number(item.imbalance)
    case "walls":
      return item.walls.reduce((max, wall) => Math.max(max, wall.usd), 0)
    case "updated":
      return new Date(item.updatedAt).getTime()
    default:
      return NaN
  }
}

export function BookDashboard({ initial }: { initial: BookMetricsResponse }) {
  const [data, setData] = React.useState(initial)
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const [sort, setSort] = React.useState<{ sortBy: BookSortKey; dir: SortDir }>(
    {
      sortBy: "updated",
      dir: "desc",
    }
  )

  useVisibleInterval(async () => {
    setData(await loadBookMetrics())
  }, POLL_MS)

  const sortedItems = React.useMemo(() => {
    const items = [...data.items]
    const { sortBy, dir } = sort
    items.sort((a, b) => {
      if (sortBy === "coin") {
        const cmp = a.coin.localeCompare(b.coin)
        return dir === "asc" ? cmp : -cmp
      }
      const av = sortValue(a, sortBy)
      const bv = sortValue(b, sortBy)
      const aNan = Number.isNaN(av)
      const bNan = Number.isNaN(bv)
      if (aNan && bNan) return 0
      if (aNan) return 1
      if (bNan) return -1
      return dir === "asc" ? av - bv : bv - av
    })
    return items
  }, [data.items, sort])

  return (
    <div className="w-full">
      <DashboardTable
        title="Order Book Scanner"
        icon={
          <BookOpenIcon className="text-muted-foreground" />
        }
        count={data.items.length}
        header={
          <SortHeaderRow
            columns={COLUMNS}
            activeKey={sort.sortBy}
            dir={sort.dir}
            onSort={setSort}
          />
        }
        isEmpty={data.items.length === 0}
        emptyText="No book metrics yet. The worker watches the top-volume coins and updates every few seconds."
        emptyColSpan={8}
        footer={{ type: "summary", count: data.items.length }}
      >
        {sortedItems.map((item) => (
          <React.Fragment key={item.coin}>
            <BookRow
              item={item}
              expanded={expanded === item.coin}
              onToggle={() =>
                setExpanded(expanded === item.coin ? null : item.coin)
              }
            />
            {expanded === item.coin ? (
              <TableRow>
                <TableCell column="main" colSpan={8}>
                  <div className="max-w-sm py-2">
                    <OrderBook network="mainnet" coin={item.coin} />
                  </div>
                </TableCell>
              </TableRow>
            ) : null}
          </React.Fragment>
        ))}
      </DashboardTable>
    </div>
  )
}

function BookRow({
  item,
  expanded,
  onToggle,
}: {
  item: BookMetricsItem
  expanded: boolean
  onToggle: () => void
}) {
  const imbalance = item.imbalance === null ? null : Number(item.imbalance)
  const bid1 = item.bidLiquidity["0.01"]
  const ask1 = item.askLiquidity["0.01"]
  const nearWalls = item.walls.filter((wall) => wall.distance <= 0.005)
  return (
    <TableRow className="cursor-pointer" onClick={onToggle}>
      <TableCell column="main">
        <span className="flex items-center gap-1 font-medium">
          {expanded ? (
            <ChevronDownIcon className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="size-3.5 text-muted-foreground" />
          )}
          {item.coin}
        </span>
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs tabular-nums">
          {item.mid === null ? "—" : formatPriceDisplay(item.mid)}
        </span>
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs tabular-nums">
          {item.spreadBps === null
            ? "—"
            : `${Number(item.spreadBps).toFixed(1)} bps`}
        </span>
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs text-emerald-600 tabular-nums">
          {bid1 === undefined ? "—" : formatNotional(bid1)}
        </span>
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs text-red-500 tabular-nums">
          {ask1 === undefined ? "—" : formatNotional(ask1)}
        </span>
      </TableCell>
      <TableCell column="meta">
        <span
          className={cn(
            "font-mono text-xs font-medium tabular-nums",
            imbalance !== null && imbalance >= 1.5 && "text-emerald-600",
            imbalance !== null && imbalance <= 1 / 1.5 && "text-red-500"
          )}
        >
          {imbalance === null ? "—" : `${imbalance.toFixed(2)}x`}
        </span>
      </TableCell>
      <TableCell column="meta">
        {item.walls.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {item.walls.slice(0, 2).map((wall) => (
              <Badge
                key={`${wall.side}-${wall.px}`}
                variant="secondary"
                className={cn(
                  nearWalls.includes(wall) && "ring-1 ring-primary/40",
                  wall.side === "bid" ? "text-emerald-600" : "text-red-500"
                )}
              >
                {wall.side} {formatNotional(wall.usd)} @{" "}
                {formatPriceDisplay(wall.px)}
              </Badge>
            ))}
            {item.walls.length > 2 ? (
              <span className="text-xs text-muted-foreground">
                +{item.walls.length - 2}
              </span>
            ) : null}
          </span>
        )}
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {new Date(item.updatedAt).toLocaleTimeString("en-US", {
            hour12: false,
          })}
        </span>
      </TableCell>
    </TableRow>
  )
}
