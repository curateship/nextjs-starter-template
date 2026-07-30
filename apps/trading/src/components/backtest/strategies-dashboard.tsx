import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  HistoryIcon,
  ListFilterIcon,
  ListIcon,
  Loader2Icon,
  PinIcon,
  PlayIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardTable } from "@/components/dashboard-table"
import { IconButton } from "@/components/icon-button"
import { PanelToggle } from "@/components/panel-toggles"
import { togglePanel } from "@/lib/panel-collapse"
import {
  BOTTOM_COLLAPSED_HEIGHT,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { BacktestRunChart } from "./backtest-run-chart"
import { PnlCurveCard } from "./pnl-curve-card"
import { PracticeSetupDialog } from "./practice-setup-dialog"
import { StrategyTester } from "./strategy-tester"
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
  loadBacktest,
  pollBacktestProgress,
  updateRunStatus,
  type BacktestDetail,
  type BacktestListItem,
} from "@/lib/api/backtests"
import type {
  BacktestTrade,
  GroupCombinedCurve,
  GroupPortfolioMetrics,
} from "@/lib/backtest/types"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { usePanelLayout } from "@/lib/use-panel-layout"
import { cn } from "@/lib/utils"

import {
  signedPct,
  signedUsd,
  toneClass,
  truncateWords,
  usd,
  windowDaysOf,
} from "@/lib/format"
import {
  BacktestMarketsTable,
  sortHead,
  sortMarketRows,
  type MarketSort,
} from "./backtest-markets-table"
import { RunStatusMenuItems } from "./run-status-menu"

const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

/** Short calendar date (e.g. "Mar 23, 2025") for stat-card context lines. */
/** Month + day only — keeps the narrow group-summary rows readable. */
const compactDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
})

/**
 * Persist a resizable layout in localStorage, matching the automation editor:
 * the saved layout captures panel widths AND which panels are collapsed (a
 * collapsed panel has size 0). Read after mount (never during render — that
 * would mismatch hydration); `layoutKey` remounts the group once the saved
 * layout loads so it applies cleanly, and the `loaded` guard avoids saving the
 * pre-load default over it.
 */
/** Keeps only changing run fields live; the full route refreshes once at completion. */
function useLiveBacktestRuns(
  initial: BacktestListItem[],
  intervalMs = 2000
): BacktestListItem[] {
  const router = useRouter()
  const [runs, setRuns] = React.useState(initial)
  const [previousInitial, setPreviousInitial] = React.useState(initial)
  if (previousInitial !== initial) {
    setPreviousInitial(initial)
    setRuns(initial)
  }

  const activeIds = runs
    .filter((run) => run.status === "pending" || run.status === "running")
    .map((run) => run.id)
  const activeKey = activeIds.join(",")

  React.useEffect(() => {
    if (!activeKey) return
    let cancelled = false
    let running = false
    let completionInvalidated = false
    const ids = activeKey.split(",")

    async function refresh() {
      if (cancelled || running || document.visibilityState !== "visible") {
        return
      }
      running = true
      try {
        // `pollBacktestProgress` splits the basket into request-sized batches.
        const updates = await pollBacktestProgress(ids)
        if (cancelled) return
        const byId = new Map(updates.map((update) => [update.id, update]))
        setRuns((current) =>
          current.map((run) => {
            const update = byId.get(run.id)
            return update ? { ...run, ...update } : run
          })
        )
        const stillActive = updates.some(
          (run) => run.status === "pending" || run.status === "running"
        )
        if (!stillActive && !completionInvalidated) {
          completionInvalidated = true
          await router.invalidate()
        }
      } catch {
        // Keep the current progress and retry on the next visible tick.
      } finally {
        running = false
      }
    }

    void refresh()
    const id = setInterval(() => void refresh(), intervalMs)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [activeKey, router, intervalMs])

  return runs
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
  const [pageSize, setPageSizeState] = React.useState(
    config.dashboardRowsPerPage
  )

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
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? null : onOpenChange(next))}
    >
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
  runs: initialRuns,
  groupMetrics,
}: {
  runs: BacktestListItem[]
  groupMetrics: Record<string, GroupPortfolioMetrics>
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const runs = useLiveBacktestRuns(initialRuns)
  const state = useTableState<GroupSort>("last")
  const selection = useSelection()
  const [pendingDelete, setPendingDelete] = React.useState<GroupRow | null>(
    null
  )
  const [practiceOpen, setPracticeOpen] = React.useState(false)
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
      // Whole-basket risk AND capital base from the combined equity curve
      // (server-computed), not an average of each market's own worst day.
      const metrics = groupMetrics[groupId]
      // The basket's capital base is the pot: the starting balance, ONCE,
      // however many markets ran. The server's blend reports it as
      // `startEquity`; before that loads, one market's own starting balance is
      // the same number. Summing them would count the one pot once per market
      // and make the return read ~N× too small.
      const basketEquity = metrics?.startEquity ?? done[0]?.startingEquity ?? 0
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
        icon={
          <ListIcon className="text-muted-foreground" />
        }
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
            <Button type="button" onClick={() => setPracticeOpen(true)}>
              <PlayIcon className="size-4" />
              Practice
            </Button>
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
            <TableCell
              column="select"
              onClick={(event) => event.stopPropagation()}
            >
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
                ? signedPct(group.monthlyPnlPct)
                : "—"}
            </TableCell>
            <TableCell
              column="meta"
              className="font-mono text-red-500 tabular-nums"
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
            <TableCell
              column="mutedMeta"
              className="font-mono text-xs tabular-nums"
            >
              {dateTimeFormatter.format(group.lastRunAt)}
            </TableCell>
            <TableCell
              column="meta"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={
                    group.pinned ? `Unpin ${group.name}` : `Pin ${group.name}`
                  }
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
      <PracticeSetupDialog open={practiceOpen} onOpenChange={setPracticeOpen} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// /backtest/$groupId — one result row per market of a run group.
// ---------------------------------------------------------------------------

export function RunHistoryDashboard({
  runs: initialRuns,
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
  const runs = useLiveBacktestRuns(initialRuns)
  const state = useTableState<MarketSort>("net")
  const selection = useSelection()

  const marketRuns = React.useMemo(
    () => runs.filter((run) => run.groupId === groupId),
    [runs, groupId]
  )

  const main =
    marketRuns.find((run) => run.id === groupId) ?? marketRuns[0] ?? null
  const runName = main?.name ?? "Run"

  // Client-side filter (by market symbol) + sort with the shared comparator —
  // the same table the editor's backtest mode renders.
  const filtered = React.useMemo(
    () =>
      sortMarketRows(
        marketRuns,
        state.sortColumn,
        state.sortDirection,
        state.search
      ),
    [marketRuns, state.search, state.sortColumn, state.sortDirection]
  )

  const metrics = groupMetrics[groupId] ?? null

  // This run's headline stats, blended across its completed markets.
  const summary = React.useMemo(() => {
    const done = marketRuns.filter((run) => run.status === "done")
    // The pot — the starting balance once, never once per market. See the
    // group-list summary above for the full rationale.
    const equity = metrics?.startEquity ?? done[0]?.startingEquity ?? 0
    const pnl = done.reduce((sum, run) => sum + (run.netPnl ?? 0), 0)
    return {
      markets: marketRuns.length,
      startEquity: done.length ? equity : null,
      netPnl: done.length ? pnl : null,
      netPnlPct: equity > 0 ? (pnl / equity) * 100 : null,
      trades: done.reduce((sum, run) => sum + (run.tradeCount ?? 0), 0),
    }
  }, [marketRuns, metrics])

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
          ? compactDateFormatter.format(metrics.drawdownAt)
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
          ? compactDateFormatter.format(metrics.bucketLowAt)
          : undefined,
    },
  ]

  // Combined equity curve for the P&L chart, already downsampled server-side.
  const chartData = groupCurve?.points ?? []

  // The market whose chart + trades fill the workspace, defaulting to the
  // group's main market (else the first finished one). Clicking a market row
  // loads it in place — the same flow as the single-result dashboard.
  const doneMarkets = marketRuns.filter((run) => run.status === "done")
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null)
  const resolvedRunId =
    selectedRunId && doneMarkets.some((run) => run.id === selectedRunId)
      ? selectedRunId
      : (doneMarkets.find((run) => run.id === groupId)?.id ??
        doneMarkets[0]?.id ??
        null)
  const [detail, setDetail] = React.useState<{
    id: string
    run: BacktestDetail | null
  }>({ id: "", run: null })
  const [runLastClose, setRunLastClose] = React.useState<number | null>(null)
  const [focusedTrade, setFocusedTrade] = React.useState<BacktestTrade | null>(
    null
  )

  React.useEffect(() => {
    if (!resolvedRunId) return
    let cancelled = false
    setFocusedTrade(null)
    void loadBacktest(resolvedRunId)
      .then((response) => {
        if (!cancelled && response.backtest) {
          setDetail({ id: resolvedRunId, run: response.backtest })
        }
      })
      .catch(() => {
        // Transient — the row stays selectable and a re-click retries.
      })
    return () => {
      cancelled = true
    }
  }, [resolvedRunId])

  const loadedRun = detail.id === resolvedRunId ? detail.run : null
  const loadedResult =
    loadedRun && loadedRun.status === "done" ? loadedRun.result : null

  // Collapsible side + bottom panels, the same pattern as the automation
  // editor: each collapses to zero via its ref, and the layout (widths +
  // collapsed state) is remembered per browser.
  const summaryPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const marketsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const tradesPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const [summaryCollapsed, setSummaryCollapsed] = React.useState(false)
  const [marketsCollapsed, setMarketsCollapsed] = React.useState(false)
  const [tradesCollapsed, setTradesCollapsed] = React.useState(false)
  const horizontalLayout = usePanelLayout("group-workspace-horizontal")
  const verticalLayout = usePanelLayout("group-workspace-vertical")

  // Toggles live in the bottom panel's tab bar — see the three-panel workspace
  // standard in `.agents/skills/Ui-standards`. That panel collapses to exactly
  // this row, so the buttons that reopen the panels never disappear.
  const panelToggles = (
    <div className="flex shrink-0 items-center gap-1">
      <PanelToggle
        side="left"
        collapsed={summaryCollapsed}
        label={summaryCollapsed ? "Show summary panel" : "Hide summary panel"}
        onClick={() => togglePanel(summaryPanelRef, "21%")}
      />
      <PanelToggle
        side="right"
        collapsed={marketsCollapsed}
        label={marketsCollapsed ? "Show markets panel" : "Hide markets panel"}
        onClick={() => togglePanel(marketsPanelRef, "28%")}
      />
      <PanelToggle
        side="bottom"
        collapsed={tradesCollapsed}
        label={tradesCollapsed ? "Show trades panel" : "Hide trades panel"}
        onClick={() => togglePanel(tradesPanelRef, "32%")}
      />
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-var(--header-height,3.5rem))] min-h-0 flex-col bg-muted/60 dark:bg-background">
      <div className="flex items-center gap-3 border-b bg-card px-4 py-2">
        <IconButton
          label="Back to backtests"
          onClick={() => void navigate({ to: "/backtest" })}
        >
          <ArrowLeftIcon className="size-4" />
        </IconButton>
        <Breadcrumbs
          crumbs={[
            { label: "Backtest", to: "/backtest" },
            { label: truncateWords(runName, 12) },
          ]}
        />
        <div className="flex-1" />
      </div>

      <div className="min-h-0 flex-1 p-[var(--shell-gutter,0.75rem)]">
        <ResizablePanelGroup
          key={verticalLayout.layoutKey}
          orientation="vertical"
          defaultLayout={verticalLayout.defaultLayout}
          onLayoutChanged={verticalLayout.onLayoutChanged}
        >
          <ResizablePanel id="main" defaultSize="68%" minSize="35%">
            <ResizablePanelGroup
              key={horizontalLayout.layoutKey}
              orientation="horizontal"
              defaultLayout={horizontalLayout.defaultLayout}
              onLayoutChanged={horizontalLayout.onLayoutChanged}
            >
              {/* LEFT — group summary + combined P&L curve. */}
              <ResizablePanel
                id="summary"
                panelRef={summaryPanelRef}
                collapsible
                collapsedSize="0%"
                defaultSize="21%"
                minSize="21%"
                maxSize="36%"
                onResize={(size) =>
                  setSummaryCollapsed(size.asPercentage < 0.5)
                }
              >
                <WorkspacePanel>
                  <ScrollArea className="h-full">
                    <div className="flex min-w-0 flex-col gap-5 p-4">
                      <div className="flex flex-col gap-3">
                        <span className="text-xs font-bold">Summary</span>
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                              Total P&L
                            </span>
                            <span
                              className={cn(
                                "font-mono text-2xl leading-none font-semibold tabular-nums",
                                summary.netPnl != null
                                  ? toneClass(summary.netPnl)
                                  : "text-foreground"
                              )}
                            >
                              {summary.netPnl !== null
                                ? signedUsd(summary.netPnl)
                                : "—"}
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
                                "inline-flex w-fit items-center gap-1 rounded-lg px-2.5 py-1.5 font-mono text-sm font-semibold tabular-nums",
                                summary.netPnlPct >= 0
                                  ? "bg-emerald-500/10 text-emerald-600"
                                  : "bg-red-500/10 text-red-500"
                              )}
                            >
                              {summary.netPnlPct >= 0 ? "▲" : "▼"}{" "}
                              {signedPct(summary.netPnlPct)}
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
                                    row.tone != null
                                      ? toneClass(row.tone)
                                      : "text-foreground"
                                  )}
                                >
                                  {row.value}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <PnlCurveCard
                        points={chartData}
                        baseline={groupCurve?.startEquity ?? null}
                      />
                    </div>
                  </ScrollArea>
                </WorkspacePanel>
              </ResizablePanel>

              <ResizableHandle gap collapsed={summaryCollapsed} />

              {/* CENTER — the selected market's replay chart. */}
              <ResizablePanel id="chart" defaultSize="51%" minSize="24%">
                <WorkspacePanel className="flex flex-col">
                  {loadedRun && loadedResult ? (
                    <BacktestRunChart
                      key={loadedRun.id}
                      run={loadedRun}
                      focusedTrade={focusedTrade}
                      onLastCloseChange={setRunLastClose}
                      toolbarLeading={
                        <span className="text-sm font-bold">
                          {loadedRun.market}
                        </span>
                      }
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
                      {marketRuns.length === 0
                        ? "No market results in this run."
                        : doneMarkets.length === 0
                          ? "This run is still processing — results appear as each market finishes."
                          : "Select a market to view its chart."}
                    </div>
                  )}
                </WorkspacePanel>
              </ResizablePanel>

              <ResizableHandle gap collapsed={marketsCollapsed} />

              {/* RIGHT — every market in the run; click one to load it. */}
              <ResizablePanel
                id="markets"
                panelRef={marketsPanelRef}
                collapsible
                collapsedSize="0%"
                defaultSize="28%"
                minSize="20%"
                maxSize="48%"
                onResize={(size) =>
                  setMarketsCollapsed(size.asPercentage < 0.5)
                }
              >
                <WorkspacePanel className="flex flex-col">
                  <div className="flex min-h-10 shrink-0 items-center gap-2 border-b p-3">
                    <HistoryIcon className="size-4 text-muted-foreground" />
                    <h2 className="text-xs font-semibold tracking-wide uppercase">
                      Markets
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {marketRuns.length}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      {selection.selected.size ? (
                        <DeleteSelectedButton
                          count={selection.selected.size}
                          description={`This permanently deletes ${selection.selected.size} market ${selection.selected.size === 1 ? "result" : "results"} from this run.`}
                          onDelete={async () => {
                            await deleteBacktests({
                              ids: [...selection.selected],
                            })
                          }}
                          onDone={selection.clear}
                        />
                      ) : null}
                      <DashboardToolbarSearch
                        name="market-search"
                        aria-label="Filter markets"
                        placeholder="Filter markets..."
                        value={state.search}
                        onChange={(event) =>
                          state.setSearch(event.target.value)
                        }
                      />
                    </div>
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <BacktestMarketsTable
                      rows={filtered}
                      state={state}
                      selectedId={resolvedRunId}
                      onSelect={(row) => setSelectedRunId(row.id)}
                      selection={selection}
                    />
                  </ScrollArea>
                </WorkspacePanel>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          {/* The trades panel collapses to its own tab bar, not to nothing,
              so this gutter always has two visible panels to separate. */}
          <ResizableHandle gap />

          {/* BOTTOM — the selected market's trades. */}
          <ResizablePanel
            id="trades"
            panelRef={tradesPanelRef}
            collapsible
            collapsedSize={BOTTOM_COLLAPSED_HEIGHT}
            defaultSize="32%"
            minSize="15%"
            onResize={() =>
              setTradesCollapsed(tradesPanelRef.current?.isCollapsed() ?? false)
            }
          >
            <WorkspacePanel>
              <StrategyTester
                result={loadedResult}
                startingEquity={loadedRun?.startingEquity ?? 0}
                markPrice={runLastClose ?? 0}
                selectedTradeN={focusedTrade?.n ?? null}
                onSelectTrade={setFocusedTrade}
                toggles={panelToggles}
              />
            </WorkspacePanel>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
