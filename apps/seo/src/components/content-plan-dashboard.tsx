import * as React from "react"
import {
  CalendarClockIcon,
  DownloadIcon,
  Loader2Icon,
  SettingsIcon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import {
  IntentBadge,
  KeywordDetailDialog,
  KeywordStatusBadge,
  OpportunityScoreBadge,
  downloadCsv,
} from "@/components/keywords-dashboard"
import { Button } from "@/components/ui/button"
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
  TableSortButton,
} from "@/components/ui/table"
import {
  exportKeywordsCsv,
  getKeywordErrorMessage,
  listProjectKeywords,
  type KeywordFilters,
  type KeywordSort,
  type ProjectKeywordRow,
} from "@/lib/api/keywords"
import type { ProjectItem } from "@/lib/api/seo-projects"
import {
  SEARCH_INTENTS,
  keywordStatusLabels,
  searchIntentLabels,
  suggestedPageTypeLabels,
  type KeywordStatus,
  type SearchIntent,
} from "@/lib/keyword-research"

const PLAN_STATUSES: KeywordStatus[] = ["saved", "planned", "published"]
const numberFormatter = new Intl.NumberFormat("en-US")

export function ContentPlanDashboard({ project }: { project: ProjectItem }) {
  const projectId = project.id
  const [rows, setRows] = React.useState<ProjectKeywordRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshToken, setRefreshToken] = React.useState(0)

  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(25)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [debouncedQuery, setDebouncedQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [intentFilter, setIntentFilter] = React.useState("all")
  const [sort, setSort] = React.useState<KeywordSort>({
    field: "opportunityScore",
    direction: "desc",
  })
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [exporting, setExporting] = React.useState(false)

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timeout)
  }, [searchQuery])

  const filters = React.useMemo<KeywordFilters>(() => {
    const result: KeywordFilters = {
      status:
        statusFilter === "all"
          ? PLAN_STATUSES
          : [statusFilter as KeywordStatus],
    }
    if (debouncedQuery.trim()) result.q = debouncedQuery.trim()
    if (intentFilter !== "all") result.intent = [intentFilter as SearchIntent]
    return result
  }, [debouncedQuery, statusFilter, intentFilter])

  React.useEffect(() => {
    setPage(1)
  }, [filters, sort, pageSize])

  React.useEffect(() => {
    let active = true
    setLoading(true)
    listProjectKeywords({
      projectId,
      filters,
      sort,
      pagination: { page, pageSize },
    })
      .then((data) => {
        if (!active) return
        setRows(data.rows)
        setTotal(data.total)
        setError(null)
      })
      .catch((loadError) => {
        if (active) setError(getKeywordErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId, filters, sort, page, pageSize, refreshToken])

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      const result = await exportKeywordsCsv({
        projectId,
        mode: "filtered",
        filters,
      })
      downloadCsv(result.filename, result.csv)
    } catch (exportError) {
      setError(getKeywordErrorMessage(exportError))
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="w-full pb-8">
      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <DashboardTable
        title="Content Plan"
        icon={
          <CalendarClockIcon className="text-muted-foreground" />
        }
        count={total}
        controls={
          <>
            <DashboardToolbarSearch
              name="content-plan-search"
              aria-label="Search content plan"
              placeholder="Search keywords..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <DashboardToolbarSelectTrigger aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {PLAN_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {keywordStatusLabels[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={intentFilter} onValueChange={setIntentFilter}>
              <DashboardToolbarSelectTrigger aria-label="Filter by intent">
                <SelectValue placeholder="Intent" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Intents</SelectItem>
                {SEARCH_INTENTS.map((intent) => (
                  <SelectItem key={intent} value={intent}>
                    {searchIntentLabels[intent]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              disabled={exporting || total === 0}
              onClick={() => void handleExport()}
            >
              {exporting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <DownloadIcon className="size-4" />
              )}
              Export
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Keyword</TableHead>
              <TableHead column="meta">Intent</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                Suggested page type
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort.field === "opportunityScore"}
                  direction={sort.direction}
                  onClick={() =>
                    setSort((current) => ({
                      field: "opportunityScore",
                      direction:
                        current.field === "opportunityScore" &&
                        current.direction === "desc"
                          ? "asc"
                          : "desc",
                    }))
                  }
                >
                  Priority
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                Volume
              </TableHead>
              <TableHead column="meta">Status</TableHead>
              <TableHead column="meta" className="hidden xl:table-cell">
                Assigned URL
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!loading && rows.length === 0}
        emptyText="No saved keywords yet. Save keywords from research to build your plan."
        emptyColSpan={8}
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
          <TableRow key={row.id} className="group">
            <TableCell column="main">
              <button
                type="button"
                className="max-w-full truncate text-left text-xs font-medium group-hover:underline sm:text-sm"
                onClick={() => setDetailId(row.id)}
                title={row.keyword}
              >
                {row.keyword}
              </button>
              {row.notes ? (
                <div
                  className="max-w-md truncate text-xs text-muted-foreground"
                  title={row.notes}
                >
                  {row.notes}
                </div>
              ) : null}
            </TableCell>
            <TableCell column="meta">
              <IntentBadge intent={row.intent} />
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              {row.suggestedPageType
                ? (suggestedPageTypeLabels[row.suggestedPageType] ??
                  row.suggestedPageType)
                : "—"}
            </TableCell>
            <TableCell column="meta">
              <OpportunityScoreBadge score={row.opportunityScore} />
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {row.searchVolume != null
                ? numberFormatter.format(row.searchVolume)
                : "—"}
            </TableCell>
            <TableCell column="meta">
              <KeywordStatusBadge status={row.status} />
            </TableCell>
            <TableCell column="mutedMeta" className="hidden xl:table-cell">
              {row.assignedUrl ? (
                <span
                  className="inline-block max-w-56 truncate align-middle"
                  title={row.assignedUrl}
                >
                  {row.assignedUrl}
                </span>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell column="meta">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setDetailId(row.id)}
                title="Edit plan item"
                aria-label="Edit plan item"
              >
                <SettingsIcon className="size-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <KeywordDetailDialog
        projectId={projectId}
        projectKeywordId={detailId}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
        onUpdated={() => setRefreshToken((token) => token + 1)}
      />
    </div>
  )
}
