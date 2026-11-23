import * as React from "react"
import { Link } from "@tanstack/react-router"
import { TrophyIcon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarSelectTrigger } from "@/components/shared/dashboard-toolbar"
import {
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { PnlAmount, ShowPublicFigures } from "@/components/trade/pnl-amount"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { moneyTone } from "@/lib/trade/money-tone"
import {
  LEADERBOARD_MIN_DAYS,
  LEADERBOARD_MIN_TRADES,
  LEADERBOARD_PERIOD_LABELS,
  LEADERBOARD_PERIODS,
  isLeaderboardPeriod,
  type LeaderboardPeriod,
  type LeaderboardRow,
} from "@/lib/trade/public-profile/profile"
import { signedWholeUsd } from "@/lib/trade/public-profile/share-image"
import { cn } from "@/lib/utils"

type Column = "trader" | "made" | "won" | "trades"

const COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "trader", label: "Trader", column: "main" },
  { key: "made", label: "Made", column: "meta" },
  { key: "won", label: "Made money", column: "meta" },
  {
    key: "trades",
    label: "Trades",
    column: "meta",
    className: "hidden sm:table-cell",
  },
  {
    key: "venues",
    label: "Exchanges",
    sortable: false,
    column: "meta",
    className: "hidden md:table-cell",
  },
]

/**
 * `/traders`: every public profile past the minimums, ranked by dollars made.
 *
 * The period and the exchange live in the address, so a shared link opens on
 * the same list. Sorting and filtering happen here, on the one answer the
 * page loaded, so changing them asks the server nothing.
 */
export function Leaderboard({
  rows,
  period,
  exchange,
  onChange,
}: {
  rows: LeaderboardRow[]
  period: LeaderboardPeriod
  exchange: string | null
  onChange: (next: { period?: LeaderboardPeriod; exchange?: string }) => void
}) {
  const { sort, direction, toggleSort } = useTableSort<Column>(
    "made",
    "desc",
    (column) => (column === "trader" ? "asc" : "desc")
  )
  const venues = React.useMemo(() => {
    const byId = new Map<string, string>()
    for (const row of rows) {
      row.protocols.forEach((id, index) => byId.set(id, row.venues[index]))
    }
    return [...byId].sort((left, right) => left[1].localeCompare(right[1]))
  }, [rows])

  const shown = React.useMemo(() => {
    const kept = exchange
      ? rows.filter((row) => row.protocols.some((id) => id === exchange))
      : rows
    const value = (row: LeaderboardRow): number | string =>
      sort === "trader"
        ? row.handle
        : sort === "won"
          ? (row.wonPer100 ?? -1)
          : sort === "trades"
            ? row.closedTrades
            : row.made[period]
    const sign = direction === "asc" ? 1 : -1
    return [...kept].sort((left, right) => {
      const a = value(left)
      const b = value(right)
      const order =
        typeof a === "string" ? a.localeCompare(String(b)) : a - Number(b)
      return order * sign || left.handle.localeCompare(right.handle)
    })
  }, [direction, exchange, period, rows, sort])

  return (
    <ShowPublicFigures>
      <DashboardTable
        title="Traders"
        icon={<TrophyIcon />}
        count={shown.length}
        controls={
          <>
            <Select
              value={period}
              onValueChange={(value) => {
                if (isLeaderboardPeriod(value)) onChange({ period: value })
              }}
            >
              <DashboardToolbarSelectTrigger aria-label="Period">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                {LEADERBOARD_PERIODS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {LEADERBOARD_PERIOD_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={exchange ?? "all"}
              onValueChange={(value) =>
                onChange({ exchange: value === "all" ? undefined : value })
              }
            >
              <DashboardToolbarSelectTrigger aria-label="Exchange">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All exchanges</SelectItem>
                {venues.map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={<TableHead column="meta">#</TableHead>}
          />
        }
        isEmpty={shown.length === 0}
        emptyText={`No public profile has a record ${LEADERBOARD_MIN_DAYS} days long with ${LEADERBOARD_MIN_TRADES} closed trades${exchange ? " on that exchange" : ""} yet.`}
        emptyColSpan={6}
        footer={{
          type: "summary",
          count: shown.length,
          label: shown.length === 1 ? "trader" : "traders",
        }}
      >
        {shown.map((row, index) => (
          <TableRow key={row.handle} className="group">
            <TableCell column="meta" className="tabular-nums">
              {index + 1}
            </TableCell>
            <TableCell column="main">
              <Link
                to="/t/$handle"
                params={{ handle: row.handle }}
                className="flex max-w-40 items-center gap-2 text-sm font-medium group-hover:underline sm:max-w-72"
              >
                <Avatar size="sm">
                  {row.picture ? (
                    <AvatarImage src={row.picture} alt="" />
                  ) : null}
                  <AvatarFallback>
                    {row.displayName.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">
                  {row.displayName}{" "}
                  <span className="font-normal text-muted-foreground">
                    @{row.handle}
                  </span>
                </span>
              </Link>
            </TableCell>
            <TableCell column="meta">
              <PnlAmount
                className={cn(
                  "font-medium tabular-nums",
                  moneyTone(Math.round(row.made[period]))
                )}
              >
                {signedWholeUsd(row.made[period])}
              </PnlAmount>
            </TableCell>
            <TableCell column="meta" className="tabular-nums">
              {row.wonPer100 === null ? "—" : `${row.wonPer100} out of 100`}
            </TableCell>
            <TableCell
              column="meta"
              className="hidden tabular-nums sm:table-cell"
            >
              {row.closedTrades.toLocaleString("en-US")}
            </TableCell>
            <TableCell
              column="meta"
              className="hidden max-w-64 whitespace-normal md:table-cell"
            >
              {row.venues.join(", ")}
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
    </ShowPublicFigures>
  )
}
