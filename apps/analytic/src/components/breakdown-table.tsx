import * as React from "react"

import {
  DashboardToolbar,
  DashboardToolbarTitle,
} from "@/components/dashboard-toolbar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  TableSurface,
  type TableSortDirection,
} from "@/components/ui/table"

const numberFormat = new Intl.NumberFormat()

type BreakdownSortColumn = "key" | "count"

// Ranked list with a proportional bar behind each label — the house form for
// "top N by count" breakdowns (pages, referrers, devices, countries, ...).
export function BreakdownTable({
  title,
  columnLabel,
  countLabel = "Views",
  icon,
  items,
  emptyText,
  formatKey,
}: {
  title: string
  columnLabel: string
  countLabel?: string
  icon: React.ReactNode
  items: { key: string; count: number }[]
  emptyText: string
  formatKey?: (key: string) => string
}) {
  const [sortColumn, setSortColumn] =
    React.useState<BreakdownSortColumn>("count")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")

  const max = items.reduce((acc, item) => Math.max(acc, item.count), 0)

  const sortedItems = React.useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1
    const label = (item: { key: string }) =>
      formatKey ? formatKey(item.key) : item.key
    return [...items].sort((a, b) =>
      sortColumn === "count"
        ? (a.count - b.count) * direction
        : label(a).localeCompare(label(b)) * direction
    )
  }, [items, sortColumn, sortDirection, formatKey])

  function toggleSort(column: BreakdownSortColumn) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortColumn(column)
    setSortDirection(column === "count" ? "desc" : "asc")
  }

  return (
    <TableSurface className="flex-1">
      <DashboardToolbar>
        <DashboardToolbarTitle>
          {icon}
          <span className="text-sm font-medium sm:text-base">{title}</span>
        </DashboardToolbarTitle>
      </DashboardToolbar>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead column="main">
              <TableSortButton
                active={sortColumn === "key"}
                direction={sortDirection}
                onClick={() => toggleSort("key")}
              >
                {columnLabel}
              </TableSortButton>
            </TableHead>
            <TableHead column="meta">
              <TableSortButton
                active={sortColumn === "count"}
                direction={sortDirection}
                onClick={() => toggleSort("count")}
              >
                {countLabel}
              </TableSortButton>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedItems.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={2}
                className="h-24 text-center text-sm text-muted-foreground"
              >
                {emptyText}
              </TableCell>
            </TableRow>
          ) : (
            sortedItems.map((item) => (
              <TableRow key={item.key}>
                <TableCell column="main">
                  <div className="relative flex items-center">
                    <span
                      aria-hidden
                      className="absolute inset-y-1 left-0 rounded-sm bg-muted"
                      style={{
                        width: max ? `${(item.count / max) * 100}%` : "0%",
                      }}
                    />
                    <span className="relative truncate px-1 font-medium">
                      {formatKey ? formatKey(item.key) : item.key}
                    </span>
                  </div>
                </TableCell>
                <TableCell column="meta" className="tabular-nums">
                  {numberFormat.format(item.count)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableSurface>
  )
}
