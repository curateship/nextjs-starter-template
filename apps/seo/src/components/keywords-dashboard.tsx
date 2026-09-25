import * as React from "react"
import {
  BookmarkIcon,
  CalendarClockIcon,
  DownloadIcon,
  EyeOffIcon,
  GlobeIcon,
  LineChartIcon,
  Loader2Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
  dashboardToolbarClearButtonClassName,
  dashboardToolbarFilterChipClassName,
} from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import {
  cancelKeywordJob,
  createDomainKeywordJob,
  createMetricsRefreshJob,
  createSeedKeywordJob,
  exportKeywordsCsv,
  getKeywordDetail,
  getKeywordErrorMessage,
  listKeywordJobs,
  listProjectKeywords,
  retryKeywordJob,
  updateKeywordPlan,
  updateKeywordStatus,
  type KeywordFilters,
  type KeywordJobItem,
  type KeywordSort,
  type ProjectKeywordDetail,
  type ProjectKeywordRow,
} from "@/lib/api/keywords"
import {
  getRankingErrorMessage,
  setKeywordTracking,
} from "@/lib/api/rankings"
import type { ProjectItem } from "@/lib/api/seo-projects"
import {
  KEYWORD_SOURCES,
  KEYWORD_STATUSES,
  SEARCH_INTENTS,
  keywordSourceLabels,
  keywordStatusLabels,
  searchIntentLabels,
  suggestedPageTypeLabels,
  type KeywordStatus,
  type SearchIntent,
} from "@/lib/keyword-research"

const numberFormatter = new Intl.NumberFormat("en-US")

export type AdvancedFilters = {
  minVolume: string
  maxDifficulty: string
  minCpc: string
  maxCpc: string
  competitionLevel: string
  includeWords: string
  excludeWords: string
  questionOnly: boolean
  localOnly: boolean
}

const emptyAdvancedFilters: AdvancedFilters = {
  minVolume: "",
  maxDifficulty: "",
  minCpc: "",
  maxCpc: "",
  competitionLevel: "all",
  includeWords: "",
  excludeWords: "",
  questionOnly: false,
  localOnly: false,
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function KeywordsDashboard({
  project,
  initialSource,
}: {
  project: ProjectItem
  initialSource?: string
}) {
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
  const [intentFilter, setIntentFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [sourceFilter, setSourceFilter] = React.useState(initialSource ?? "all")
  const [advanced, setAdvanced] =
    React.useState<AdvancedFilters>(emptyAdvancedFilters)
  const [sort, setSort] = React.useState<KeywordSort>({
    field: "opportunityScore",
    direction: "desc",
  })

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [jobs, setJobs] = React.useState<KeywordJobItem[]>([])
  const [seedOpen, setSeedOpen] = React.useState(false)
  const [domainOpen, setDomainOpen] = React.useState(false)
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [actionBusy, setActionBusy] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timeout)
  }, [searchQuery])

  const filters = React.useMemo<KeywordFilters>(() => {
    const result: KeywordFilters = {}
    if (debouncedQuery.trim()) result.q = debouncedQuery.trim()
    if (intentFilter !== "all") result.intent = [intentFilter as SearchIntent]
    if (statusFilter !== "all") result.status = [statusFilter as KeywordStatus]
    if (sourceFilter !== "all") result.source = [sourceFilter]
    if (advanced.minVolume) result.minVolume = Number(advanced.minVolume)
    if (advanced.maxDifficulty)
      result.maxDifficulty = Number(advanced.maxDifficulty)
    if (advanced.minCpc) result.minCpc = Number(advanced.minCpc)
    if (advanced.maxCpc) result.maxCpc = Number(advanced.maxCpc)
    if (advanced.competitionLevel !== "all")
      result.competitionLevel = [advanced.competitionLevel]
    const includeWords = advanced.includeWords
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean)
    if (includeWords.length) result.includeWords = includeWords
    const excludeWords = advanced.excludeWords
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean)
    if (excludeWords.length) result.excludeWords = excludeWords
    if (advanced.questionOnly) result.questionOnly = true
    if (advanced.localOnly) result.localOnly = true
    return result
  }, [debouncedQuery, intentFilter, statusFilter, sourceFilter, advanced])

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
        if (!active) return
        setError(getKeywordErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId, filters, sort, page, pageSize, refreshToken])

  const hasActiveJob = jobs.some(
    (job) => job.status === "pending" || job.status === "running"
  )

  React.useEffect(() => {
    let active = true
    const refresh = () => {
      listKeywordJobs(projectId)
        .then((data) => {
          if (!active) return
          setJobs((previous) => {
            const previousActive = new Set(
              previous
                .filter(
                  (job) => job.status === "pending" || job.status === "running"
                )
                .map((job) => job.id)
            )
            const finishedNow = data.jobs.some(
              (job) => previousActive.has(job.id) && job.status === "completed"
            )
            if (finishedNow) setRefreshToken((token) => token + 1)
            return data.jobs
          })
        })
        .catch(() => {})
    }
    refresh()
    const interval = setInterval(refresh, 3000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [projectId])

  const latestJob = jobs[0] ?? null
  const status = !latestJob
    ? null
    : latestJob.status === "running" || latestJob.status === "pending"
      ? {
          tone: "success" as const,
          text: `${latestJob.currentStep ?? "Queued"} (${latestJob.progress}%)`,
        }
      : latestJob.status === "failed"
        ? {
            tone: "error" as const,
            text: latestJob.errorMessage
              ? `Job failed: ${latestJob.errorMessage.slice(0, 80)}`
              : "Job failed",
          }
        : null

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const visibleIds = rows.map((row) => row.id)
  const visibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const visiblePartiallySelected =
    !visibleSelected && visibleIds.some((id) => selectedIds.has(id))

  const chipDefinitions: Array<{
    active: boolean
    label: string
    reset: Partial<AdvancedFilters>
  }> = [
    { active: Boolean(advanced.minVolume), label: `Volume ≥ ${advanced.minVolume}`, reset: { minVolume: "" } },
    { active: Boolean(advanced.maxDifficulty), label: `KD ≤ ${advanced.maxDifficulty}`, reset: { maxDifficulty: "" } },
    { active: Boolean(advanced.minCpc), label: `CPC ≥ $${advanced.minCpc}`, reset: { minCpc: "" } },
    { active: Boolean(advanced.maxCpc), label: `CPC ≤ $${advanced.maxCpc}`, reset: { maxCpc: "" } },
    { active: advanced.competitionLevel !== "all", label: `Competition: ${advanced.competitionLevel}`, reset: { competitionLevel: "all" } },
    { active: Boolean(advanced.includeWords.trim()), label: `Includes: ${advanced.includeWords}`, reset: { includeWords: "" } },
    { active: Boolean(advanced.excludeWords.trim()), label: `Excludes: ${advanced.excludeWords}`, reset: { excludeWords: "" } },
    { active: advanced.questionOnly, label: "Questions", reset: { questionOnly: false } },
    { active: advanced.localOnly, label: "Local", reset: { localOnly: false } },
  ]
  const activeChips = chipDefinitions
    .filter((chip) => chip.active)
    .map((chip) => ({
      label: chip.label,
      clear: () => setAdvanced((f) => ({ ...f, ...chip.reset })),
    }))

  function toggleSort(field: KeywordSort["field"]) {
    setSort((current) =>
      current.field === field
        ? {
            field,
            direction: current.direction === "desc" ? "asc" : "desc",
          }
        : { field, direction: field === "keywordDifficulty" ? "asc" : "desc" }
    )
  }

  async function applyStatus(ids: string[], nextStatus: KeywordStatus) {
    if (!ids.length) return
    setActionBusy(true)
    setError(null)
    try {
      await updateKeywordStatus(projectId, ids, nextStatus)
      setSelectedIds(new Set())
      setRefreshToken((token) => token + 1)
    } catch (actionError) {
      setError(getKeywordErrorMessage(actionError))
    } finally {
      setActionBusy(false)
    }
  }

  async function applyTracking(ids: string[], tracked: boolean) {
    if (!ids.length) return
    setActionBusy(true)
    setError(null)
    try {
      await setKeywordTracking(projectId, ids, tracked)
      setSelectedIds(new Set())
      setRefreshToken((token) => token + 1)
    } catch (trackError) {
      setError(getRankingErrorMessage(trackError))
    } finally {
      setActionBusy(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      const result = await exportKeywordsCsv(
        selectedIds.size
          ? {
              projectId,
              mode: "selected",
              selectedIds: [...selectedIds],
            }
          : { projectId, mode: "filtered", filters }
      )
      downloadCsv(result.filename, result.csv)
    } catch (exportError) {
      setError(getKeywordErrorMessage(exportError))
    } finally {
      setExporting(false)
    }
  }

  async function handleRefreshMetrics() {
    setActionBusy(true)
    setError(null)
    try {
      const { job } = await createMetricsRefreshJob(projectId)
      setJobs((current) => [job, ...current])
    } catch (refreshError) {
      setError(getKeywordErrorMessage(refreshError))
    } finally {
      setActionBusy(false)
    }
  }

  async function handleRetry(jobId: string) {
    try {
      await retryKeywordJob(jobId)
      const data = await listKeywordJobs(projectId)
      setJobs(data.jobs)
    } catch (retryError) {
      setError(getKeywordErrorMessage(retryError))
    }
  }

  async function handleCancel(jobId: string) {
    try {
      await cancelKeywordJob(jobId)
      const data = await listKeywordJobs(projectId)
      setJobs(data.jobs)
    } catch (cancelError) {
      setError(getKeywordErrorMessage(cancelError))
    }
  }

  return (
    <div className="w-full pb-8">
      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <DashboardTable
        title="Keywords"
        icon={<SearchIcon className="text-muted-foreground" />}
        count={total}
        status={status}
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        controls={
          <>
            {selectedIds.size ? (
              <>
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  disabled={actionBusy}
                  onClick={() => void applyStatus([...selectedIds], "saved")}
                >
                  <BookmarkIcon className="size-4" />
                  Save ({selectedIds.size})
                </DashboardToolbarButton>
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  disabled={actionBusy}
                  onClick={() => void applyStatus([...selectedIds], "planned")}
                >
                  <CalendarClockIcon className="size-4" />
                  Plan
                </DashboardToolbarButton>
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  disabled={actionBusy}
                  onClick={() => void applyStatus([...selectedIds], "ignored")}
                >
                  <EyeOffIcon className="size-4" />
                  Ignore
                </DashboardToolbarButton>
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  disabled={actionBusy}
                  onClick={() => void applyTracking([...selectedIds], true)}
                >
                  <LineChartIcon className="size-4" />
                  Track
                </DashboardToolbarButton>
              </>
            ) : null}
            {latestJob?.status === "failed" ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                onClick={() => void handleRetry(latestJob.id)}
              >
                <RotateCcwIcon className="size-4" />
                Retry Job
              </DashboardToolbarButton>
            ) : null}
            {hasActiveJob && latestJob ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                onClick={() => void handleCancel(latestJob.id)}
              >
                <XIcon className="size-4" />
                Cancel Job
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="keyword-search"
              aria-label="Search keywords"
              placeholder="Search keywords..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <DashboardToolbarSelectTrigger aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Active</SelectItem>
                {KEYWORD_STATUSES.map((keywordStatus) => (
                  <SelectItem key={keywordStatus} value={keywordStatus}>
                    {keywordStatusLabels[keywordStatus]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <DashboardToolbarSelectTrigger aria-label="Filter by source">
                <SelectValue placeholder="Source" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {KEYWORD_SOURCES.map((source) => (
                  <SelectItem key={source} value={source}>
                    {keywordSourceLabels[source]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontalIcon className="size-4" />
              Filters
            </DashboardToolbarButton>
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
            <DashboardToolbarButton
              type="button"
              onClick={() => setSeedOpen(true)}
            >
              <SearchIcon className="size-4" />
              Seed Research
            </DashboardToolbarButton>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              onClick={() => setDomainOpen(true)}
            >
              <GlobeIcon className="size-4" />
              Domain Research
            </DashboardToolbarButton>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              disabled={actionBusy || hasActiveJob || total === 0}
              onClick={() => void handleRefreshMetrics()}
              title="Re-fetch stale metrics and rescore keywords"
            >
              <RefreshCwIcon className="size-4" />
              Refresh Metrics
            </DashboardToolbarButton>
          </>
        }
        header={
          <>
            {activeChips.length ? (
              <TableHeader>
                <TableRow>
                  <TableHead colSpan={11} className="h-auto py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {activeChips.map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          className={dashboardToolbarFilterChipClassName}
                          onClick={chip.clear}
                          title="Remove filter"
                        >
                          {chip.label}
                          <XIcon className="size-3" />
                        </button>
                      ))}
                      <button
                        type="button"
                        className={dashboardToolbarClearButtonClassName}
                        onClick={() => setAdvanced(emptyAdvancedFilters)}
                      >
                        Clear all
                      </button>
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
            ) : null}
            <TableHeader>
              <TableRow>
                <TableHead column="select">
                  <Checkbox
                    checked={
                      visibleSelected
                        ? true
                        : visiblePartiallySelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={() =>
                      setSelectedIds((current) => {
                        const next = new Set(current)
                        if (visibleSelected) {
                          visibleIds.forEach((id) => next.delete(id))
                        } else {
                          visibleIds.forEach((id) => next.add(id))
                        }
                        return next
                      })
                    }
                    aria-label="Select visible keywords"
                  />
                </TableHead>
                <TableHead column="main">Keyword</TableHead>
                <TableHead column="meta">Intent</TableHead>
                <TableHead column="meta">
                  <TableSortButton
                    active={sort.field === "searchVolume"}
                    direction={sort.direction}
                    onClick={() => toggleSort("searchVolume")}
                  >
                    Volume
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden lg:table-cell">
                  <TableSortButton
                    active={sort.field === "trendScore"}
                    direction={sort.direction}
                    onClick={() => toggleSort("trendScore")}
                  >
                    Trend
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton
                    active={sort.field === "cpc"}
                    direction={sort.direction}
                    onClick={() => toggleSort("cpc")}
                  >
                    CPC
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden md:table-cell">
                  Competition
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton
                    active={sort.field === "keywordDifficulty"}
                    direction={sort.direction}
                    onClick={() => toggleSort("keywordDifficulty")}
                  >
                    KD
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta">
                  <TableSortButton
                    active={sort.field === "opportunityScore"}
                    direction={sort.direction}
                    onClick={() => toggleSort("opportunityScore")}
                  >
                    Opportunity
                  </TableSortButton>
                </TableHead>
                <TableHead column="meta" className="hidden xl:table-cell">
                  Source
                </TableHead>
                <TableHead column="meta">Status</TableHead>
                <TableHead column="meta">Actions</TableHead>
              </TableRow>
            </TableHeader>
          </>
        }
        isEmpty={!loading && rows.length === 0}
        emptyText={
          hasActiveJob
            ? "Research is running. Results will appear here shortly."
            : total === 0 && !activeChips.length && !debouncedQuery
              ? "No keywords yet. Run seed or domain research to find ideas."
              : "No keyword ideas found. Try a broader seed keyword or fewer filters."
        }
        emptyColSpan={12}
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
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(row.id)}
                onCheckedChange={() =>
                  setSelectedIds((current) => {
                    const next = new Set(current)
                    if (next.has(row.id)) next.delete(row.id)
                    else next.add(row.id)
                    return next
                  })
                }
                aria-label={`Select ${row.keyword}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="max-w-full truncate text-left text-xs font-medium group-hover:underline sm:text-sm"
                onClick={() => setDetailId(row.id)}
                title={row.keyword}
              >
                {row.keyword}
              </button>
            </TableCell>
            <TableCell column="meta">
              <IntentBadge intent={row.intent} />
            </TableCell>
            <TableCell column="mutedMeta">
              {row.searchVolume != null
                ? numberFormatter.format(row.searchVolume)
                : "—"}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              <TrendIndicator trendScore={row.trendScore} />
            </TableCell>
            <TableCell column="mutedMeta">
              {row.cpc != null ? `$${row.cpc.toFixed(2)}` : "—"}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              {row.competitionLevel ?? "—"}
            </TableCell>
            <TableCell column="mutedMeta">
              {row.keywordDifficulty ?? "—"}
            </TableCell>
            <TableCell column="meta">
              <OpportunityScoreBadge score={row.opportunityScore} />
            </TableCell>
            <TableCell column="mutedMeta" className="hidden xl:table-cell">
              {keywordSourceLabels[
                row.source as keyof typeof keywordSourceLabels
              ] ?? row.source}
            </TableCell>
            <TableCell column="meta">
              <KeywordStatusBadge status={row.status} />
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={actionBusy}
                  onClick={() =>
                    void applyStatus(
                      [row.id],
                      row.status === "saved" ? "new" : "saved"
                    )
                  }
                  title={row.status === "saved" ? "Unsave" : "Save"}
                  aria-label={row.status === "saved" ? "Unsave" : "Save"}
                >
                  <BookmarkIcon
                    className={
                      row.status === "saved"
                        ? "size-4 fill-current"
                        : "size-4"
                    }
                  />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={actionBusy || row.status === "ignored"}
                  onClick={() => void applyStatus([row.id], "ignored")}
                  title="Ignore"
                  aria-label="Ignore"
                >
                  <EyeOffIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={actionBusy}
                  onClick={() =>
                    void applyTracking([row.id], row.trackedAt == null)
                  }
                  title={
                    row.trackedAt ? "Untrack ranking" : "Track ranking"
                  }
                  aria-label={
                    row.trackedAt ? "Untrack ranking" : "Track ranking"
                  }
                >
                  <LineChartIcon
                    className={
                      row.trackedAt
                        ? "size-4 text-primary"
                        : "size-4 text-muted-foreground"
                    }
                  />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <SeedResearchDialog
        projectId={projectId}
        open={seedOpen}
        onOpenChange={setSeedOpen}
        onStarted={(job) => setJobs((current) => [job, ...current])}
      />
      <DomainResearchDialog
        project={project}
        open={domainOpen}
        onOpenChange={setDomainOpen}
        onStarted={(job) => setJobs((current) => [job, ...current])}
      />
      <KeywordFiltersDialog
        open={filtersOpen}
        filters={advanced}
        onOpenChange={setFiltersOpen}
        onApply={setAdvanced}
      />
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

export function IntentBadge({ intent }: { intent: SearchIntent }) {
  const classNames: Record<SearchIntent, string> = {
    transactional:
      "border-green-200 bg-green-100 text-green-900 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-200",
    commercial:
      "border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-200",
    informational: "",
    navigational:
      "border-yellow-200 bg-yellow-100 text-yellow-900 dark:border-yellow-900/50 dark:bg-yellow-950/50 dark:text-yellow-200",
    unknown: "",
  }
  return (
    <Badge
      variant={intent === "unknown" ? "outline" : "secondary"}
      className={classNames[intent]}
    >
      {searchIntentLabels[intent]}
    </Badge>
  )
}

export function KeywordStatusBadge({ status }: { status: KeywordStatus }) {
  const variants: Record<
    KeywordStatus,
    React.ComponentProps<typeof Badge>["variant"]
  > = {
    new: "outline",
    saved: "default",
    ignored: "secondary",
    planned: "secondary",
    published: "secondary",
  }
  const classNames: Record<KeywordStatus, string> = {
    new: "",
    saved: "",
    ignored: "opacity-60",
    planned:
      "border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-200",
    published:
      "border-green-200 bg-green-100 text-green-900 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-200",
  }
  return (
    <Badge variant={variants[status]} className={classNames[status]}>
      {keywordStatusLabels[status]}
    </Badge>
  )
}

export function OpportunityScoreBadge({ score }: { score: number | null }) {
  if (score == null) {
    return <Badge variant="outline">—</Badge>
  }
  const className =
    score >= 70
      ? "border-green-200 bg-green-100 text-green-900 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-200"
      : score >= 40
        ? "border-yellow-200 bg-yellow-100 text-yellow-900 dark:border-yellow-900/50 dark:bg-yellow-950/50 dark:text-yellow-200"
        : ""
  return (
    <Badge variant="secondary" className={className}>
      {score}
    </Badge>
  )
}

function TrendIndicator({ trendScore }: { trendScore: number | null }) {
  if (trendScore == null) return <>—</>
  const label = trendScore >= 55 ? "↑" : trendScore <= 45 ? "↓" : "→"
  return (
    <span title={`Trend score ${trendScore}`}>
      {label} {trendScore}
    </span>
  )
}

function SeedResearchDialog({
  projectId,
  open,
  onOpenChange,
  onStarted,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onStarted: (job: KeywordJobItem) => void
}) {
  const [seeds, setSeeds] = React.useState("")
  const [limit, setLimit] = React.useState("300")
  const [includeRelated, setIncludeRelated] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) setError(null)
  }, [open])

  async function start() {
    const seedKeywords = seeds
      .split(/[\n,]/)
      .map((seed) => seed.trim())
      .filter(Boolean)
    if (!seedKeywords.length) {
      setError("Enter at least one seed keyword.")
      return
    }
    if (seedKeywords.length > 20) {
      setError("Reduce the keyword list to 20 seeds and try again.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { job } = await createSeedKeywordJob({
        projectId,
        seedKeywords,
        limit: Number(limit) || undefined,
        includeRelated,
      })
      onStarted(job)
      setSeeds("")
      onOpenChange(false)
    } catch (startError) {
      setError(getKeywordErrorMessage(startError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Seed Keyword Research</DialogTitle>
          <DialogDescription>
            Enter up to 20 seed keywords. One per line or comma separated.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="seed-keywords">Seed keywords</Label>
            <Textarea
              id="seed-keywords"
              value={seeds}
              disabled={busy}
              placeholder={"plumber toronto\nemergency plumbing"}
              className="min-h-28"
              onChange={(event) => setSeeds(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="seed-limit">Result limit</Label>
              <Select value={limit} onValueChange={setLimit} disabled={busy}>
                <SelectTrigger id="seed-limit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["100", "300", "500", "1000"].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value} keywords
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-2">
              <Checkbox
                id="seed-related"
                checked={includeRelated}
                disabled={busy}
                onCheckedChange={(checked) =>
                  setIncludeRelated(checked === true)
                }
              />
              <Label htmlFor="seed-related">Include related keywords</Label>
            </div>
          </div>
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void start()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {busy ? "Starting..." : "Start Research"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DomainResearchDialog({
  project,
  open,
  onOpenChange,
  onStarted,
}: {
  project: ProjectItem
  open: boolean
  onOpenChange: (open: boolean) => void
  onStarted: (job: KeywordJobItem) => void
}) {
  const [domain, setDomain] = React.useState("")
  const [limit, setLimit] = React.useState("300")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setDomain(project.domain ?? "")
      setError(null)
    }
  }, [open, project.domain])

  async function start() {
    if (!domain.trim()) {
      setError("Enter a domain to research.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { job } = await createDomainKeywordJob({
        projectId: project.id,
        domain: domain.trim(),
        limit: Number(limit) || undefined,
      })
      onStarted(job)
      onOpenChange(false)
    } catch (startError) {
      setError(getKeywordErrorMessage(startError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Domain Keyword Research</DialogTitle>
          <DialogDescription>
            Find keywords a domain ranks for. Use your own site or a
            competitor.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="research-domain">Domain</Label>
            <Input
              id="research-domain"
              value={domain}
              disabled={busy}
              placeholder="example.com"
              onChange={(event) => setDomain(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="domain-limit">Result limit</Label>
            <Select value={limit} onValueChange={setLimit} disabled={busy}>
              <SelectTrigger id="domain-limit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["100", "300", "500", "1000"].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value} keywords
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">
              {error}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void start()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {busy ? "Starting..." : "Start Research"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function KeywordFiltersDialog({
  open,
  filters,
  onOpenChange,
  onApply,
}: {
  open: boolean
  filters: AdvancedFilters
  onOpenChange: (open: boolean) => void
  onApply: (filters: AdvancedFilters) => void
}) {
  const [draft, setDraft] = React.useState<AdvancedFilters>(filters)

  React.useEffect(() => {
    if (open) setDraft(filters)
  }, [open, filters])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Keyword Filters</DialogTitle>
          <DialogDescription>
            Combine filters to narrow the keyword list.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="filter-min-volume">Minimum volume</Label>
            <Input
              id="filter-min-volume"
              type="number"
              min={0}
              value={draft.minVolume}
              onChange={(event) =>
                setDraft({ ...draft, minVolume: event.target.value })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="filter-max-difficulty">Maximum difficulty</Label>
            <Input
              id="filter-max-difficulty"
              type="number"
              min={0}
              max={100}
              value={draft.maxDifficulty}
              onChange={(event) =>
                setDraft({ ...draft, maxDifficulty: event.target.value })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="filter-min-cpc">Minimum CPC ($)</Label>
            <Input
              id="filter-min-cpc"
              type="number"
              min={0}
              step="0.1"
              value={draft.minCpc}
              onChange={(event) =>
                setDraft({ ...draft, minCpc: event.target.value })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="filter-max-cpc">Maximum CPC ($)</Label>
            <Input
              id="filter-max-cpc"
              type="number"
              min={0}
              step="0.1"
              value={draft.maxCpc}
              onChange={(event) =>
                setDraft({ ...draft, maxCpc: event.target.value })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="filter-competition">Competition level</Label>
            <Select
              value={draft.competitionLevel}
              onValueChange={(value) =>
                setDraft({ ...draft, competitionLevel: value })
              }
            >
              <SelectTrigger id="filter-competition" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="filter-include">Includes words</Label>
            <Input
              id="filter-include"
              placeholder="word1, word2"
              value={draft.includeWords}
              onChange={(event) =>
                setDraft({ ...draft, includeWords: event.target.value })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="filter-exclude">Excludes words</Label>
            <Input
              id="filter-exclude"
              placeholder="word1, word2"
              value={draft.excludeWords}
              onChange={(event) =>
                setDraft({ ...draft, excludeWords: event.target.value })
              }
            />
          </div>
          <div className="flex items-center gap-6 pt-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="filter-question"
                checked={draft.questionOnly}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, questionOnly: checked === true })
                }
              />
              <Label htmlFor="filter-question">Questions only</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="filter-local"
                checked={draft.localOnly}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, localOnly: checked === true })
                }
              />
              <Label htmlFor="filter-local">Local only</Label>
            </div>
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft(emptyAdvancedFilters)}
            >
              Reset
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                onApply(draft)
                onOpenChange(false)
              }}
            >
              Apply Filters
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function KeywordDetailDialog({
  projectId,
  projectKeywordId,
  onOpenChange,
  onUpdated,
}: {
  projectId: string
  projectKeywordId: string | null
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}) {
  const [detail, setDetail] = React.useState<ProjectKeywordDetail | null>(null)
  const [notes, setNotes] = React.useState("")
  const [assignedUrl, setAssignedUrl] = React.useState("")
  const [status, setStatus] = React.useState<KeywordStatus>("new")
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!projectKeywordId) {
      setDetail(null)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    getKeywordDetail(projectId, projectKeywordId)
      .then(({ detail: data }) => {
        if (!active) return
        setDetail(data)
        setNotes(data.notes ?? "")
        setAssignedUrl(data.assignedUrl ?? "")
        setStatus(data.status)
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
  }, [projectId, projectKeywordId])

  async function save() {
    if (!projectKeywordId) return
    setSaving(true)
    setError(null)
    try {
      await updateKeywordPlan({
        projectId,
        projectKeywordId,
        notes,
        assignedUrl,
        status,
      })
      onUpdated()
      onOpenChange(false)
    } catch (saveError) {
      setError(getKeywordErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const gap = detail?.sourceDetails as
    | {
        competitorDomain?: string
        competitorUrl?: string | null
        competitorRank?: number | null
        ourRank?: number | null
        suggestedAction?: string
      }
    | null
    | undefined

  return (
    <Dialog open={Boolean(projectKeywordId)} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{detail?.keyword ?? "Keyword detail"}</DialogTitle>
          <DialogDescription>
            Metrics, opportunity score, and content planning for this keyword.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading keyword detail...
            </div>
          ) : null}
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          {detail ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <MetricTile
                  label="Opportunity"
                  value={
                    <OpportunityScoreBadge score={detail.opportunityScore} />
                  }
                />
                <MetricTile
                  label="Search volume"
                  value={
                    detail.searchVolume != null
                      ? numberFormatter.format(detail.searchVolume)
                      : "—"
                  }
                />
                <MetricTile
                  label="Keyword difficulty"
                  value={detail.keywordDifficulty ?? "—"}
                />
                <MetricTile
                  label="CPC"
                  value={
                    detail.cpc != null ? `$${detail.cpc.toFixed(2)}` : "—"
                  }
                />
                <MetricTile
                  label="Competition"
                  value={detail.competitionLevel ?? "—"}
                />
                <MetricTile
                  label="Intent"
                  value={<IntentBadge intent={detail.intent} />}
                />
              </div>

              {detail.scoreExplanation?.reasons?.length ? (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    Why this score
                  </div>
                  <ul className="list-inside list-disc text-sm">
                    {detail.scoreExplanation.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {detail.monthlySearches?.length ? (
                <MonthlySearchTrendChart
                  monthlySearches={detail.monthlySearches}
                />
              ) : null}

              {detail.serpFeatures?.length ? (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    SERP features
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.serpFeatures.map((feature) => (
                      <Badge key={feature} variant="outline">
                        {feature.replaceAll("_", " ")}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {gap?.competitorDomain ? (
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    Competitor gap
                  </div>
                  <div>
                    {gap.competitorDomain} ranks #{gap.competitorRank ?? "?"}
                    {gap.ourRank != null
                      ? `, you rank #${gap.ourRank}`
                      : ", you have no ranking"}
                  </div>
                  {gap.competitorUrl ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {gap.competitorUrl}
                    </div>
                  ) : null}
                  {gap.suggestedAction ? (
                    <div className="mt-1">
                      Suggested action:{" "}
                      <span className="font-medium">{gap.suggestedAction}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  Content recommendation
                </div>
                {detail.suggestedPageType
                  ? (suggestedPageTypeLabels[detail.suggestedPageType] ??
                    detail.suggestedPageType)
                  : "Run enrichment to get a recommendation."}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="detail-status">Status</Label>
                  <Select
                    value={status}
                    disabled={saving}
                    onValueChange={(value) =>
                      setStatus(value as KeywordStatus)
                    }
                  >
                    <SelectTrigger id="detail-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KEYWORD_STATUSES.map((keywordStatus) => (
                        <SelectItem key={keywordStatus} value={keywordStatus}>
                          {keywordStatusLabels[keywordStatus]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="detail-url">Assigned URL</Label>
                  <Input
                    id="detail-url"
                    placeholder="https://example.com/target-page"
                    value={assignedUrl}
                    disabled={saving}
                    onChange={(event) => setAssignedUrl(event.target.value)}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="detail-notes">Notes</Label>
                  <Textarea
                    id="detail-notes"
                    value={notes}
                    disabled={saving}
                    className="min-h-20"
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
              </div>
            </>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !detail}
              onClick={() => void save()}
            >
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MetricTile({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}

function MonthlySearchTrendChart({
  monthlySearches,
}: {
  monthlySearches: Array<{ year: number; month: number; search_volume: number }>
}) {
  const sorted = [...monthlySearches].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  )
  const max = Math.max(1, ...sorted.map((entry) => entry.search_volume || 0))
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        Monthly searches
      </div>
      <div className="flex h-20 items-end gap-1">
        {sorted.map((entry) => (
          <div
            key={`${entry.year}-${entry.month}`}
            className="flex-1 rounded-t-sm bg-primary/60"
            style={{
              height: `${Math.max(3, ((entry.search_volume || 0) / max) * 100)}%`,
            }}
            title={`${entry.year}-${String(entry.month).padStart(2, "0")}: ${numberFormatter.format(entry.search_volume || 0)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>
          {sorted[0]
            ? `${sorted[0].year}-${String(sorted[0].month).padStart(2, "0")}`
            : ""}
        </span>
        <span>
          {sorted.at(-1)
            ? `${sorted.at(-1)!.year}-${String(sorted.at(-1)!.month).padStart(2, "0")}`
            : ""}
        </span>
      </div>
    </div>
  )
}
