import * as React from "react"
import { RefreshCwIcon, ShieldCheckIcon } from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import { SortHeaderRow, type SortDir } from "@/components/scanner/sort-head"
import { Badge } from "@/components/ui/badge"
import { TableCell, TableRow } from "@/components/ui/table"
import {
  loadAuditPage,
  type AuditItem,
  type AuditPageResponse,
  type AuditSortBy,
} from "@/lib/api/audit"

const COLUMNS = [
  { key: "action", label: "Action", main: true },
  { key: "actor", label: "Actor" },
  { key: "wallet", label: "Wallet" },
  { key: "market", label: "Market" },
  { key: "status", label: "Status" },
  { key: "time", label: "Time" },
] as const

export function AuditDashboard({ initial }: { initial: AuditPageResponse }) {
  const [data, setData] = React.useState<AuditPageResponse>(initial)
  const [sort, setSort] = React.useState<{ sortBy: AuditSortBy; dir: SortDir }>(
    { sortBy: "time", dir: "desc" }
  )
  const [loading, setLoading] = React.useState(false)

  async function fetchPage(page: number, pageSize: number, nextSort = sort) {
    setLoading(true)
    try {
      setData(await loadAuditPage(page, pageSize, nextSort.sortBy, nextSort.dir))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      <DashboardTable
        title="Audit Log"
        icon={
          <ShieldCheckIcon className="size-4 text-muted-foreground sm:size-[18px]" />
        }
        count={data.total}
        controls={
          <DashboardToolbarButton
            type="button"
            disabled={loading}
            onClick={() => void fetchPage(data.page, data.pageSize)}
          >
            <RefreshCwIcon className="size-4" />
            Refresh
          </DashboardToolbarButton>
        }
        loading={loading}
        header={
          <SortHeaderRow
            columns={COLUMNS}
            activeKey={sort.sortBy}
            dir={sort.dir}
            onSort={(next) => {
              setSort(next)
              void fetchPage(1, data.pageSize, next)
            }}
          />
        }
        isEmpty={data.items.length === 0}
        emptyText="No signed actions yet. Every order, cancel, and leverage change lands here."
        emptyColSpan={6}
        footer={{
          type: "pagination",
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          totalPages: Math.max(1, Math.ceil(data.total / data.pageSize)),
          onPageChange: (page) => void fetchPage(page, data.pageSize),
          onPageSizeChange: (pageSize) => void fetchPage(1, pageSize),
        }}
      >
        {data.items.map((item) => (
          <AuditRow key={item.id} item={item} />
        ))}
      </DashboardTable>
    </div>
  )
}

function AuditRow({ item }: { item: AuditItem }) {
  const summary = summarizeRequest(item)
  return (
    <TableRow>
      <TableCell column="main">
        <div className="min-w-0">
          <div className="font-medium">{item.action_type}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {summary}
          </div>
          {item.error_message ? (
            <div className="truncate text-xs text-destructive">
              {item.error_message}
            </div>
          ) : null}
        </div>
      </TableCell>
      <TableCell column="meta">
        <Badge variant="secondary">{item.actor}</Badge>
      </TableCell>
      <TableCell column="meta">{item.wallet_label ?? "—"}</TableCell>
      <TableCell column="meta">{item.market ?? "—"}</TableCell>
      <TableCell column="meta">
        {item.status === "ok" ? (
          <Badge>ok</Badge>
        ) : item.status === "rejected_risk" ? (
          <Badge variant="outline">risk</Badge>
        ) : (
          <Badge variant="destructive">error</Badge>
        )}
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs tabular-nums">
          {new Date(item.created_at).toLocaleString("en-US", { hour12: false })}
        </span>
      </TableCell>
    </TableRow>
  )
}

function summarizeRequest(item: AuditItem): string {
  const request = item.request
  if (!request || typeof request !== "object") return ""
  const parts: string[] = []
  const record = request as Record<string, unknown>
  for (const key of ["side", "px", "sz", "tif", "leverage", "oid"]) {
    if (record[key] !== undefined && record[key] !== null) {
      parts.push(`${key}=${String(record[key])}`)
    }
  }
  return parts.join(" ")
}
