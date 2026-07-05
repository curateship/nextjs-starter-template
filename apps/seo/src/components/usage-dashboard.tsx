import * as React from "react"
import { BarChart3Icon } from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarSelectTrigger } from "@/components/dashboard-toolbar"
import { MetricTile } from "@/components/keywords-dashboard"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ProjectItem } from "@/lib/api/seo-projects"
import {
  getUsageErrorMessage,
  listUsageLogs,
  type UsageLogRow,
  type UsageSummary,
} from "@/lib/api/usage"

const numberFormatter = new Intl.NumberFormat("en-US")
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

function formatCost(cost: number) {
  return `$${cost.toFixed(cost >= 1 ? 2 : 4)}`
}

export function UsageDashboard({
  summary,
  endpoints,
  projects,
}: {
  summary: UsageSummary
  endpoints: string[]
  projects: ProjectItem[]
}) {
  const [rows, setRows] = React.useState<UsageLogRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(25)
  const [projectFilter, setProjectFilter] = React.useState("all")
  const [endpointFilter, setEndpointFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState("all")

  React.useEffect(() => {
    setPage(1)
  }, [projectFilter, endpointFilter, statusFilter, pageSize])

  React.useEffect(() => {
    let active = true
    setLoading(true)
    listUsageLogs({
      projectId: projectFilter === "all" ? undefined : projectFilter,
      endpoint: endpointFilter === "all" ? undefined : endpointFilter,
      success:
        statusFilter === "all" ? undefined : statusFilter === "success",
      pagination: { page, pageSize },
    })
      .then((data) => {
        if (!active) return
        setRows(data.rows)
        setTotal(data.total)
        setError(null)
      })
      .catch((loadError) => {
        if (active) setError(getUsageErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectFilter, endpointFilter, statusFilter, page, pageSize])

  const failureRate = summary.requestCount
    ? Math.round((summary.failureCount / summary.requestCount) * 100)
    : 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const topProject = summary.byProject[0] ?? null

  return (
    <div className="w-full pb-8">
      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label={`Cost (last ${summary.days} days)`}
          value={formatCost(summary.totalCost)}
        />
        <MetricTile
          label="Requests"
          value={numberFormatter.format(summary.requestCount)}
        />
        <MetricTile
          label="Keywords processed"
          value={numberFormatter.format(summary.keywordCount)}
        />
        <MetricTile
          label="Failure rate"
          value={
            <span
              className={
                failureRate >= 25 ? "text-destructive" : undefined
              }
            >
              {failureRate}% ({numberFormatter.format(summary.failureCount)}{" "}
              failed)
            </span>
          }
        />
      </div>

      {topProject ? (
        <div className="mb-4 text-xs text-muted-foreground">
          Top spend:{" "}
          {summary.byProject
            .slice(0, 3)
            .map(
              (project) =>
                `${project.projectName ?? "No project"} ${formatCost(project.cost)}`
            )
            .join(" · ")}
        </div>
      ) : null}

      <DashboardTable
        title="API Usage"
        icon={
          <BarChart3Icon className="size-4 text-muted-foreground sm:size-[18px]" />
        }
        count={total}
        controls={
          <>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <DashboardToolbarSelectTrigger aria-label="Filter by project">
                <SelectValue placeholder="Project" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={endpointFilter} onValueChange={setEndpointFilter}>
              <DashboardToolbarSelectTrigger aria-label="Filter by endpoint">
                <SelectValue placeholder="Endpoint" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Endpoints</SelectItem>
                {endpoints.map((endpoint) => (
                  <SelectItem key={endpoint} value={endpoint}>
                    {shortEndpoint(endpoint)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <DashboardToolbarSelectTrigger aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Endpoint</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                Project
              </TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                Job type
              </TableHead>
              <TableHead column="meta">Keywords</TableHead>
              <TableHead column="meta">Cost</TableHead>
              <TableHead column="meta">Status</TableHead>
              <TableHead column="meta" className="hidden sm:table-cell">
                Time
              </TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={loading || rows.length === 0}
        emptyText={
          loading
            ? "Loading usage logs..."
            : "No API usage logged yet. Run keyword research to see requests here."
        }
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page,
          pageSize,
          total,
          totalPages,
          pageSizeOptions: [10, 25, 50, 100],
          onPageChange: (nextPage) =>
            setPage(Math.max(1, Math.min(nextPage, totalPages))),
          onPageSizeChange: setPageSize,
        }}
      >
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell column="main">
              <div
                className="truncate text-xs font-medium sm:text-sm"
                title={row.endpoint}
              >
                {shortEndpoint(row.endpoint)}
              </div>
              {!row.success && row.statusMessage ? (
                <div
                  className="max-w-md truncate text-xs text-muted-foreground"
                  title={row.statusMessage}
                >
                  {row.statusMessage}
                </div>
              ) : null}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              {row.projectName ?? "—"}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {row.jobType ?? "—"}
            </TableCell>
            <TableCell column="mutedMeta">
              {row.keywordCount != null
                ? numberFormatter.format(row.keywordCount)
                : "—"}
            </TableCell>
            <TableCell column="mutedMeta">
              {row.cost != null ? formatCost(row.cost) : "—"}
            </TableCell>
            <TableCell column="meta">
              {row.success ? (
                <Badge variant="secondary">Success</Badge>
              ) : (
                <Badge variant="destructive">
                  Failed{row.statusCode ? ` (${row.statusCode})` : ""}
                </Badge>
              )}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden sm:table-cell">
              {dateTimeFormatter.format(new Date(row.createdAt))}
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
    </div>
  )
}

function shortEndpoint(endpoint: string) {
  return endpoint.replace(/^\/v3\//, "")
}
