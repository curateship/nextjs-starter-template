import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChevronDownIcon,
  HistoryIcon,
  ListFilterIcon,
  ListIcon,
  Loader2Icon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/dashboard-toolbar"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useShellRuntime } from "@/components/shell-layout"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import {
  deleteBacktests,
  updateRunStatus,
  type BacktestListItem,
} from "@/lib/api/backtests"
import type {
  GroupCombinedCurve,
  GroupPortfolioMetrics,
} from "@/lib/backtest/types"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { cn } from "@/lib/utils"

import {
  pct,
  signedUsd,
  toneClass,
  truncateWords,
  usd,
  windowDaysOf,
} from "./backtest-format"
import { RunStatusMenuItems } from "./run-status-menu"

const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

/** Short calendar date (e.g. "Mar 23, 2025") for stat-card context lines. */
const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

/**
 * While `active` (a run is queued/running), refreshes the route loaders right
 * away and then on a snappy interval so the progress column and results update
 * live. Stops as soon as nothing is in progress.
 */
function useProgressPolling(active: boolean, intervalMs = 2000): void {
  const router = useRouter()
  React.useEffect(() => {
    if (!active) return
    let cancelled = false
    void router.invalidate()
    const id = setInterval(() => {
      if (!cancelled) void router.invalidate()
    }, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [active, router, intervalMs])
}

/** A slim bar + "finished/total" count for a run group's queue progress. */
function ProgressCell({
  finished,
  total,
  inProgress,
}: {
  finished: number
  total: number
  inProgress: boolean
}) {
  if (total === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  const widthPct = Math.round((finished / total) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            inProgress ? "bg-amber-500" : "bg-emerald-500"
          )}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span
        className={cn(
          "font-mono text-xs tabular-nums",
          inProgress ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {finished}/{total}
      </span>
    </div>
  )
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

/**
 * Shared client-side sort + pagination state (feedback-dashboard pattern);
 * filter/sort/size changes jump back to page 1 inside their handlers, keeping
 * the hooks lint's no-setState-in-effect rule happy.
 */
function useTableState<Column extends string>(defaultColumn: Column) {
  const { config } = useShellRuntime()
  const [search, setSearchState] = React.useState("")
  const [sortColumn, setSortColumn] = React.useState<Column>(defaultColumn)
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSizeState] = React.useState(config.dashboardRowsPerPage)

  const setSearch = (value: string) => {
    setSearchState(value)
    setPage(1)
  }

  const setPageSize = (value: number) => {
    setPageSizeState(value)
    setPage(1)
  }

  const toggleSort = (column: Column) => {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
    setPage(1)
  }

  return {
    search,
    setSearch,
    sortColumn,
    sortDirection,
    toggleSort,
    page,
    setPage,
    pageSize,
    setPageSize,
  }
}

function paginate<T>(rows: T[], page: number, pageSize: number) {
  const totalPages = Math.ceil(rows.length / pageSize)
  const start = (page - 1) * pageSize
  return { rows: rows.slice(start, start + pageSize), totalPages }
}

/** Set-based row selection with a header select-all over the visible page. */
function useSelection() {
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleVisible = (ids: string[], check: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (check) next.add(id)
        else next.delete(id)
      }
      return next
    })

  const clear = () => setSelected(new Set())

  const headerState = (ids: string[]): boolean | "indeterminate" => {
    if (ids.length === 0) return false
    const count = ids.filter((id) => selected.has(id)).length
    if (count === 0) return false
    return count === ids.length ? true : "indeterminate"
  }

  return { selected, toggle, toggleVisible, clear, headerState }
}

/** Destructive confirm dialog; deletes, then refreshes the route loader. */
function ConfirmDeleteDialog({
  open,
  onOpenChange,
  description,
  onDelete,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  description: string
  onDelete: () => Promise<void>
  onDone?: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await onDelete()
      onOpenChange(false)
      onDone?.()
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? null : onOpenChange(next))}>
      <DialogContent variant="admin" className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete backtests</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="px-6 pt-4">
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          </div>
        ) : null}
        <DialogFooter variant="plain" className="px-6 pt-6 pb-6">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Toolbar "Delete (n)" button wired to the confirm dialog. */
function DeleteSelectedButton({
  count,
  description,
  onDelete,
  onDone,
}: {
  count: number
  description: string
  onDelete: () => Promise<void>
  onDone: () => void
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <DashboardToolbarButton
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2Icon className="size-4" />
        Delete ({count})
      </DashboardToolbarButton>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        description={description}
        onDelete={onDelete}
        onDone={onDone}
      />
    </>
  )
}

function sortHead<Column extends string>(
  label: string,
  column: Column,
  state: { sortColumn: Column; sortDirection: TableSortDirection; toggleSort: (c: Column) => void }
) {
  return (
    <TableHead column="meta" key={column}>
      <TableSortButton
        active={state.sortColumn === column}
        direction={state.sortDirection}
        onClick={() => state.toggleSort(column)}
      >
        {label}
      </TableSortButton>
    </TableHead>
  )
}

// ---------------------------------------------------------------------------
// /backtest — one row per named run (group). Every run is an Automation run,
// so the old per-strategy-type level above this was removed.
// ---------------------------------------------------------------------------

type GroupRow = {
  groupId: string
  /** The main market's run id — the row the edit modal loads config from. */
  mainId: string
  name: string
  markets: string[]
  interval: string
  windowDays: number
  status: BacktestListItem["status"]
  reviewStatus: BacktestListItem["reviewStatus"]
  pinned: boolean
  /** Markets finished (done or errored) and total markets in the group. */
  finished: number
  total: number
  /** True while any market is still queued or running. */
  inProgress: boolean
  /** Main (first) market's stats, representative of the run. */
  netPnlPct: number | null
  startingEquity: number
  netPnl: number | null
  tradeCount: number | null
  /** Net % averaged to a 30-day month (pro-rata over the run window). */
  monthlyPnlPct: number | null
  /** Combined-basket peak-to-trough drawdown %, ≤ 0 (null until computed). */
  combinedDrawdownPct: number | null
  /** Worst the whole basket sat below its starting capital %, ≤ 0. */
  bucketLowPct: number | null
  lastRunAt: number
}

type GroupSort =
  | "name"
  | "markets"
  | "interval"
  | "window"
  | "status"
  | "starting"
  | "net"
  | "total"
  | "monthly"
  | "dd"
  | "bucket"
  | "trades"
  | "last"

/** Which triage buckets are shown; pinned runs also always surface at the top. */
type RunFilter = "review" | "pinned" | "archived"

const INTERVAL_ORDER = ["1m", "5m", "15m", "1h", "4h", "1d"]
const intervalRank = (interval: string) => {
  const index = INTERVAL_ORDER.indexOf(interval)
  return index === -1 ? INTERVAL_ORDER.length : index
}

/** Ascending comparison of two run groups by the given column. */
function compareGroups(a: GroupRow, b: GroupRow, column: GroupSort): number {
  const nullable = (value: number | null) => value ?? -Infinity
  switch (column) {
    case "name":
      return a.name.localeCompare(b.name)
    case "markets":
      return a.markets.length - b.markets.length
    case "interval":
      return intervalRank(a.interval) - intervalRank(b.interval)
    case "window":
      return a.windowDays - b.windowDays
    case "status":
      return a.reviewStatus.localeCompare(b.reviewStatus)
    case "starting":
      return a.startingEquity - b.startingEquity
    case "net":
      return nullable(a.netPnlPct) - nullable(b.netPnlPct)
    case "total":
      return nullable(a.netPnl) - nullable(b.netPnl)
    case "monthly":
      return nullable(a.monthlyPnlPct) - nullable(b.monthlyPnlPct)
    case "dd":
      return nullable(a.combinedDrawdownPct) - nullable(b.combinedDrawdownPct)
    case "bucket":
      return nullable(a.bucketLowPct) - nullable(b.bucketLowPct)
    case "trades":
      return nullable(a.tradeCount) - nullable(b.tradeCount)
    case "last":
      return a.lastRunAt - b.lastRunAt
  }
}

export function RunGroupsDashboard({
  runs,
  groupMetrics,
}: {
  runs: BacktestListItem[]
  groupMetrics: Record<string, GroupPortfolioMetrics>
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const state = useTableState<GroupSort>("last")
  const selection = useSelection()
  const [pendingDelete, setPendingDelete] = React.useState<GroupRow | null>(
    null
  )
  // Which triage buckets are visible; archived is hidden by default.
  const [filter, setFilter] = React.useState<Set<RunFilter>>(
    () => new Set<RunFilter>(["review", "pinned"])
  )

  const groups = React.useMemo<GroupRow[]>(() => {
    const byGroup = new Map<string, BacktestListItem[]>()
    for (const run of runs) {
      const list = byGroup.get(run.groupId)
      if (list) list.push(run)
      else byGroup.set(run.groupId, [run])
    }
    return [...byGroup.entries()].map(([groupId, groupRuns]) => {
      // The main market's row shares the group id; it drives the summary.
      const main = groupRuns.find((run) => run.id === groupId) ?? groupRuns[0]
      const windowDays = windowDaysOf(main)
      // P&L and drawdown are aggregated across every completed market, not read
      // off the main market alone — a basket's real return and risk are the
      // blend of all its markets, so a few winners can't hide the losers.
      const done = groupRuns.filter(
        (run) => run.status === "done" && run.netPnl !== null
      )
      // Equal-capital portfolio: sum dollar P&L over summed starting capital.
      const basketEquity = done.reduce(
        (sum, run) => sum + run.startingEquity,
        0
      )
      const netPnl =
        done.length > 0
          ? done.reduce((sum, run) => sum + (run.netPnl as number), 0)
          : null
      const netPnlPct =
        netPnl !== null && basketEquity > 0
          ? (netPnl / basketEquity) * 100
          : null
      const tradeCount =
        done.length > 0
          ? done.reduce((sum, run) => sum + (run.tradeCount ?? 0), 0)
          : null
      // Whole-basket risk from the combined equity curve (server-computed),
      // not an average of each market's own worst day.
      const metrics = groupMetrics[groupId]
      const finished = groupRuns.filter(
        (run) => run.status === "done" || run.status === "error"
      ).length
      const inProgress = finished < groupRuns.length
      return {
        groupId,
        mainId: main.id,
        name: main.name,
        markets: groupRuns.map((run) => run.market),
        interval: main.interval,
        windowDays,
        status: main.status,
        reviewStatus: main.reviewStatus,
        pinned: main.pinned,
        finished,
        total: groupRuns.length,
        inProgress,
        netPnlPct,
        startingEquity: done.length > 0 ? basketEquity : main.startingEquity,
        netPnl,
        tradeCount,
        monthlyPnlPct:
          netPnlPct === null ? null : (netPnlPct / windowDays) * 30,
        combinedDrawdownPct: metrics?.combinedDrawdownPct ?? null,
        bucketLowPct: metrics?.bucketLowPct ?? null,
        lastRunAt: Math.max(
          ...groupRuns.map((run) => Date.parse(run.createdAt))
        ),
      }
    })
  }, [runs, groupMetrics])

  // While any run is still queued/running, refresh the list live so the
  // progress column (and results) fill in as the queue works.
  const anyInProgress = React.useMemo(
    () => groups.some((group) => group.inProgress),
    [groups]
  )
  useProgressPolling(anyInProgress)

  const filtered = React.useMemo(() => {
    const query = state.search.trim().toLowerCase()
    const matches = groups.filter((group) => {
      const inBucket =
        (filter.has("review") && group.reviewStatus === "review") ||
        (filter.has("archived") && group.reviewStatus === "archived") ||
        (filter.has("pinned") && group.pinned)
      if (!inBucket) return false
      if (!query) return true
      return (
        group.name.toLowerCase().includes(query) ||
        group.markets.some((coin) => coin.toLowerCase().includes(query))
      )
    })
    const direction = state.sortDirection === "asc" ? 1 : -1
    return [...matches].sort((a, b) => {
      // Pinned runs always float to the top, regardless of the sort column.
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return compareGroups(a, b, state.sortColumn) * direction
    })
  }, [groups, filter, state.search, state.sortColumn, state.sortDirection])

  const { rows: pageRows, totalPages } = paginate(
    filtered,
    state.page,
    state.pageSize
  )
  const visibleIds = pageRows.map((group) => group.groupId)

  async function applyStatus(
    groupIds: string[],
    patch: { reviewStatus?: "review" | "archived"; pinned?: boolean }
  ) {
    if (groupIds.length === 0) return
    await updateRunStatus({ groupIds, ...patch })
    await router.invalidate()
  }

  async function applyToSelection(patch: {
    reviewStatus?: "review" | "archived"
    pinned?: boolean
  }) {
    await applyStatus([...selection.selected], patch)
    selection.clear()
  }

  const toggleFilter = (facet: RunFilter) =>
    setFilter((current) => {
      const next = new Set(current)
      if (next.has(facet)) next.delete(facet)
      else next.add(facet)
      return next
    })

  return (
    <div className="w-full">
      <DashboardTable
        title="Backtest"
        icon={<ListIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={filtered.length}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            <DashboardToolbarSearch
              name="run-search"
              aria-label="Search runs"
              placeholder="Search runs..."
              className="sm:mr-auto"
              value={state.search}
              onChange={(event) => state.setSearch(event.target.value)}
            />
            {selection.selected.size ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <DashboardToolbarButton type="button">
                      Status ({selection.selected.size})
                      <ChevronDownIcon className="size-4" />
                    </DashboardToolbarButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <RunStatusMenuItems
                      onApply={(patch) => void applyToSelection(patch)}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
                <DeleteSelectedButton
                  count={selection.selected.size}
                  description={`This permanently deletes ${selection.selected.size} ${selection.selected.size === 1 ? "run" : "runs"} including all re-run history.`}
                  onDelete={async () => {
                    await deleteBacktests({ groupIds: [...selection.selected] })
                  }}
                  onDone={selection.clear}
                />
              </>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <DashboardToolbarButton type="button" variant="outline">
                  <ListFilterIcon className="size-4" />
                  Filter
                </DashboardToolbarButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Show</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={filter.has("review")}
                  onCheckedChange={() => toggleFilter("review")}
                  onSelect={(event) => event.preventDefault()}
                >
                  Review
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filter.has("pinned")}
                  onCheckedChange={() => toggleFilter("pinned")}
                  onSelect={(event) => event.preventDefault()}
                >
                  Pinned
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filter.has("archived")}
                  onCheckedChange={() => toggleFilter("archived")}
                  onSelect={(event) => event.preventDefault()}
                >
                  Archived
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={selection.headerState(visibleIds)}
                  onCheckedChange={(checked) =>
                    selection.toggleVisible(visibleIds, checked === true)
                  }
                  aria-label="Select visible runs"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={state.sortColumn === "name"}
                  direction={state.sortDirection}
                  onClick={() => state.toggleSort("name")}
                >
                  Run
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Progress</TableHead>
              {sortHead("Markets", "markets", state)}
              {sortHead("Timeframe", "interval", state)}
              {sortHead("Window", "window", state)}
              {sortHead("Trades", "trades", state)}
              {sortHead("Monthly avg %", "monthly", state)}
              {sortHead("DD", "dd", state)}
              {sortHead("Bucket", "bucket", state)}
              {sortHead("Last run", "last", state)}
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={pageRows.length === 0}
        emptyText="No runs for this strategy yet — create one with New Run."
        emptyColSpan={15}
        footer={{
          type: "pagination",
          page: state.page,
          pageSize: state.pageSize,
          total: filtered.length,
          totalPages,
          pageSizeOptions,
          onPageChange: state.setPage,
          onPageSizeChange: state.setPageSize,
        }}
      >
        {pageRows.map((group) => (
          <TableRow
            key={group.groupId}
            className={cn(
              "cursor-pointer",
              group.pinned && "border-l-2 border-amber-500 bg-amber-500/5"
            )}
            onClick={() =>
              void navigate({
                to: "/backtest/$groupId",
                params: { groupId: group.groupId },
              })
            }
          >
            <TableCell column="select" onClick={(event) => event.stopPropagation()}>
              <Checkbox
                checked={selection.selected.has(group.groupId)}
                onCheckedChange={() => selection.toggle(group.groupId)}
                aria-label={`Select ${group.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <span
                className="inline-flex items-center gap-1.5 font-medium"
                title={group.name}
              >
                {group.pinned ? (
                  <PinIcon className="size-3.5 shrink-0 fill-amber-500 text-amber-500" />
                ) : null}
                {truncateWords(group.name, 10)}
              </span>
            </TableCell>
            <TableCell column="meta">
              <ProgressCell
                finished={group.finished}
                total={group.total}
                inProgress={group.inProgress}
              />
            </TableCell>
            <TableCell column="meta" className="text-xs">
              <span
                className="inline-flex items-center gap-1.5"
                title={group.markets.join(", ")}
              >
                <span className="font-mono">
                  {group.markets.slice(0, 3).join(", ")}
                </span>
                {group.markets.length > 3 ? (
                  <Badge variant="secondary" className="font-mono tabular-nums">
                    +{group.markets.length - 3}
                  </Badge>
                ) : null}
              </span>
            </TableCell>
            <TableCell column="meta" className="font-mono text-xs">
              {group.interval}
            </TableCell>
            <TableCell column="meta" className="font-mono text-xs tabular-nums">
              {group.windowDays}d
            </TableCell>
            <TableCell column="meta" className="font-mono tabular-nums">
              {group.tradeCount !== null
                ? group.tradeCount.toLocaleString()
                : "—"}
            </TableCell>
            <TableCell
              column="meta"
              className={cn(
                "font-mono tabular-nums",
                group.monthlyPnlPct !== null
                  ? toneClass(group.monthlyPnlPct)
                  : undefined
              )}
            >
              {group.status === "done" && group.monthlyPnlPct !== null
                ? pct(group.monthlyPnlPct)
                : "—"}
            </TableCell>
            <TableCell
              column="meta"
              className="font-mono tabular-nums text-red-500"
              title="Combined-basket peak-to-trough drawdown"
            >
              {group.status === "done" && group.combinedDrawdownPct !== null
                ? `${group.combinedDrawdownPct.toFixed(1)}%`
                : "—"}
            </TableCell>
            <TableCell
              column="meta"
              className={cn(
                "font-mono tabular-nums",
                group.bucketLowPct !== null && group.bucketLowPct < 0
                  ? "text-red-500"
                  : "text-muted-foreground"
              )}
              title="Worst the whole basket ever sat below its starting capital"
            >
              {group.status === "done" && group.bucketLowPct !== null
                ? group.bucketLowPct < 0
                  ? `${group.bucketLowPct.toFixed(1)}%`
                  : "0%"
                : "—"}
            </TableCell>
            <TableCell column="mutedMeta" className="font-mono text-xs tabular-nums">
              {dateTimeFormatter.format(group.lastRunAt)}
            </TableCell>
            <TableCell column="meta" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={group.pinned ? `Unpin ${group.name}` : `Pin ${group.name}`}
                  onClick={() =>
                    void applyStatus([group.groupId], { pinned: !group.pinned })
                  }
                >
                  {group.pinned ? (
                    <PinOffIcon className="size-4 text-muted-foreground" />
                  ) : (
                    <PinIcon className="size-4 text-muted-foreground" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Delete ${group.name}`}
                  onClick={() => setPendingDelete(group)}
                >
                  <Trash2Icon className="size-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null)
        }}
        description={
          pendingDelete
            ? `This permanently deletes "${pendingDelete.name}" including all ${pendingDelete.markets.length} market ${pendingDelete.markets.length === 1 ? "result" : "results"}.`
            : ""
        }
        onDelete={async () => {
          if (pendingDelete) {
            await deleteBacktests({ groupIds: [pendingDelete.groupId] })
          }
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// /backtest/$groupId — one result row per market of a run group.
// ---------------------------------------------------------------------------

type MarketSort = "market" | "net" | "dd" | "win" | "sharpe" | "trades"

/** Trading polarity pair, consistent with the price + equity charts. */
const CHART_UP = "#089981"
const CHART_DOWN = "#f23645"

export function RunHistoryDashboard({
  runs,
  groupId,
  groupMetrics,
  groupCurve,
}: {
  runs: BacktestListItem[]
  groupId: string
  groupMetrics: Record<string, GroupPortfolioMetrics>
  groupCurve: GroupCombinedCurve | null
}) {
  const navigate = useNavigate()
  const state = useTableState<MarketSort>("net")
  const selection = useSelection()

  const marketRuns = React.useMemo(
    () => runs.filter((run) => run.groupId === groupId),
    [runs, groupId]
  )

  const main =
    marketRuns.find((run) => run.id === groupId) ?? marketRuns[0] ?? null
  const runName = main?.name ?? "Run"

  // Refresh while markets are still queued/running so rows fill in live.
  const anyInProgress = React.useMemo(
    () =>
      marketRuns.some(
        (run) => run.status === "pending" || run.status === "running"
      ),
    [marketRuns]
  )
  useProgressPolling(anyInProgress)

  // Client-side filter (by market symbol) + sort, then paginate with the
  // shared table footer — the same table UI as every other dashboard.
  const filtered = React.useMemo(() => {
    const query = state.search.trim().toLowerCase()
    const direction = state.sortDirection === "asc" ? 1 : -1
    const num = (value: number | null) => value ?? -Infinity
    const matches = query
      ? marketRuns.filter((run) => run.market.toLowerCase().includes(query))
      : marketRuns
    return [...matches].sort((a, b) => {
      if (state.sortColumn === "market")
        return a.market.localeCompare(b.market) * direction
      if (state.sortColumn === "dd")
        return (num(a.maxDrawdownPct) - num(b.maxDrawdownPct)) * direction
      if (state.sortColumn === "win")
        return (num(a.winRate) - num(b.winRate)) * direction
      if (state.sortColumn === "sharpe")
        return (num(a.sharpe) - num(b.sharpe)) * direction
      if (state.sortColumn === "trades")
        return (num(a.tradeCount) - num(b.tradeCount)) * direction
      return (num(a.netPnlPct) - num(b.netPnlPct)) * direction
    })
  }, [marketRuns, state.search, state.sortColumn, state.sortDirection])

  const { rows: pageRows, totalPages } = paginate(
    filtered,
    state.page,
    state.pageSize
  )
  const visibleIds = pageRows.map((run) => run.id)
  const metrics = groupMetrics[groupId] ?? null

  // This run's headline stats, blended across its completed markets.
  const summary = React.useMemo(() => {
    const done = marketRuns.filter((run) => run.status === "done")
    const equity = done.reduce((sum, run) => sum + run.startingEquity, 0)
    const pnl = done.reduce((sum, run) => sum + (run.netPnl ?? 0), 0)
    return {
      markets: marketRuns.length,
      startEquity: done.length ? equity : null,
      netPnl: done.length ? pnl : null,
      netPnlPct: equity > 0 ? (pnl / equity) * 100 : null,
      trades: done.reduce((sum, run) => sum + (run.tradeCount ?? 0), 0),
    }
  }, [marketRuns])

  const summaryRows: {
    label: string
    value: string
    sub?: string
    tone?: number | null
  }[] = [
    { label: "Markets", value: String(summary.markets) },
    { label: "Trades", value: summary.trades.toLocaleString() },
    {
      label: "Combined DD",
      value: metrics ? `${metrics.combinedDrawdownPct.toFixed(1)}%` : "—",
      tone: metrics ? metrics.combinedDrawdownPct : null,
      sub:
        metrics && metrics.drawdownAt !== null
          ? shortDateFormatter.format(metrics.drawdownAt)
          : undefined,
    },
    {
      label: "Bucket low",
      value: metrics
        ? metrics.bucketLowPct < 0
          ? `${metrics.bucketLowPct.toFixed(1)}%`
          : "never"
        : "—",
      tone: metrics ? metrics.bucketLowPct : null,
      sub:
        metrics && metrics.bucketLowPct < 0 && metrics.bucketLowAt !== null
          ? shortDateFormatter.format(metrics.bucketLowAt)
          : undefined,
    },
  ]

  // Combined equity curve for the P&L chart (points already downsampled server-
  // side). Green when it ended above where it started, red otherwise.
  const chartData = groupCurve?.points ?? []
  const positiveCurve =
    chartData.length > 1
      ? chartData[chartData.length - 1].eq >= chartData[0].eq
      : true
  const rangeLabel =
    chartData.length > 1
      ? `${shortDateFormatter.format(chartData[0].t)} – ${shortDateFormatter.format(chartData[chartData.length - 1].t)}`
      : null

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 items-start gap-2 md:gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* LEFT — per-market results table (standard dashboard table). */}
        <DashboardTable
          title={
            <Breadcrumbs
              crumbs={[
                { label: "Backtest", to: "/backtest" },
                { label: truncateWords(runName, 10) },
              ]}
            />
          }
          icon={<HistoryIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
          count={marketRuns.length}
          selectedCount={selection.selected.size}
          onClearSelection={selection.clear}
          controls={
            <>
              <DashboardToolbarSearch
                name="market-search"
                aria-label="Filter markets"
                placeholder="Filter markets..."
                className="sm:mr-auto"
                value={state.search}
                onChange={(event) => state.setSearch(event.target.value)}
              />
              {selection.selected.size ? (
                <DeleteSelectedButton
                  count={selection.selected.size}
                  description={`This permanently deletes ${selection.selected.size} market ${selection.selected.size === 1 ? "result" : "results"} from this run.`}
                  onDelete={async () => {
                    await deleteBacktests({ ids: [...selection.selected] })
                  }}
                  onDone={selection.clear}
                />
              ) : null}
            </>
          }
          header={
            <TableHeader>
              <TableRow>
                <TableHead column="select">
                  <Checkbox
                    checked={selection.headerState(visibleIds)}
                    onCheckedChange={(checked) =>
                      selection.toggleVisible(visibleIds, checked === true)
                    }
                    aria-label="Select visible markets"
                  />
                </TableHead>
                {sortHead("Market", "market", state)}
                {sortHead("Net P&L", "net", state)}
                {sortHead("Max DD", "dd", state)}
                {sortHead("Win rate", "win", state)}
                {sortHead("Sharpe", "sharpe", state)}
                {sortHead("Trades", "trades", state)}
              </TableRow>
            </TableHeader>
          }
          isEmpty={pageRows.length === 0}
          emptyText="No market results in this run."
          emptyColSpan={7}
          footer={{
            type: "pagination",
            page: state.page,
            pageSize: state.pageSize,
            total: filtered.length,
            totalPages,
            pageSizeOptions,
            onPageChange: state.setPage,
            onPageSizeChange: state.setPageSize,
          }}
        >
          {pageRows.map((run) => (
            <TableRow
              key={run.id}
              className="cursor-pointer"
              onClick={() =>
                void navigate({ to: "/backtest", search: { run: run.id } })
              }
            >
              <TableCell column="select" onClick={(event) => event.stopPropagation()}>
                <Checkbox
                  checked={selection.selected.has(run.id)}
                  onCheckedChange={() => selection.toggle(run.id)}
                  aria-label={`Select ${run.market}`}
                />
              </TableCell>
              {/* Coin symbols are short — skip main's 320px floor. */}
              <TableCell column="main" className="min-w-0">
                <span className="font-medium">{run.market}</span>
              </TableCell>
              <TableCell
                column="meta"
                className={cn(
                  "font-mono tabular-nums",
                  run.netPnl !== null ? toneClass(run.netPnl) : undefined
                )}
              >
                {run.status === "done" && run.netPnl !== null
                  ? `${signedUsd(run.netPnl)}${run.netPnlPct !== null ? ` (${pct(run.netPnlPct)})` : ""}`
                  : "—"}
              </TableCell>
              <TableCell column="meta" className="font-mono tabular-nums text-red-500">
                {run.maxDrawdownPct !== null
                  ? `-${run.maxDrawdownPct.toFixed(2)}%`
                  : "—"}
              </TableCell>
              <TableCell column="meta" className="font-mono tabular-nums">
                {run.winRate !== null ? `${(run.winRate * 100).toFixed(1)}%` : "—"}
              </TableCell>
              <TableCell
                column="meta"
                className={cn(
                  "font-mono tabular-nums",
                  run.sharpe !== null ? toneClass(run.sharpe) : "text-muted-foreground"
                )}
              >
                {run.sharpe !== null ? run.sharpe.toFixed(2) : "—"}
              </TableCell>
              <TableCell column="meta" className="font-mono tabular-nums">
                {run.tradeCount ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </DashboardTable>

        {/* RIGHT — combined summary + P&L curve. */}
        <div className="flex flex-col gap-2 md:gap-3">
          <Card className="gap-4 py-5">
            <CardHeader className="px-5">
              <CardTitle className="text-sm font-semibold">Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-5">
              <div className="flex items-end justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Total P&L</span>
                  <span
                    className={cn(
                      "font-mono text-3xl leading-none font-semibold tabular-nums",
                      summary.netPnl != null ? toneClass(summary.netPnl) : "text-foreground"
                    )}
                  >
                    {summary.netPnl !== null ? signedUsd(summary.netPnl) : "—"}
                  </span>
                  {summary.startEquity !== null ? (
                    <span className="text-[11px] text-muted-foreground">
                      from {usd(summary.startEquity)}
                    </span>
                  ) : null}
                </div>
                {summary.netPnlPct !== null ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-mono text-sm font-semibold tabular-nums",
                      summary.netPnlPct >= 0
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-red-500/10 text-red-500"
                    )}
                  >
                    {summary.netPnlPct >= 0 ? "▲" : "▼"} {pct(summary.netPnlPct)}
                  </span>
                ) : null}
              </div>
              <div className="h-px bg-border" />
              <div className="flex flex-col">
                {summaryRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-baseline justify-between gap-3 py-1.5"
                  >
                    <span className="text-sm text-muted-foreground">
                      {row.label}
                    </span>
                    <div className="flex items-baseline gap-2">
                      {row.sub ? (
                        <span className="text-[11px] text-muted-foreground/70">
                          {row.sub}
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "font-mono text-sm tabular-nums",
                          row.tone != null ? toneClass(row.tone) : "text-foreground"
                        )}
                      >
                        {row.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="gap-2 py-5">
            <CardHeader className="px-5">
              <div className="flex items-baseline justify-between gap-2">
                <CardTitle className="text-sm font-semibold">P&L curve</CardTitle>
                {rangeLabel ? (
                  <span className="text-[11px] text-muted-foreground">
                    {rangeLabel}
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="px-5">
              {chartData.length < 2 ? (
                <div className="flex h-[184px] items-center justify-center rounded-lg border bg-muted/30 text-xs text-muted-foreground">
                  Not enough data to plot the P&L curve
                </div>
              ) : (
                <ChartContainer
                  config={{ eq: { label: "Equity" } }}
                  className="h-[184px] w-full"
                >
                  <AreaChart
                    data={chartData}
                    margin={{ left: 8, right: 8, top: 8, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient
                        id="group-pnl-fill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={positiveCurve ? CHART_UP : CHART_DOWN}
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="100%"
                          stopColor={positiveCurve ? CHART_UP : CHART_DOWN}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeOpacity={0.3} />
                    <XAxis
                      dataKey="t"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={40}
                      tickFormatter={(value: number) =>
                        new Date(value).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      }
                    />
                    <YAxis
                      width={54}
                      tickLine={false}
                      axisLine={false}
                      domain={["auto", "auto"]}
                      tickFormatter={(value: number) =>
                        `$${Math.round(value).toLocaleString()}`
                      }
                    />
                    {groupCurve ? (
                      <ReferenceLine
                        y={groupCurve.startEquity}
                        strokeDasharray="5 4"
                        stroke="currentColor"
                        strokeOpacity={0.4}
                      />
                    ) : null}
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(_, payload) =>
                            payload?.[0]
                              ? new Date(
                                  payload[0].payload.t as number
                                ).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : ""
                          }
                        />
                      }
                    />
                    <Area
                      dataKey="eq"
                      type="monotone"
                      stroke={positiveCurve ? CHART_UP : CHART_DOWN}
                      strokeWidth={2}
                      fill="url(#group-pnl-fill)"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
