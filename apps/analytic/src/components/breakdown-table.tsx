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
  TableSurface,
} from "@/components/ui/table"

const numberFormat = new Intl.NumberFormat()

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
  const max = items.reduce((acc, item) => Math.max(acc, item.count), 0)

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
            <TableHead column="main">{columnLabel}</TableHead>
            <TableHead column="meta">{countLabel}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={2}
                className="h-24 text-center text-sm text-muted-foreground"
              >
                {emptyText}
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
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
