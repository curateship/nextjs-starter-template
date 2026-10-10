import * as React from "react"
import { Link } from "@tanstack/react-router"
import { GaugeIcon, UsersIcon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import {
  StatStrip,
  type StatFigure,
} from "@/components/shared/dashboard/stat-strip"
import { TableCell, TableRow } from "@/components/ui/table"
import type { AdminUsageSummary } from "@/lib/api/billing/usage"
import { describeCode } from "@/lib/format/code-label"
import { formatDateTime } from "@/lib/format/format-time"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { useTableSort } from "@/lib/hooks/use-table-sort"

export function AdminUsageDashboard({ data }: { data: AdminUsageSummary }) {
  const needsReview = data.pendingStripeReports + data.failedStripeReports
  const figures: StatFigure[] = [
    {
      key: "units",
      label: "Units used",
      value: data.totalQuantity.toLocaleString(),
      footer: "this month",
    },
    {
      key: "events",
      label: "Usage events",
      value: data.totalEvents.toLocaleString(),
      footer: "this month",
    },
    {
      key: "meters",
      label: "Active meters",
      value: data.activeMeters.toLocaleString(),
      footer: "with usage this month",
    },
    {
      key: "stripe",
      label: "Stripe reports to review",
      value: needsReview.toLocaleString(),
      footer: data.failedStripeReports
        ? `${data.failedStripeReports.toLocaleString()} could not be recovered`
        : data.pendingStripeReports
          ? "waiting to retry"
          : "everything reported",
    },
  ]

  return (
    <div className="flex min-w-0 flex-col" style={{ gap: pageGutter }}>
      <StatStrip figures={figures} />
      <MeterTable rows={data.byMeter} />
      <PersonTable rows={data.byPerson} />
    </div>
  )
}

type MeterSort = "meter" | "quantity" | "events" | "stripe"

const meterColumns: SortableColumn<MeterSort>[] = [
  { key: "meter", label: "Meter", column: "main" },
  { key: "quantity", label: "Units", column: "meta" },
  { key: "events", label: "Events", column: "meta" },
  { key: "stripe", label: "Stripe reports to review", column: "meta" },
]

function MeterTable({ rows }: { rows: AdminUsageSummary["byMeter"] }) {
  const { sort, direction, toggleSort } = useTableSort<MeterSort>(
    "quantity",
    "desc"
  )
  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      const compared =
        sort === "meter"
          ? a.meter.localeCompare(b.meter)
          : sort === "quantity"
            ? a.quantity - b.quantity
            : sort === "events"
              ? a.events - b.events
              : a.pending + a.failed - (b.pending + b.failed)
      return compared * factor
    })
  }, [direction, rows, sort])

  return (
    <DashboardTable
      title="Usage by meter"
      icon={<GaugeIcon />}
      count={rows.length}
      header={
        <SortableTableHeader
          columns={meterColumns}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
        />
      }
      isEmpty={rows.length === 0}
      emptyText="No metered usage has been recorded this month."
      emptyColSpan={4}
      footer={{ type: "summary", count: rows.length, label: "meters" }}
    >
      {sorted.map((row) => (
        <TableRow key={row.meter}>
          <TableCell column="main" className="font-medium">
            {describeCode(row.meter)}
          </TableCell>
          <TableCell column="meta" className="tabular-nums">
            {row.quantity.toLocaleString()}
          </TableCell>
          <TableCell column="meta" className="tabular-nums">
            {row.events.toLocaleString()}
          </TableCell>
          <TableCell column="meta" className="tabular-nums">
            {(row.pending + row.failed).toLocaleString()}
          </TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}

type PersonSort = "person" | "quantity" | "events" | "last"

const personColumns: SortableColumn<PersonSort>[] = [
  { key: "person", label: "Person", column: "main" },
  { key: "quantity", label: "Units", column: "meta" },
  { key: "events", label: "Events", column: "meta" },
  { key: "last", label: "Last used", column: "meta" },
]

function PersonTable({ rows }: { rows: AdminUsageSummary["byPerson"] }) {
  const { sort, direction, toggleSort } = useTableSort<PersonSort>(
    "quantity",
    "desc"
  )
  const sorted = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      const compared =
        sort === "person"
          ? a.name.localeCompare(b.name)
          : sort === "quantity"
            ? a.quantity - b.quantity
            : sort === "events"
              ? a.events - b.events
              : Date.parse(a.lastUsedAt) - Date.parse(b.lastUsedAt)
      return compared * factor
    })
  }, [direction, rows, sort])

  return (
    <DashboardTable
      title="Usage by person"
      icon={<UsersIcon />}
      count={rows.length}
      header={
        <SortableTableHeader
          columns={personColumns}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
        />
      }
      isEmpty={rows.length === 0}
      emptyText="No account has recorded metered usage this month."
      emptyColSpan={4}
      footer={{ type: "summary", count: rows.length, label: "accounts" }}
    >
      {sorted.map((row) => (
        <TableRow key={row.userId ?? "deleted"}>
          <TableCell column="main">
            {row.userId ? (
              <Link
                to="/admin/users"
                search={{ open: row.userId }}
                className="font-medium hover:underline"
              >
                {row.name}
              </Link>
            ) : (
              <span className="font-medium">{row.name}</span>
            )}
            {row.email ? (
              <span className="block text-xs text-muted-foreground">
                {row.email}
              </span>
            ) : null}
          </TableCell>
          <TableCell column="meta" className="tabular-nums">
            {row.quantity.toLocaleString()}
          </TableCell>
          <TableCell column="meta" className="tabular-nums">
            {row.events.toLocaleString()}
          </TableCell>
          <TableCell column="mutedMeta">
            {formatDateTime(row.lastUsedAt)}
          </TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}
