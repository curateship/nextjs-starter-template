import * as React from "react"
import {
  LineChartIcon,
  Loader2Icon,
  MinusIcon,
  RadarIcon,
  RotateCcwIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  XIcon,
} from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import { DashboardTable } from "@/components/dashboard-table"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import {
  cancelKeywordJob,
  getKeywordErrorMessage,
  listKeywordJobs,
  retryKeywordJob,
  type KeywordJobItem,
} from "@/lib/api/keywords"
import {
  createRankCheckJob,
  getRankingErrorMessage,
  getRankingHistory,
  getRankingTrend,
  listRankings,
  setKeywordTracking,
  type RankingHistoryEntry,
  type RankingRow,
  type RankingSortField,
  type RankingTrendPoint,
} from "@/lib/api/rankings"
import type { ProjectItem } from "@/lib/api/seo-projects"

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

export function RankingsDashboard({ project }: { project: ProjectItem }) {
  const projectId = project.id
  const [rows, setRows] = React.useState<RankingRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshToken, setRefreshToken] = React.useState(0)

  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(25)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [debouncedQuery, setDebouncedQuery] = React.useState("")
  const [sort, setSort] = React.useState<{
    field: RankingSortField
    direction: "asc" | "desc"
  }>({ field: "position", direction: "asc" })

  const [jobs, setJobs] = React.useState<KeywordJobItem[]>([])
  const [historyId, setHistoryId] = React.useState<string | null>(null)
  const [actionBusy, setActionBusy] = React.useState(false)

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timeout)
  }, [searchQuery])

  React.useEffect(() => {
    setPage(1)
  }, [debouncedQuery, sort, pageSize])

  React.useEffect(() => {
    let active = true
    setLoading(true)
    listRankings({
      projectId,
      q: debouncedQuery.trim() || undefined,
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
        if (active) setError(getRankingErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId, debouncedQuery, sort, page, pageSize, refreshToken])

  React.useEffect(() => {
    let active = true
    const refresh = () => {
      listKeywordJobs(projectId)
        .then((data) => {
          if (!active) return
          const rankJobs = data.jobs.filter((job) => job.type === "rank_check")
          setJobs((previous) => {
            const previousActive = new Set(
              previous
                .filter(
                  (job) => job.status === "pending" || job.status === "running"
                )
                .map((job) => job.id)
            )
            const finishedNow = rankJobs.some(
              (job) => previousActive.has(job.id) && job.status === "completed"
            )
            if (finishedNow) setRefreshToken((token) => token + 1)
            return rankJobs
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
  const hasActiveJob =
    latestJob?.status === "pending" || latestJob?.status === "running"
  const status = !latestJob
    ? null
    : hasActiveJob
      ? {
          tone: "success" as const,
          text: `${latestJob.currentStep ?? "Queued"} (${latestJob.progress}%)`,
        }
      : latestJob.status === "failed"
        ? {
            tone: "error" as const,
            text: latestJob.errorMessage
              ? `Check failed: ${latestJob.errorMessage.slice(0, 80)}`
              : "Check failed",
          }
        : null

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function toggleSort(field: RankingSortField) {
    setSort((current) =>
      current.field === field
        ? {
            field,
            direction: current.direction === "asc" ? "desc" : "asc",
          }
        : { field, direction: field === "position" ? "asc" : "desc" }
    )
  }

  async function startCheck() {
    setActionBusy(true)
    setError(null)
    try {
      const { job } = await createRankCheckJob(projectId)
      setJobs((current) => [job, ...current])
    } catch (startError) {
      setError(getRankingErrorMessage(startError))
    } finally {
      setActionBusy(false)
    }
  }

  async function untrack(projectKeywordId: string) {
    setActionBusy(true)
    setError(null)
    try {
      await setKeywordTracking(projectId, [projectKeywordId], false)
      setRefreshToken((token) => token + 1)
    } catch (untrackError) {
      setError(getRankingErrorMessage(untrackError))
    } finally {
      setActionBusy(false)
    }
  }

  async function handleRetry(jobId: string) {
    try {
      await retryKeywordJob(jobId)
      const data = await listKeywordJobs(projectId)
      setJobs(data.jobs.filter((job) => job.type === "rank_check"))
    } catch (retryError) {
      setError(getKeywordErrorMessage(retryError))
    }
  }

  async function handleCancel(jobId: string) {
    try {
      await cancelKeywordJob(jobId)
      const data = await listKeywordJobs(projectId)
      setJobs(data.jobs.filter((job) => job.type === "rank_check"))
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

      <RankingTrendChart projectId={projectId} refreshToken={refreshToken} />

      <DashboardTable
        title="Rankings"
        icon={<RadarIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={total}
        status={status}
        controls={
          <>
            {latestJob?.status === "failed" ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                onClick={() => void handleRetry(latestJob.id)}
              >
                <RotateCcwIcon className="size-4" />
                Retry Check
              </DashboardToolbarButton>
            ) : null}
            {hasActiveJob && latestJob ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                onClick={() => void handleCancel(latestJob.id)}
              >
                <XIcon className="size-4" />
                Cancel Check
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="rankings-search"
              aria-label="Search tracked keywords"
              placeholder="Search keywords..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <DashboardToolbarButton
              type="button"
              disabled={actionBusy || hasActiveJob || total === 0}
              onClick={() => void startCheck()}
            >
              {actionBusy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RadarIcon className="size-4" />
              )}
              Check Rankings
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">
                <TableSortButton
                  active={sort.field === "keyword"}
                  direction={sort.direction}
                  onClick={() => toggleSort("keyword")}
                >
                  Keyword
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort.field === "position"}
                  direction={sort.direction}
                  onClick={() => toggleSort("position")}
                >
                  Position
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort.field === "change"}
                  direction={sort.direction}
                  onClick={() => toggleSort("change")}
                >
                  Change
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                Best
              </TableHead>
              <TableHead column="meta" className="hidden xl:table-cell">
                Ranking URL
              </TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                <TableSortButton
                  active={sort.field === "lastChecked"}
                  direction={sort.direction}
                  onClick={() => toggleSort("lastChecked")}
                >
                  Last checked
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!loading && rows.length === 0}
        emptyText="No tracked keywords. Track keywords from the Keywords tab to monitor their Google positions."
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
          <TableRow key={row.projectKeywordId} className="group">
            <TableCell column="main">
              <button
                type="button"
                className="max-w-full truncate text-left text-xs font-medium group-hover:underline sm:text-sm"
                onClick={() => setHistoryId(row.projectKeywordId)}
                title={row.keyword}
              >
                {row.keyword}
              </button>
            </TableCell>
            <TableCell column="meta">
              <PositionBadge position={row.position} checked={row.lastCheckedAt != null} />
            </TableCell>
            <TableCell column="meta">
              <ChangeIndicator change={row.change} />
            </TableCell>
            <TableCell column="mutedMeta" className="hidden md:table-cell">
              {row.bestPosition ?? "—"}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden xl:table-cell">
              {row.rankingUrl ? (
                <span
                  className="inline-block max-w-64 truncate align-middle"
                  title={row.rankingUrl}
                >
                  {row.rankingUrl}
                </span>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {row.lastCheckedAt
                ? dateTimeFormatter.format(new Date(row.lastCheckedAt))
                : "Never"}
            </TableCell>
            <TableCell column="meta">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setHistoryId(row.projectKeywordId)}
                  title="Ranking history"
                  aria-label="Ranking history"
                >
                  <LineChartIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={actionBusy}
                  onClick={() => void untrack(row.projectKeywordId)}
                  title="Stop tracking"
                  aria-label="Stop tracking"
                >
                  <XIcon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <RankingHistoryDialog
        projectId={projectId}
        projectKeywordId={historyId}
        onOpenChange={(open) => {
          if (!open) setHistoryId(null)
        }}
      />
    </div>
  )
}

const trendChartConfig = {
  visibility: { label: "Visibility", color: "var(--chart-2)" },
  avgPosition: { label: "Avg position", color: "var(--chart-4)" },
} satisfies ChartConfig

const trendDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
})

function formatTrendDate(date: string) {
  return trendDateFormatter.format(new Date(`${date}T00:00:00Z`))
}

function RankingTrendChart({
  projectId,
  refreshToken,
}: {
  projectId: string
  refreshToken: number
}) {
  const [points, setPoints] = React.useState<RankingTrendPoint[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let active = true
    getRankingTrend(projectId, 30)
      .then((data) => {
        if (active) setPoints(data.points)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId, refreshToken])

  if (loading && !points.length) return null

  return (
    <div className="mb-4 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
      <div className="mb-3 flex items-center gap-2">
        <LineChartIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium sm:text-base">
          Visibility trend
        </span>
        <span className="text-xs text-muted-foreground">Last 30 days</span>
      </div>
      {points.length < 2 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Run rank checks on at least two different days to see the visibility
          trend.
        </p>
      ) : (
        <ChartContainer
          config={trendChartConfig}
          className="aspect-auto h-56 w-full"
        >
          <LineChart
            data={points}
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tickFormatter={formatTrendDate}
            />
            <YAxis
              yAxisId="visibility"
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              width={34}
            />
            <YAxis
              yAxisId="position"
              orientation="right"
              reversed
              domain={[1, "auto"]}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={34}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload as
                    | RankingTrendPoint
                    | undefined
                  if (!point) return null
                  return `${formatTrendDate(point.date)} · top 3: ${point.top3} · top 10: ${point.top10} · top 100: ${point.top100}`
                }} />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              yAxisId="visibility"
              dataKey="visibility"
              type="monotone"
              stroke="var(--color-visibility)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="position"
              dataKey="avgPosition"
              type="monotone"
              stroke="var(--color-avgPosition)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              connectNulls
            />
          </LineChart>
        </ChartContainer>
      )}
    </div>
  )
}

function PositionBadge({
  position,
  checked,
}: {
  position: number | null
  checked: boolean
}) {
  if (!checked) {
    return <Badge variant="outline">Not checked</Badge>
  }
  if (position == null) {
    return <Badge variant="secondary">Not in top 100</Badge>
  }
  const className =
    position <= 3
      ? "border-green-200 bg-green-100 text-green-900 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-200"
      : position <= 10
        ? "border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-200"
        : ""
  return (
    <Badge variant="secondary" className={className}>
      #{position}
    </Badge>
  )
}

function ChangeIndicator({ change }: { change: number | null }) {
  if (change == null) {
    return <span className="text-muted-foreground">—</span>
  }
  if (change === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <MinusIcon className="size-3.5" />0
      </span>
    )
  }
  return change > 0 ? (
    <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300">
      <TrendingUpIcon className="size-3.5" />+{change}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-destructive">
      <TrendingDownIcon className="size-3.5" />
      {change}
    </span>
  )
}

const historyChartConfig = {
  position: { label: "Position", color: "var(--chart-2)" },
} satisfies ChartConfig

function HistoryLineChart({ history }: { history: RankingHistoryEntry[] }) {
  const data = history.map((entry) => ({
    label: dateTimeFormatter.format(new Date(entry.checkedAt)),
    position: entry.position,
  }))
  const hasPositions = data.some((entry) => entry.position != null)

  if (!hasPositions) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Not in the top 100 on any check yet.
      </p>
    )
  }

  return (
    <ChartContainer
      config={historyChartConfig}
      className="aspect-auto h-40 w-full"
    >
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          minTickGap={32}
        />
        <YAxis
          reversed
          domain={[1, "auto"]}
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={30}
        />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Line
          dataKey="position"
          type="monotone"
          stroke="var(--color-position)"
          strokeWidth={2}
          dot={{ r: 2.5 }}
          connectNulls={false}
        />
      </LineChart>
    </ChartContainer>
  )
}

function RankingHistoryDialog({
  projectId,
  projectKeywordId,
  onOpenChange,
}: {
  projectId: string
  projectKeywordId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const [keyword, setKeyword] = React.useState("")
  const [history, setHistory] = React.useState<RankingHistoryEntry[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!projectKeywordId) {
      setHistory([])
      setKeyword("")
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    getRankingHistory(projectId, projectKeywordId)
      .then((data) => {
        if (!active) return
        setKeyword(data.keyword)
        setHistory(data.history)
      })
      .catch((loadError) => {
        if (active) setError(getRankingErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId, projectKeywordId])

  const latest = history.at(-1) ?? null

  return (
    <Dialog open={Boolean(projectKeywordId)} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{keyword || "Ranking history"}</DialogTitle>
          <DialogDescription>
            Google organic position over time. Lower is better.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading history...
            </div>
          ) : null}
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          {!loading && !history.length && !error ? (
            <p className="text-sm text-muted-foreground">
              No checks yet. Run "Check Rankings" to record the first position.
            </p>
          ) : null}

          {history.length ? (
            <>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  Position history
                </div>
                <HistoryLineChart history={history} />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  Checks
                </div>
                <ul className="space-y-1 text-sm">
                  {[...history]
                    .reverse()
                    .slice(0, 10)
                    .map((entry) => (
                      <li
                        key={entry.checkedAt}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-muted-foreground">
                          {dateTimeFormatter.format(new Date(entry.checkedAt))}
                        </span>
                        <span className="font-medium">
                          {entry.position != null
                            ? `#${entry.position}`
                            : "Not in top 100"}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>

              {latest?.topResults?.length ? (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    Top results at last check
                  </div>
                  <ul className="space-y-1 text-sm">
                    {latest.topResults.map((result) => (
                      <li
                        key={`${result.position}-${result.url}`}
                        className="flex items-center gap-2"
                      >
                        <Badge variant="secondary">#{result.position}</Badge>
                        <span className="truncate" title={result.url ?? ""}>
                          {result.domain ?? result.url}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
