import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ArrowDownToLineIcon,
  BotIcon,
  HistoryIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { signedUsd, toneClass } from "@/components/backtest/backtest-format"
import { botBadgeState } from "@/components/bots/bot-status"
import { BotStatusBadge } from "@/components/bots/bot-status-badge"
import { GuardianBanner } from "@/components/bots/guardian-banner"
import { WorkerOfflineBanner } from "@/components/bots/worker-offline-banner"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import { useShellRuntime } from "@/components/shell-layout"
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
  type TableSortDirection,
} from "@/components/ui/table"
import {
  deleteBot,
  getBotErrorMessage,
  loadBots,
  sendCommand,
  sendGlobalCommand,
  type BotListItem,
  type BotListPosition,
  type BotListResponse,
  type FleetEvent,
} from "@/lib/api/bots"
import { PREVIOUS_RUN_NAME_PREFIX } from "@/lib/backtest/types"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { guardianTableStatus } from "@/lib/trading/guardian"
import { useIntervalLoader } from "@/lib/use-interval-loader"
import { useRowSelection } from "@/lib/use-row-selection"
import { cn } from "@/lib/utils"

type RunSortColumn =
  | "name"
  | "status"
  | "mode"
  | "markets"
  | "position"
  | "pnlToday"
  | "pnlTotal"
  | "fills"
  | "started"

type RowCommand = "start" | "stop" | "pause" | "resume" | "flatten"
type GlobalCommand = "pause_all" | "flatten_all"

const ALL = "__all__"
const DELETABLE_STATUSES = ["stopped", "killed", "error"]
const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

/**
 * The fleet control room: per-mode totals strip, warnings that only appear
 * when real (worker offline, guardian tripped, pile-ups), the run table with
 * lifecycle controls, and the fleet-wide activity feed. Bots are still
 * deployed and named from the automation editor's Bot mode.
 */
export function BotRunsDashboard({ initial }: { initial: BotListResponse }) {
  const navigate = useNavigate()
  const { config } = useShellRuntime()
  const { data, refresh } = useIntervalLoader(() => loadBots(), initial)

  const [searchQuery, setSearchQuery] = React.useState("")
  const [modeFilter, setModeFilter] = React.useState<string>(ALL)
  const [statusFilter, setStatusFilter] = React.useState<string>(ALL)
  const [sortColumn, setSortColumn] = React.useState<RunSortColumn>("started")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [busyBotId, setBusyBotId] = React.useState<string | null>(null)
  const [pendingGlobal, setPendingGlobal] =
    React.useState<GlobalCommand | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<BotListItem | null>(
    null
  )
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  // Only offer statuses that actually exist in the fleet.
  const statusOptions = React.useMemo(
    () => [...new Set(data.bots.map((bot) => bot.status))].sort(),
    [data.bots]
  )

  const rows = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const direction = sortDirection === "asc" ? 1 : -1
    return data.bots
      .filter((bot) => modeFilter === ALL || bot.mode === modeFilter)
      .filter((bot) => statusFilter === ALL || bot.status === statusFilter)
      .filter(
        (bot) =>
          !query ||
          bot.name.toLowerCase().includes(query) ||
          bot.wallet_label.toLowerCase().includes(query) ||
          bot.status.toLowerCase().includes(query) ||
          bot.mode.toLowerCase().includes(query) ||
          bot.markets.some((coin) => coin.toLowerCase().includes(query))
      )
      .sort((a, b) => compareRuns(a, b, sortColumn) * direction)
  }, [
    data.bots,
    searchQuery,
    modeFilter,
    statusFilter,
    sortColumn,
    sortDirection,
  ])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Math.min(currentPage, totalPages)
  const paginatedRows = rows.slice((page - 1) * pageSize, page * pageSize)
  const visibleIds = React.useMemo(
    () => paginatedRows.map((bot) => bot.id),
    [paginatedRows]
  )
  const selection = useRowSelection(visibleIds)

  const toggleSort = (column: RunSortColumn) => {
    setCurrentPage(1)
    if (column === sortColumn) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDirection(column === "started" ? "desc" : "asc")
    }
  }

  const openRun = (botId: string) =>
    navigate({ to: "/bots/$botId", params: { botId } })

  async function runCommand(bot: BotListItem, command: RowCommand) {
    setBusyBotId(bot.id)
    try {
      await sendCommand(bot.id, command)
      await refresh()
    } catch (error) {
      toast.error(getBotErrorMessage(error))
    } finally {
      setBusyBotId(null)
    }
  }

  async function confirmGlobal() {
    if (!pendingGlobal) return
    setBusy(true)
    try {
      await sendGlobalCommand(pendingGlobal)
      await refresh()
      setPendingGlobal(null)
    } catch (error) {
      toast.error(getBotErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setBusy(true)
    try {
      await deleteBot(pendingDelete.id)
      selection.removeId(pendingDelete.id)
      await refresh()
      setPendingDelete(null)
    } catch (error) {
      toast.error(getBotErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function confirmMassDelete() {
    const ids = Array.from(selection.selectedIds)
    if (ids.length === 0) return
    setBusy(true)
    const results = await Promise.allSettled(ids.map((id) => deleteBot(id)))
    const failedIds = ids.filter(
      (_, index) => results[index]?.status === "rejected"
    )
    selection.setSelectedIds(new Set(failedIds))
    await refresh()
    setBusy(false)
    if (failedIds.length > 0) {
      toast.error(
        `${failedIds.length} run${failedIds.length === 1 ? "" : "s"} could not be deleted — stop a run before deleting it.`
      )
      return
    }
    setMassDeleteOpen(false)
  }

  const filtered =
    Boolean(searchQuery) || modeFilter !== ALL || statusFilter !== ALL

  return (
    <div className="w-full space-y-[var(--shell-gutter,0.75rem)]">
      {!data.workerOnline ? (
        <WorkerOfflineBanner className="rounded-md border px-3 py-2 text-sm" />
      ) : null}
      <GuardianBanner guardian={data.guardian} onChanged={refresh} />

      <DashboardTable
        title="Bot runs"
        icon={<BotIcon className="text-muted-foreground" />}
        count={data.bots.length}
        status={guardianTableStatus(data.guardian)}
        selectedCount={selection.selectedIds.size}
        onClearSelection={() => selection.setSelectedIds(new Set())}
        controls={
          <>
            {selection.selectedIds.size > 0 ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setMassDeleteOpen(true)}
              >
                {busy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Trash2Icon className="size-4" />
                )}
                Delete ({selection.selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="bot-run-search"
              aria-label="Search bot runs"
              placeholder="Search runs..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setCurrentPage(1)
              }}
            />
            <Select
              value={modeFilter}
              onValueChange={(value) => {
                setModeFilter(value)
                setCurrentPage(1)
              }}
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by mode">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All modes</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="paper">Paper</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value)
                setCurrentPage(1)
              }}
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by status">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              onClick={() => setPendingGlobal("pause_all")}
            >
              <PauseIcon className="size-4" />
              Pause all
            </DashboardToolbarButton>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              onClick={() => setPendingGlobal("flatten_all")}
            >
              <SquareIcon className="size-4" />
              Flatten all
            </DashboardToolbarButton>
          </>
        }
        footer={{
          type: "pagination",
          page,
          pageSize,
          total: rows.length,
          totalPages,
          pageSizeOptions,
          onPageChange: setCurrentPage,
          onPageSizeChange: (nextPageSize) => {
            setPageSize(nextPageSize)
            setCurrentPage(1)
          },
        }}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={
                    selection.visibleSelected
                      ? true
                      : selection.visiblePartiallySelected
                        ? "indeterminate"
                        : false
                  }
                  aria-label="Select visible runs"
                  onCheckedChange={selection.toggleVisible}
                />
              </TableHead>
              <SortableHead
                label="Run"
                column="name"
                main
                active={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableHead
                label="Status"
                column="status"
                active={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableHead
                label="Mode"
                column="mode"
                active={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableHead
                label="Markets"
                column="markets"
                active={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableHead
                label="Position"
                column="position"
                active={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableHead
                label="P&L today"
                column="pnlToday"
                className="text-right"
                active={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableHead
                label="P&L total"
                column="pnlTotal"
                className="text-right"
                active={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableHead
                label="Fills"
                column="fills"
                className="text-right"
                active={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableHead
                label="Started"
                column="started"
                className="hidden lg:table-cell"
                active={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <TableHead column="actions">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={paginatedRows.length === 0}
        emptyText={
          filtered
            ? "No runs match those filters."
            : "No bot runs yet. Open an automation and use its Bot tab to deploy one."
        }
        emptyColSpan={11}
      >
        {paginatedRows.map((bot) => (
          <BotRunRow
            key={bot.id}
            bot={bot}
            busy={busyBotId === bot.id}
            selected={selection.selectedIds.has(bot.id)}
            onToggleSelected={() => selection.toggleRow(bot.id)}
            onOpen={() => void openRun(bot.id)}
            onCommand={(command) => void runCommand(bot, command)}
            onDelete={() => setPendingDelete(bot)}
          />
        ))}
      </DashboardTable>

      <FleetActivityTable
        events={data.events}
        onOpenBot={(botId) => void openRun(botId)}
      />

      <Dialog
        open={Boolean(pendingGlobal)}
        onOpenChange={(open) => {
          if (!open && !busy) setPendingGlobal(null)
        }}
      >
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {pendingGlobal === "flatten_all"
                ? "Flatten all bots"
                : "Pause all bots"}
            </DialogTitle>
            <DialogDescription>
              {pendingGlobal === "flatten_all"
                ? "Every running bot closes its position at market, cancels its orders, and pauses."
                : "Every running bot cancels its open orders and pauses. Positions stay open."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">Proceed?</p>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setPendingGlobal(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmGlobal()}
            >
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !busy) setPendingDelete(null)
        }}
      >
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete run</DialogTitle>
            <DialogDescription>
              Deletes the run with its trade and event history. The run must be
              stopped first.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">
              Delete <span className="font-medium">{pendingDelete?.name}</span>?
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <Trash2Icon className="size-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={massDeleteOpen}
        onOpenChange={(open) => {
          if (!busy) setMassDeleteOpen(open)
        }}
      >
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete selected runs</DialogTitle>
            <DialogDescription>
              Deletes each run with its trade and event history. Runs that are
              still trading are skipped — stop them first.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">
              Delete {selection.selectedIds.size} selected run
              {selection.selectedIds.size === 1 ? "" : "s"}?
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setMassDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || selection.selectedIds.size === 0}
              onClick={() => void confirmMassDelete()}
            >
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <Trash2Icon className="size-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function compareRuns(a: BotListItem, b: BotListItem, column: RunSortColumn) {
  switch (column) {
    case "name":
      return a.name.localeCompare(b.name)
    case "status":
      return a.status.localeCompare(b.status)
    case "mode":
      return a.mode.localeCompare(b.mode)
    case "markets":
      return (
        a.markets.length - b.markets.length ||
        (a.markets[0] ?? "").localeCompare(b.markets[0] ?? "")
      )
    case "position":
      return a.positions.length - b.positions.length
    case "pnlToday":
      return a.daily_realized_pnl - b.daily_realized_pnl
    case "pnlTotal":
      return a.realized_pnl - b.realized_pnl
    case "fills":
      return a.trade_count - b.trade_count
    case "started":
      return Date.parse(a.created_at) - Date.parse(b.created_at)
  }
}

function BotRunRow({
  bot,
  busy,
  selected,
  onToggleSelected,
  onOpen,
  onCommand,
  onDelete,
}: {
  bot: BotListItem
  busy: boolean
  selected: boolean
  onToggleSelected: () => void
  onOpen: () => void
  onCommand: (command: RowCommand) => void
  onDelete: () => void
}) {
  const replaceable = bot.name.startsWith(PREVIOUS_RUN_NAME_PREFIX)
  const deletable = DELETABLE_STATUSES.includes(bot.status)
  const view = botBadgeState(bot, Date.now())
  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell column="select" onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={selected}
          aria-label={`Select ${bot.name}`}
          onCheckedChange={onToggleSelected}
        />
      </TableCell>
      <TableCell column="main">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{bot.name}</span>
          {replaceable ? (
            <Badge
              variant="outline"
              className="shrink-0 text-[10px]"
              title="Unnamed — the next deploy replaces it"
            >
              current
            </Badge>
          ) : null}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {bot.wallet_label}
        </div>
      </TableCell>
      <TableCell column="meta">
        <BotStatusBadge bot={bot} />
      </TableCell>
      <TableCell column="meta">
        <Badge variant={bot.mode === "live" ? "default" : "secondary"}>
          {bot.mode}
        </Badge>
      </TableCell>
      <TableCell column="meta" className="font-mono text-xs">
        <span title={bot.markets.join(", ")}>
          {bot.markets.slice(0, 3).join(", ")}
          {bot.markets.length > 3 ? ` +${bot.markets.length - 3}` : ""}
        </span>
      </TableCell>
      <TableCell column="meta" className="font-mono text-xs tabular-nums">
        <PositionSummary
          positions={bot.positions}
          live={bot.mode === "live"}
        />
      </TableCell>
      <TableCell
        column="meta"
        className={cn(
          "text-right font-mono tabular-nums",
          toneClass(bot.daily_realized_pnl)
        )}
      >
        {signedUsd(bot.daily_realized_pnl)}
      </TableCell>
      <TableCell
        column="meta"
        className={cn(
          "text-right font-mono tabular-nums",
          toneClass(bot.realized_pnl)
        )}
      >
        {signedUsd(bot.realized_pnl)}
      </TableCell>
      <TableCell column="meta" className="text-right font-mono tabular-nums">
        {bot.trade_count}
      </TableCell>
      <TableCell
        column="mutedMeta"
        className="hidden lg:table-cell whitespace-nowrap"
      >
        {dateFormatter.format(new Date(bot.created_at))}
      </TableCell>
      <TableCell column="actions" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-1">
          {busy || view.transient ? (
            <Loader2Icon
              className="size-4 animate-spin text-muted-foreground"
              aria-label={view.transient ? view.label : "Working…"}
            />
          ) : (
            <>
              {bot.status === "running" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Pause — cancel orders, keep the position"
                  onClick={() => onCommand("pause")}
                >
                  <PauseIcon className="size-3.5" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title={bot.status === "paused" ? "Resume" : "Start"}
                  onClick={() =>
                    onCommand(bot.status === "paused" ? "resume" : "start")
                  }
                >
                  <PlayIcon className="size-3.5" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="Flatten — close the position at market, cancel orders, and pause"
                disabled={bot.status !== "running" && bot.status !== "paused"}
                onClick={() => onCommand("flatten")}
              >
                <ArrowDownToLineIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="Stop"
                disabled={bot.status === "stopped"}
                onClick={() => onCommand("stop")}
              >
                <SquareIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={deletable ? "Delete run" : "Stop the run before deleting it"}
                disabled={!deletable}
                onClick={onDelete}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

/** "—" flat, "BTC +0.42" for one position, "3 open" with a tooltip for more. */
function PositionSummary({
  positions,
  live,
}: {
  positions: BotListPosition[]
  live: boolean
}) {
  if (positions.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }
  const detail = [
    positions
      .map(
        (position) =>
          `${position.market} ${position.szi > 0 ? "+" : ""}${position.szi} @ ${position.entry_px.toLocaleString("en-US")}`
      )
      .join(", "),
    // Honest attribution: a live bot's figure is its wallet's position on
    // that market, so hand trades on the same wallet+market blend in.
    live
      ? "The bot's wallet position on this market — manual trades on the same wallet and market are included."
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
  if (positions.length === 1) {
    const [position] = positions
    return (
      <span title={detail}>
        {position.market} {position.szi > 0 ? "+" : ""}
        {position.szi}
      </span>
    )
  }
  return <span title={detail}>{positions.length} open</span>
}

type EventSortColumn = "time" | "bot" | "level" | "type" | "message"

const eventTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
})

const LEVEL_DOT: Record<string, string> = {
  info: "bg-muted-foreground/50",
  warn: "bg-amber-500",
  error: "bg-red-500",
}

/**
 * The fleet-wide activity feed — the log every bot already writes (fills,
 * signals, warnings, errors), newest first. Rows open the bot's run page.
 */
function FleetActivityTable({
  events,
  onOpenBot,
}: {
  events: FleetEvent[]
  onOpenBot: (botId: string) => void
}) {
  const [levelFilter, setLevelFilter] = React.useState<string>(ALL)
  const [sortColumn, setSortColumn] = React.useState<EventSortColumn>("time")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")

  const rows = React.useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1
    return events
      .filter((event) => levelFilter === ALL || event.level === levelFilter)
      .sort((a, b) => compareEvents(a, b, sortColumn) * direction)
  }, [events, levelFilter, sortColumn, sortDirection])

  const toggleSort = (column: EventSortColumn) => {
    if (column === sortColumn) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDirection(column === "time" ? "desc" : "asc")
    }
  }

  return (
    <DashboardTable
      title="Activity"
      icon={
        <HistoryIcon className="text-muted-foreground" />
      }
      count={rows.length}
      controls={
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <DashboardToolbarSelectTrigger aria-label="Filter by level">
            <SelectValue />
          </DashboardToolbarSelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All levels</SelectItem>
            <SelectItem value="info">info</SelectItem>
            <SelectItem value="warn">warn</SelectItem>
            <SelectItem value="error">error</SelectItem>
          </SelectContent>
        </Select>
      }
      footer={{ type: "summary", count: rows.length, label: "events (last 100)" }}
      header={
        <TableHeader>
          <TableRow>
            <SortableHead
              label="Time"
              column="time"
              active={sortColumn}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableHead
              label="Bot"
              column="bot"
              active={sortColumn}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableHead
              label="Level"
              column="level"
              active={sortColumn}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableHead
              label="Type"
              column="type"
              active={sortColumn}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortableHead
              label="Message"
              column="message"
              main
              active={sortColumn}
              direction={sortDirection}
              onSort={toggleSort}
            />
          </TableRow>
        </TableHeader>
      }
      isEmpty={rows.length === 0}
      emptyText={
        levelFilter === ALL
          ? "No activity yet. Deploy a bot and its fills, signals, and warnings land here."
          : "No events at that level."
      }
      emptyColSpan={5}
    >
      {rows.map((event) => (
        <TableRow
          key={event.id}
          className="cursor-pointer"
          onClick={() => onOpenBot(event.bot_id)}
        >
          <TableCell
            column="mutedMeta"
            className="whitespace-nowrap font-mono text-xs tabular-nums"
          >
            {eventTimeFormatter.format(new Date(event.created_at))}
          </TableCell>
          <TableCell column="meta" className="max-w-40 truncate">
            {event.bot_name}
          </TableCell>
          <TableCell column="meta">
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  LEVEL_DOT[event.level] ?? LEVEL_DOT.info
                )}
              />
              {event.level}
            </span>
          </TableCell>
          <TableCell column="meta" className="font-mono text-xs">
            {event.type}
          </TableCell>
          <TableCell column="main" className="max-w-0">
            <span className="block truncate" title={event.message}>
              {event.message}
            </span>
          </TableCell>
        </TableRow>
      ))}
    </DashboardTable>
  )
}

function compareEvents(a: FleetEvent, b: FleetEvent, column: EventSortColumn) {
  switch (column) {
    case "time":
      return Date.parse(a.created_at) - Date.parse(b.created_at)
    case "bot":
      return a.bot_name.localeCompare(b.bot_name)
    case "level":
      return a.level.localeCompare(b.level)
    case "type":
      return a.type.localeCompare(b.type)
    case "message":
      return a.message.localeCompare(b.message)
  }
}

function SortableHead<Column extends string>({
  label,
  column,
  main = false,
  className,
  active,
  direction,
  onSort,
}: {
  label: string
  column: Column
  main?: boolean
  className?: string
  active: Column
  direction: TableSortDirection
  onSort: (column: Column) => void
}) {
  return (
    <TableHead column={main ? "main" : "meta"} className={className}>
      <TableSortButton
        active={active === column}
        direction={direction}
        onClick={() => onSort(column)}
      >
        {label}
      </TableSortButton>
    </TableHead>
  )
}
