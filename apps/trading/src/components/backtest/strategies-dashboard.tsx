import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  HistoryIcon,
  LayersIcon,
  ListIcon,
  Loader2Icon,
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
import { PARAM_DEFAULTS } from "@/components/bots/strategy-params-form"
import {
  deleteBacktests,
  type BacktestListItem,
  type StrategyDefaultsMap,
  type StrategyRunDefaults,
} from "@/lib/api/backtests"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { useMarketRows } from "@/lib/hl/hooks"
import {
  STRATEGY_DESCRIPTIONS,
  STRATEGY_LABELS,
  type StrategyType,
} from "@/lib/strategies/params"
import { cn } from "@/lib/utils"

import { pct, signedUsd, toneClass, windowDaysOf } from "./backtest-format"
import { NewRunDialog } from "./new-run-dialog"
import { StrategyDefaultsDialog } from "./strategy-defaults-dialog"

const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

const STRATEGY_TYPES: StrategyType[] = ["momentum", "grid", "dca", "copy"]

const STRATEGY_KIND: Record<StrategyType, string> = {
  grid: "Range",
  dca: "Averaging",
  momentum: "Trend",
  copy: "Mirror",
}

const STATUS_TONE: Record<BacktestListItem["status"], string> = {
  pending: "text-muted-foreground",
  running: "text-amber-600",
  done: "text-emerald-600",
  error: "text-red-500",
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete backtests</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <DialogFooter>
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
function NewRunButton({
  defaultStrategy,
  userDefaults,
}: {
  defaultStrategy?: StrategyType
  userDefaults?: StrategyDefaultsMap
}) {
  const navigate = useNavigate()
  const markets = useMarketRows("mainnet")
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
        defaultInterval="15m"
        defaultStrategy={defaultStrategy}
        userDefaults={userDefaults}
        onContinue={(draft) =>
          void navigate({ to: "/backtest", search: { draft } })
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
  type: StrategyType
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
  strategyDefaults,
}: {
  runs: BacktestListItem[]
  strategyDefaults: StrategyDefaultsMap
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const state = useTableState<StrategySort>("last")
  const selection = useSelection()
  const [editing, setEditing] = React.useState<StrategyType | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<StrategyRow | null>(
    null
  )

  const seedFor = (type: StrategyType): StrategyRunDefaults => {
    const stored = strategyDefaults[type]
    return {
      ...stored,
      params: { ...PARAM_DEFAULTS[type], ...(stored?.params ?? {}) },
    }
  }

  const rows = React.useMemo<StrategyRow[]>(() => {
    return STRATEGY_TYPES.map((type) => {
      const own = runs.filter((run) => run.strategyType === type)
      const done = own.filter(
        (run) => run.status === "done" && run.netPnlPct !== null
      )
      return {
        type,
        label: STRATEGY_LABELS[type],
        kind: STRATEGY_KIND[type],
        groups: new Set(own.map((run) => run.groupId)).size,
        executions: own.length,
        bestNetPct: done.length
          ? Math.max(...done.map((run) => run.netPnlPct as number))
          : null,
        lastRunAt: own.length ? Date.parse(own[0].createdAt) : null,
      }
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
            <NewRunButton userDefaults={strategyDefaults} />
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
              <TableHead column="meta">Kind</TableHead>
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
                {STRATEGY_DESCRIPTIONS[row.type]}
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
                  aria-label={`Edit ${row.label} defaults`}
                  onClick={() => setEditing(row.type)}
                >
                  <SettingsIcon className="size-4 text-muted-foreground" />
                </Button>
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

      {editing ? (
        <StrategyDefaultsDialog
          key={editing}
          strategy={editing}
          initial={seedFor(editing)}
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null)
          }}
          onSaved={() => void router.invalidate()}
        />
      ) : null}

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
  name: string
  market: string
  interval: string
  windowDays: number
  executions: number
  status: BacktestListItem["status"]
  netPnlPct: number | null
  lastRunAt: number
}

type GroupSort =
  | "name"
  | "market"
  | "executions"
  | "net"
  | "last"

export function StrategyRunsDashboard({
  runs,
  strategyType,
  strategyDefaults,
}: {
  runs: BacktestListItem[]
  strategyType: StrategyType
  strategyDefaults: StrategyDefaultsMap
}) {
  const navigate = useNavigate()
  const state = useTableState<GroupSort>("last")
  const selection = useSelection()

  const groups = React.useMemo<GroupRow[]>(() => {
    const byGroup = new Map<string, BacktestListItem[]>()
    for (const run of runs) {
      if (run.strategyType !== strategyType) continue
      const list = byGroup.get(run.groupId)
      if (list) list.push(run)
      else byGroup.set(run.groupId, [run])
    }
    // runs arrive newest-first, so index 0 is the latest execution.
    return [...byGroup.entries()].map(([groupId, executions]) => {
      const latest = executions[0]
      return {
        groupId,
        name: latest.name,
        market: latest.market,
        interval: latest.interval,
        windowDays: windowDaysOf(latest),
        executions: executions.length,
        status: latest.status,
        netPnlPct: latest.netPnlPct,
        lastRunAt: Date.parse(latest.createdAt),
      }
    })
  }, [runs, strategyType])

  const filtered = React.useMemo(() => {
    const query = state.search.trim().toLowerCase()
    const matches = query
      ? groups.filter(
          (group) =>
            group.name.toLowerCase().includes(query) ||
            group.market.toLowerCase().includes(query)
        )
      : groups
    const direction = state.sortDirection === "asc" ? 1 : -1
    return [...matches].sort((a, b) => {
      if (state.sortColumn === "name") return a.name.localeCompare(b.name) * direction
      if (state.sortColumn === "market")
        return a.market.localeCompare(b.market) * direction
      if (state.sortColumn === "executions")
        return (a.executions - b.executions) * direction
      if (state.sortColumn === "net")
        return ((a.netPnlPct ?? -Infinity) - (b.netPnlPct ?? -Infinity)) * direction
      return (a.lastRunAt - b.lastRunAt) * direction
    })
  }, [groups, state.search, state.sortColumn, state.sortDirection])

  const { rows: pageRows, totalPages } = paginate(filtered, state.page, state.pageSize)
  const visibleIds = pageRows.map((group) => group.groupId)

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title={
          <Breadcrumbs
            crumbs={[
              { label: "Backtest", to: "/backtest" },
              { label: STRATEGY_LABELS[strategyType] },
            ]}
          />
        }
        icon={<ListIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={filtered.length}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selection.selected.size ? (
              <DeleteSelectedButton
                count={selection.selected.size}
                description={`This permanently deletes ${selection.selected.size} ${selection.selected.size === 1 ? "run" : "runs"} including all re-run history.`}
                onDelete={async () => {
                  await deleteBacktests({ groupIds: [...selection.selected] })
                }}
                onDone={selection.clear}
              />
            ) : null}
            <DashboardToolbarSearch
              name="run-search"
              aria-label="Search runs"
              placeholder="Search runs..."
              value={state.search}
              onChange={(event) => state.setSearch(event.target.value)}
            />
            <NewRunButton
              defaultStrategy={strategyType}
              userDefaults={strategyDefaults}
            />
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
              {sortHead("Market", "market", state)}
              <TableHead column="meta">Timeframe</TableHead>
              <TableHead column="meta">Window</TableHead>
              {sortHead("Executions", "executions", state)}
              <TableHead column="meta">Status</TableHead>
              {sortHead("Net P&L %", "net", state)}
              {sortHead("Last run", "last", state)}
            </TableRow>
          </TableHeader>
        }
        isEmpty={pageRows.length === 0}
        emptyText="No runs for this strategy yet — create one with New Run."
        emptyColSpan={9}
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
            className="cursor-pointer"
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
            <TableCell column="main" className="font-medium">
              {group.name}
            </TableCell>
            <TableCell column="meta">{group.market}</TableCell>
            <TableCell column="meta" className="font-mono text-xs">
              {group.interval}
            </TableCell>
            <TableCell column="meta" className="font-mono text-xs tabular-nums">
              {group.windowDays}d
            </TableCell>
            <TableCell column="meta" className="font-mono tabular-nums">
              {group.executions}
            </TableCell>
            <TableCell column="meta" className={cn("text-xs", STATUS_TONE[group.status])}>
              {group.status}
            </TableCell>
            <TableCell
              column="meta"
              className={cn(
                "font-mono tabular-nums",
                group.netPnlPct !== null ? toneClass(group.netPnlPct) : undefined
              )}
            >
              {group.status === "done" && group.netPnlPct !== null
                ? pct(group.netPnlPct)
                : "—"}
            </TableCell>
            <TableCell column="mutedMeta" className="font-mono text-xs tabular-nums">
              {dateTimeFormatter.format(group.lastRunAt)}
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Level 3 — /strategies/$strategyType/$groupId: a run's re-run history.
// ---------------------------------------------------------------------------

type ExecutionSort = "n" | "ran" | "market" | "net" | "trades"

export function RunHistoryDashboard({
  runs,
  strategyType,
  groupId,
}: {
  runs: BacktestListItem[]
  strategyType: StrategyType
  groupId: string
}) {
  const navigate = useNavigate()
  const state = useTableState<ExecutionSort>("ran")
  const selection = useSelection()

  const executions = React.useMemo(() => {
    const own = runs
      .filter((run) => run.groupId === groupId)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    return own.map((run, index) => ({ ...run, n: index + 1 }))
  }, [runs, groupId])

  const runName = executions[executions.length - 1]?.name ?? "Run"

  const sorted = React.useMemo(() => {
    const direction = state.sortDirection === "asc" ? 1 : -1
    return [...executions].sort((a, b) => {
      if (state.sortColumn === "n") return (a.n - b.n) * direction
      if (state.sortColumn === "market")
        return a.market.localeCompare(b.market) * direction
      if (state.sortColumn === "net")
        return ((a.netPnlPct ?? -Infinity) - (b.netPnlPct ?? -Infinity)) * direction
      if (state.sortColumn === "trades")
        return ((a.tradeCount ?? -1) - (b.tradeCount ?? -1)) * direction
      return (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * direction
    })
  }, [executions, state.sortColumn, state.sortDirection])

  const { rows: pageRows, totalPages } = paginate(sorted, state.page, state.pageSize)
  const visibleIds = pageRows.map((run) => run.id)

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title={
          <Breadcrumbs
            crumbs={[
              { label: "Backtest", to: "/backtest" },
              {
                label: STRATEGY_LABELS[strategyType],
                to: `/backtest/${strategyType}`,
              },
              { label: runName },
            ]}
          />
        }
        icon={<HistoryIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={executions.length}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          selection.selected.size ? (
            <DeleteSelectedButton
              count={selection.selected.size}
              description={`This permanently deletes ${selection.selected.size} ${selection.selected.size === 1 ? "execution" : "executions"} from this run's history.`}
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
                  aria-label="Select visible executions"
                />
              </TableHead>
              {sortHead("#", "n", state)}
              {sortHead("Ran at", "ran", state)}
              {sortHead("Market", "market", state)}
              <TableHead column="meta">Timeframe</TableHead>
              <TableHead column="meta">Window</TableHead>
              <TableHead column="meta">Status</TableHead>
              {sortHead("Net P&L", "net", state)}
              {sortHead("Trades", "trades", state)}
            </TableRow>
          </TableHeader>
        }
        isEmpty={pageRows.length === 0}
        emptyText="No executions in this run."
        emptyColSpan={9}
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
                aria-label={`Select execution ${run.n}`}
              />
            </TableCell>
            <TableCell column="meta" className="font-mono tabular-nums">
              {run.n}
            </TableCell>
            <TableCell column="meta" className="font-mono text-xs tabular-nums">
              {dateTimeFormatter.format(Date.parse(run.createdAt))}
            </TableCell>
            <TableCell column="meta">{run.market}</TableCell>
            <TableCell column="meta" className="font-mono text-xs">
              {run.interval}
            </TableCell>
            <TableCell column="meta" className="font-mono text-xs tabular-nums">
              {windowDaysOf(run)}d
            </TableCell>
            <TableCell column="meta" className={cn("text-xs", STATUS_TONE[run.status])}>
              {run.status === "error" ? (
                <span title={run.error ?? undefined}>error</span>
              ) : (
                run.status
              )}
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
            <TableCell column="meta" className="font-mono tabular-nums">
              {run.tradeCount ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
    </div>
  )
}
