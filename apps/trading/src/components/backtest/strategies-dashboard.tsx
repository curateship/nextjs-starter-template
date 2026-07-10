import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  ChevronDownIcon,
  HistoryIcon,
  LayersIcon,
  ListFilterIcon,
  ListIcon,
  Loader2Icon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Button } from "@/components/ui/button"
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
  loadBacktest,
  updateRunStatus,
  type BacktestDetail,
  type BacktestListItem,
} from "@/lib/api/backtests"
import type { GroupPortfolioMetrics } from "@/lib/backtest/types"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { useBinanceMarketRows } from "@/lib/backtest/binance-markets"
import {
  STRATEGY_DESCRIPTIONS,
  STRATEGY_LABELS,
  strategyLabel,
  type StrategyType,
} from "@/lib/strategies/params"
import { isStrategyConfig } from "@/lib/strategies/strategy-config"
import { cn } from "@/lib/utils"

import {
  pct,
  signedUsd,
  toneClass,
  truncateWords,
  usd,
  windowDaysOf,
} from "./backtest-format"
import { NewRunDialog } from "./new-run-dialog"
import { RunStatusMenuItems } from "./run-status-menu"

const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

/** "signal" (the new model) first; retired legacy types keep their history. */
type DashStrategyType = StrategyType | "signal"
const STRATEGY_TYPES: DashStrategyType[] = [
  "signal", "momentum", "qqe", "vwap", "grid", "dca", "copy",
]

const STRATEGY_KIND: Record<DashStrategyType, string> = {
  signal: "Indicator",
  grid: "Range",
  dca: "Averaging",
  momentum: "Trend",
  qqe: "Oscillator",
  vwap: "Reversion",
  copy: "Mirror",
}

const DASH_LABELS: Record<DashStrategyType, string> = {
  ...STRATEGY_LABELS,
  signal: "Strategies (new model)",
}

const DASH_DESCRIPTIONS: Record<DashStrategyType, string> = {
  ...STRATEGY_DESCRIPTIONS,
  signal:
    "Indicator-driven strategies from the Strategies page — one indicator plus the universal settings block.",
}

/** Summary stat tile shown above the strategy-runs table. */
function StatCard({
  label,
  value,
  tone,
  sub,
}: {
  label: string
  value: string
  tone?: number | null
  /** Optional muted context line under the value (e.g. a date). */
  sub?: string
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular-nums",
          tone != null ? toneClass(tone) : undefined
        )}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
          {sub}
        </div>
      ) : null}
    </div>
  )
}

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

/** Toolbar "New Run" button + the creation modal; opens the run's workspace. */
function NewRunButton() {
  const navigate = useNavigate()
  const markets = useBinanceMarketRows()
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <DashboardToolbarButton type="button" onClick={() => setOpen(true)}>
        <PlusIcon className="size-4" />
        New Run
      </DashboardToolbarButton>
      <NewRunDialog
        open={open}
        onOpenChange={setOpen}
        markets={markets}
        defaultMarket="BTC"
        onLaunched={(backtestId) =>
          void navigate({ to: "/backtest", search: { run: backtestId } })
        }
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
// Level 1 — /strategies: one row per strategy.
// ---------------------------------------------------------------------------

type StrategyRow = {
  type: DashStrategyType
  label: string
  kind: string
  groups: number
  executions: number
  bestNetPct: number | null
  lastRunAt: number | null
}

type StrategySort = "strategy" | "groups" | "executions" | "best" | "last"

export function StrategiesOverview({
  runs,
}: {
  runs: BacktestListItem[]
}) {
  const navigate = useNavigate()
  const state = useTableState<StrategySort>("last")
  const selection = useSelection()
  const [pendingDelete, setPendingDelete] = React.useState<StrategyRow | null>(
    null
  )

  // One row per strategy family. Retired (legacy) families only appear while
  // they still have saved runs to look back at.
  const rows = React.useMemo<StrategyRow[]>(() => {
    return STRATEGY_TYPES.flatMap((type) => {
      const own = runs.filter((run) => run.strategyType === type)
      if (type !== "signal" && own.length === 0) return []
      const done = own.filter(
        (run) => run.status === "done" && run.netPnlPct !== null
      )
      return [
        {
          type,
          label: DASH_LABELS[type],
          kind: STRATEGY_KIND[type],
          groups: new Set(own.map((run) => run.groupId)).size,
          executions: own.length,
          bestNetPct: done.length
            ? Math.max(...done.map((run) => run.netPnlPct as number))
            : null,
          lastRunAt: own.length ? Date.parse(own[0].createdAt) : null,
        },
      ]
    })
  }, [runs])

  const sorted = React.useMemo(() => {
    const direction = state.sortDirection === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      if (state.sortColumn === "strategy")
        return a.label.localeCompare(b.label) * direction
      if (state.sortColumn === "groups") return (a.groups - b.groups) * direction
      if (state.sortColumn === "executions")
        return (a.executions - b.executions) * direction
      if (state.sortColumn === "best")
        return ((a.bestNetPct ?? -Infinity) - (b.bestNetPct ?? -Infinity)) * direction
      return ((a.lastRunAt ?? 0) - (b.lastRunAt ?? 0)) * direction
    })
  }, [rows, state.sortColumn, state.sortDirection])

  const visibleIds = sorted.map((row) => row.type as string)

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title="Strategies"
        icon={<LayersIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={rows.length}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selection.selected.size ? (
              <DeleteSelectedButton
                count={selection.selected.size}
                description={`This permanently deletes every run and its re-run history for ${selection.selected.size} ${selection.selected.size === 1 ? "strategy" : "strategies"}. The strategies themselves stay available for new runs.`}
                onDelete={async () => {
                  await deleteBacktests({
                    strategyTypes: [...selection.selected] as StrategyType[],
                  })
                }}
                onDone={selection.clear}
              />
            ) : null}
            <NewRunButton />
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
                  aria-label="Select all strategies"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={state.sortColumn === "strategy"}
                  direction={state.sortDirection}
                  onClick={() => state.toggleSort("strategy")}
                >
                  Strategy
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Type</TableHead>
              {sortHead("Runs", "groups", state)}
              {sortHead("Executions", "executions", state)}
              {sortHead("Best Net %", "best", state)}
              {sortHead("Last run", "last", state)}
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={sorted.length === 0}
        emptyText="No strategies."
        emptyColSpan={8}
        footer={{ type: "summary", count: sorted.length, label: "strategies" }}
      >
        {sorted.map((row) => (
          <TableRow
            key={row.type}
            className="cursor-pointer"
            onClick={() =>
              void navigate({
                to: "/backtest/$strategyType",
                params: { strategyType: row.type },
              })
            }
          >
            <TableCell column="select" onClick={(event) => event.stopPropagation()}>
              <Checkbox
                checked={selection.selected.has(row.type)}
                onCheckedChange={() => selection.toggle(row.type)}
                aria-label={`Select ${row.label}`}
              />
            </TableCell>
            <TableCell column="main">
              <div className="font-medium">{row.label}</div>
              <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                {DASH_DESCRIPTIONS[row.type]}
              </div>
            </TableCell>
            <TableCell column="meta">
              <Badge variant="secondary">{row.kind}</Badge>
            </TableCell>
            <TableCell column="meta" className="font-mono tabular-nums">
              {row.groups}
            </TableCell>
            <TableCell column="meta" className="font-mono tabular-nums">
              {row.executions}
            </TableCell>
            <TableCell
              column="meta"
              className={cn(
                "font-mono tabular-nums",
                row.bestNetPct !== null ? toneClass(row.bestNetPct) : undefined
              )}
            >
              {row.bestNetPct !== null ? pct(row.bestNetPct) : "—"}
            </TableCell>
            <TableCell column="mutedMeta" className="font-mono text-xs tabular-nums">
              {row.lastRunAt ? dateTimeFormatter.format(row.lastRunAt) : "—"}
            </TableCell>
            <TableCell column="meta" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Delete ${row.label} runs`}
                  onClick={() => setPendingDelete(row)}
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
            ? `This permanently deletes all ${pendingDelete.executions} execution${pendingDelete.executions === 1 ? "" : "s"} across ${pendingDelete.groups} run${pendingDelete.groups === 1 ? "" : "s"} of ${pendingDelete.label}. The strategy stays available for new runs.`
            : ""
        }
        onDelete={async () => {
          if (pendingDelete) {
            await deleteBacktests({ strategyTypes: [pendingDelete.type] })
          }
        }}
      />
    </div>
  )
}


// ---------------------------------------------------------------------------
// Level 2 — /strategies/$strategyType: one row per named run (group).
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

export function StrategyRunsDashboard({
  runs,
  strategyType,
  pagination,
  onPaginationChange,
  groupMetrics,
}: {
  runs: BacktestListItem[]
  strategyType: DashStrategyType
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  onPaginationChange?: (patch: { page?: number; pageSize?: number }) => void
  groupMetrics: Record<string, GroupPortfolioMetrics>
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const state = useTableState<GroupSort>("last")
  const selection = useSelection()
  const [editing, setEditing] = React.useState<GroupRow | null>(null)
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
      if (run.strategyType !== strategyType) continue
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
  }, [runs, strategyType, groupMetrics])

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

  const serverPaged = pagination !== undefined && onPaginationChange !== undefined
  const { rows: pageRows, totalPages } = serverPaged
    ? { rows: filtered, totalPages: pagination.totalPages }
    : paginate(filtered, state.page, state.pageSize)
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
    <div className="w-full pb-8">
      <DashboardTable
        title={
          <Breadcrumbs
            crumbs={[
              { label: "Backtest", to: "/backtest" },
              { label: DASH_LABELS[strategyType as DashStrategyType] ?? strategyType },
            ]}
          />
        }
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
            <NewRunButton />
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
          page: pagination?.page ?? state.page,
          pageSize: pagination?.pageSize ?? state.pageSize,
          total: pagination?.total ?? filtered.length,
          totalPages,
          pageSizeOptions,
          onPageChange: serverPaged
            ? (page) => onPaginationChange({ page })
            : state.setPage,
          onPageSizeChange: serverPaged
            ? (pageSize) => onPaginationChange({ page: 1, pageSize })
            : state.setPageSize,
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
                to: "/backtest/$strategyType/$groupId",
                params: { strategyType, groupId: group.groupId },
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
                  aria-label={`Edit ${group.name}`}
                  onClick={() => setEditing(group)}
                >
                  <SettingsIcon className="size-4 text-muted-foreground" />
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

      {editing ? (
        <EditRunDialog
          key={editing.groupId}
          group={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

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

/**
 * Loads a run group's full config into the shared run dialog; Re-run executes
 * the edited config back into the same group — existing markets are replaced
 * with fresh results, newly added markets are added to the run.
 */
function EditRunDialog({
  group,
  onClose,
}: {
  group: GroupRow
  onClose: () => void
}) {
  const router = useRouter()
  const markets = useBinanceMarketRows()
  const [loaded, setLoaded] = React.useState<{
    detail: BacktestDetail
    groupMarkets: string[]
  } | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void loadBacktest(group.mainId)
      .then((res) => {
        if (cancelled) return
        if (!res.backtest) {
          setLoadError("Run not found.")
          return
        }
        setLoaded({
          detail: res.backtest,
          groupMarkets: res.groupRuns.map((run) => run.market),
        })
      })
      .catch(() => {
        if (!cancelled) setLoadError("Failed to load the run configuration.")
      })
    return () => {
      cancelled = true
    }
  }, [group.mainId])

  if (!loaded) {
    return (
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Edit Run</DialogTitle>
            <DialogDescription>
              {loadError ?? "Loading the run configuration…"}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  const { detail, groupMarkets } = loaded

  // Legacy run groups (retired strategies) are read-only — no re-runs.
  if (!isStrategyConfig(detail.params)) {
    return (
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Legacy run</DialogTitle>
            <DialogDescription>
              This run used a retired strategy ({strategyLabel(detail.strategyType)}).
              Its results stay viewable, but it can't be re-run — create a new
              strategy on the Strategies page and run that instead.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  const extraMarkets = groupMarkets.filter((coin) => coin !== detail.market)
  return (
    <NewRunDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      markets={markets}
      defaultMarket={detail.market}
      editTarget={{
        groupId: group.groupId,
        name: detail.name,
        market: detail.market,
        extraMarkets,
        windowDays: windowDaysOf(detail),
        equity: detail.startingEquity,
        takerFeeBps: detail.costs.takerFeeBps,
        makerFeeBps: detail.costs.makerFeeBps,
        slippageBps: detail.costs.slippageBps,
        config: detail.params,
      }}
      onLaunched={async () => {
        await router.invalidate()
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Level 3 — /backtest/$strategyType/$groupId: one result row per market.
// ---------------------------------------------------------------------------

type MarketSort = "market" | "net" | "dd" | "win" | "trades" | "days"

export function RunHistoryDashboard({
  runs,
  strategyType,
  groupId,
  groupMetrics,
}: {
  runs: BacktestListItem[]
  strategyType: DashStrategyType
  groupId: string
  groupMetrics: Record<string, GroupPortfolioMetrics>
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

  const sorted = React.useMemo(() => {
    const direction = state.sortDirection === "asc" ? 1 : -1
    const num = (value: number | null) => value ?? -Infinity
    return [...marketRuns].sort((a, b) => {
      if (state.sortColumn === "market")
        return a.market.localeCompare(b.market) * direction
      if (state.sortColumn === "dd")
        return (num(a.maxDrawdownPct) - num(b.maxDrawdownPct)) * direction
      if (state.sortColumn === "win")
        return (num(a.winRate) - num(b.winRate)) * direction
      if (state.sortColumn === "trades")
        return (num(a.tradeCount) - num(b.tradeCount)) * direction
      if (state.sortColumn === "days")
        return (num(a.tradingDays) - num(b.tradingDays)) * direction
      return (num(a.netPnlPct) - num(b.netPnlPct)) * direction
    })
  }, [marketRuns, state.sortColumn, state.sortDirection])

  const { rows: pageRows, totalPages } = paginate(sorted, state.page, state.pageSize)
  const visibleIds = pageRows.map((run) => run.id)

  const metrics = groupMetrics[groupId] ?? null

  // This run's headline stats, blended across its markets — shown as cards.
  const summary = React.useMemo(() => {
    const done = marketRuns.filter((run) => run.status === "done")
    const equity = done.reduce((s, run) => s + run.startingEquity, 0)
    const pnl = done.reduce((s, run) => s + (run.netPnl ?? 0), 0)
    const startMs = main ? Date.parse(main.startTime) : NaN
    return {
      markets: marketRuns.length,
      startEquity: done.length ? equity : null,
      netPnl: done.length ? pnl : null,
      netPnlPct: equity > 0 ? (pnl / equity) * 100 : null,
      trades: done.reduce((s, run) => s + (run.tradeCount ?? 0), 0),
      startMs: Number.isNaN(startMs) ? null : startMs,
    }
  }, [marketRuns, main])

  return (
    <div className="w-full pb-8">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Markets" value={String(summary.markets)} />
        <StatCard
          label="Net P&L %"
          value={summary.netPnlPct !== null ? pct(summary.netPnlPct) : "—"}
          tone={summary.netPnlPct}
        />
        <StatCard
          label="Total P&L"
          value={summary.netPnl !== null ? signedUsd(summary.netPnl) : "—"}
          tone={summary.netPnl}
          sub={
            summary.startEquity !== null
              ? `from ${usd(summary.startEquity)}`
              : undefined
          }
        />
        <StatCard
          label="Trades"
          value={summary.trades.toLocaleString()}
          sub={
            summary.startMs !== null
              ? `since ${shortDateFormatter.format(summary.startMs)}`
              : undefined
          }
        />
        <StatCard
          label="Combined DD"
          value={
            metrics ? `${metrics.combinedDrawdownPct.toFixed(1)}%` : "—"
          }
          tone={metrics ? metrics.combinedDrawdownPct : null}
          sub={
            metrics && metrics.drawdownAt !== null
              ? `on ${shortDateFormatter.format(metrics.drawdownAt)}`
              : undefined
          }
        />
        <StatCard
          label="Bucket low"
          value={
            metrics
              ? metrics.bucketLowPct < 0
                ? `${metrics.bucketLowPct.toFixed(1)}%`
                : "never"
              : "—"
          }
          tone={metrics ? metrics.bucketLowPct : null}
          sub={
            metrics && metrics.bucketLowPct < 0 && metrics.bucketLowAt !== null
              ? `on ${shortDateFormatter.format(metrics.bucketLowAt)}`
              : undefined
          }
        />
      </div>
      <DashboardTable
        title={
          <Breadcrumbs
            crumbs={[
              { label: "Backtest", to: "/backtest" },
              {
                label: DASH_LABELS[strategyType as DashStrategyType] ?? strategyType,
                to: `/backtest/${strategyType}`,
              },
              { label: truncateWords(runName, 10) },
            ]}
          />
        }
        icon={<HistoryIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={marketRuns.length}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          selection.selected.size ? (
            <DeleteSelectedButton
              count={selection.selected.size}
              description={`This permanently deletes ${selection.selected.size} market ${selection.selected.size === 1 ? "result" : "results"} from this run.`}
              onDelete={async () => {
                await deleteBacktests({ ids: [...selection.selected] })
              }}
              onDone={selection.clear}
            />
          ) : undefined
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
              {sortHead("Trades", "trades", state)}
              {sortHead("Days", "days", state)}
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
          total: sorted.length,
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
            <TableCell column="main">
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
            <TableCell column="meta" className="font-mono tabular-nums">
              {run.tradeCount ?? "—"}
            </TableCell>
            <TableCell column="meta" className="font-mono tabular-nums">
              {run.tradingDays !== null ? `${run.tradingDays}d` : "—"}
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
    </div>
  )
}
