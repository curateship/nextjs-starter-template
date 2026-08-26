import * as React from "react"
import { Link, useRouter } from "@tanstack/react-router"
import {
  ActivityIcon,
  PauseIcon,
  PlayIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { signedUsd, toneClass } from "@/components/backtest/backtest-kpi"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import {
  getFlowRunErrorMessage,
  loadFlowRuns,
  removeFlowRuns,
  type FlowRunListRow,
} from "@/lib/api/flow-runs"
import { flowActionProblem, pauseFlow, stopFlow } from "@/lib/api/flow-trading"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDateTime, formatRelativeTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * Every flow that has ever been switched on, newest first.
 *
 * The columns are the questions somebody actually has about a run: is it still
 * going, which wallet is it spending, how many of its coins are working, and
 * what has it made. Everything heavier — the trades, the chart, what each coin
 * is waiting on — waits until a row is opened.
 *
 * **"Made or lost" is money banked and nothing else.** What a position is
 * worth right now needs the exchange, and asking it once per run to draw a
 * list would spend the whole minute's allowance on a page nobody is trading
 * from. The run's own page adds what is open, and says so where it does.
 *
 * There is no rename or pin here, deliberately. A backtest is a document
 * somebody made; a run is a record of money that moved. What a running row
 * DOES offer is the two acts somebody comes to this page for: pause it where
 * it stands, or stop it — the same two buttons its canvas carries, because a
 * run that needs you should not first need the walk back to its canvas.
 */
type Column = "flow" | "wallet" | "working" | "net" | "started"

/** How often the list re-reads while anything is still switched on. */
const REFRESH_MS = 5_000

export function FlowRunsListPage({ initial }: { initial: FlowRunListRow[] }) {
  const router = useRouter()
  const [runs, setRuns] = React.useState(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [sort, setSort] = React.useState<Column>("started")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  const [deleting, setDeleting] = React.useState<string[] | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  /** The run whose Stop is being confirmed, and the row an action is busy on. */
  const [stopping, setStopping] = React.useState<FlowRunListRow | null>(null)
  const [actingId, setActingId] = React.useState<string | null>(null)
  const { selected, toggle, toggleVisible, clear, selectAllState } =
    useSelection()

  const toggleSort = (column: Column) => {
    if (column === sort) {
      setDirection(direction === "asc" ? "desc" : "asc")
      return
    }
    setSort(column)
    setDirection("desc")
  }

  const refresh = React.useCallback(async () => {
    setBusy(true)
    try {
      setRuns(await loadFlowRuns())
      setError(null)
    } catch (loadError) {
      setError(getFlowRunErrorMessage(loadError))
    } finally {
      setBusy(false)
    }
  }, [])

  // A switched-on flow moves on its own, so the list follows it — and stops
  // the moment nothing is running. A page quietly asking after a table of
  // finished runs all afternoon is cost with no answer at the end of it.
  const anyRunning = runs.some((run) => run.status !== "stopped")
  React.useEffect(() => {
    if (!anyRunning) return
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [anyRunning, refresh])

  /** Only runs that are over. A switched-on one is stopped, never deleted. */
  const deletable = React.useMemo(
    () => runs.filter((run) => run.status === "stopped").map((run) => run.id),
    [runs]
  )
  const chosen = [...selected].filter((id) => deletable.includes(id))

  /** Pause, resume and stop share one shape: do it, say so, redraw at once. */
  const act = async (
    row: FlowRunListRow,
    what: () => Promise<{ summary: string }>
  ) => {
    setActingId(row.id)
    try {
      const answer = await what()
      toast.success(answer.summary)
      setStopping(null)
      await refresh()
    } catch (error) {
      showErrorToast(flowActionProblem(error, row.walletLabel))
    } finally {
      setActingId(null)
    }
  }

  const remove = async (ids: string[]) => {
    setDeleteBusy(true)
    try {
      const { deleted } = await removeFlowRuns(ids)
      toast.success(
        describeBulkResult({
          done: deleted.length,
          kept: ids.length - deleted.length,
          one: "run",
          many: "runs",
          verb: "deleted",
        })
      )
      clear()
      await refresh()
    } catch (error) {
      showErrorToast(getFlowRunErrorMessage(error))
    } finally {
      setDeleteBusy(false)
      setDeleting(null)
    }
  }

  const sorted = React.useMemo(() => {
    const way = direction === "asc" ? 1 : -1
    return [...runs].sort((left, right) => {
      // A run that is still switched on always sits above the finished ones,
      // whichever column is sorted: it is the only kind of row on this page
      // that somebody may need to act on.
      const running = (row: FlowRunListRow) =>
        row.status === "stopped" ? 1 : 0
      if (running(left) !== running(right))
        return running(left) - running(right)
      switch (sort) {
        case "flow":
          return way * left.automationName.localeCompare(right.automationName)
        case "wallet":
          return way * left.walletLabel.localeCompare(right.walletLabel)
        case "working":
          return way * (left.working - right.working)
        case "net":
          return way * (left.netUsd - right.netUsd)
        default:
          return way * (left.startedAt - right.startedAt)
      }
    })
  }, [runs, sort, direction])

  const head = (label: string, column: Column) => (
    <TableHead column="meta">
      <TableSortButton
        active={sort === column}
        direction={direction}
        onClick={() => toggleSort(column)}
      >
        {label}
      </TableSortButton>
    </TableHead>
  )

  return (
    <>
      <DashboardTable
        title="Live runs"
        icon={<ActivityIcon />}
        count={sorted.length}
        busy={busy}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        selectedCount={chosen.length}
        onClearSelection={clear}
        controls={
          chosen.length ? (
            <DashboardToolbarButton
              type="button"
              variant="destructive"
              onClick={() => setDeleting(chosen)}
            >
              <Trash2Icon className="size-4" />
              Delete ({chosen.length})
            </DashboardToolbarButton>
          ) : null
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={selectAllState(deletable)}
                  onCheckedChange={() => toggleVisible(deletable)}
                  aria-label="Select every finished run"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={sort === "flow"}
                  direction={direction}
                  onClick={() => toggleSort("flow")}
                >
                  Canvas
                </TableSortButton>
              </TableHead>
              {head("Wallet", "wallet")}
              {head("Working", "working")}
              {head("Made or lost", "net")}
              {head("Started", "started")}
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={sorted.length === 0}
        emptyText="No flow has been switched on yet. Draw a wallet, the coins to trade and a strategy on an automation canvas, then switch it on above the canvas."
        emptyColSpan={7}
        footer={{ type: "summary", count: sorted.length, label: "run" }}
      >
        {sorted.map((row) => (
          <TableRow
            key={row.id}
            rowAction={() =>
              void router.navigate({
                to: "/flow-runs/$runId",
                params: { runId: row.id },
              })
            }
          >
            <TableCell column="select">
              <Checkbox
                checked={selected.has(row.id)}
                disabled={row.status !== "stopped"}
                onCheckedChange={() => toggle(row.id)}
                aria-label={`Select ${row.automationName}`}
              />
            </TableCell>
            <TableCell column="main">
              <div className="flex min-w-0 items-center gap-2">
                <Link
                  to="/flow-runs/$runId"
                  params={{ runId: row.id }}
                  className="min-w-0 truncate font-medium hover:underline"
                >
                  {row.automationName}
                </Link>
                {/* Real money is said in words, never in colour alone. */}
                {row.real ? (
                  <Badge variant="destructive">Real money</Badge>
                ) : null}
                {row.status !== "stopped" ? (
                  <Badge variant="default">
                    {row.status === "stopping"
                      ? "Stopping"
                      : row.paused
                        ? "Paused"
                        : row.holding
                          ? "Waiting"
                          : "Running"}
                  </Badge>
                ) : null}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {row.status === "running"
                  ? `${row.coins} ${plural(row.coins, "coin", "coins")}`
                  : row.status === "stopping"
                    ? `${row.working} ${plural(row.working, "ladder", "ladders")} left to call off`
                    : (row.stoppedReason ?? "Stopped.")}
              </p>
            </TableCell>
            <TableCell column="meta">
              {row.walletLabel}
              <span className="block text-xs text-muted-foreground">
                {row.venue}
              </span>
            </TableCell>
            <TableCell column="meta" className="tabular-nums">
              {row.status === "running"
                ? `${row.working} of ${row.coins}`
                : row.status === "stopping"
                  ? `${row.working} left`
                  : "—"}
              {row.holdingCoins > 0 ? (
                <span className="block text-xs text-muted-foreground">
                  holding {row.holdingCoins}
                </span>
              ) : null}
            </TableCell>
            <TableCell
              column="meta"
              className={cn("tabular-nums", toneClass(row.netUsd))}
            >
              {row.tradesClosed === 0 ? "—" : signedUsd(row.netUsd)}
              <span className="block text-xs text-muted-foreground">
                {row.tradesClosed} {plural(row.tradesClosed, "trade", "trades")}
              </span>
            </TableCell>
            <TableCell
              column="meta"
              title={formatDateTime(new Date(row.startedAt))}
            >
              {formatRelativeTime(new Date(row.startedAt), formatDateTime)}
            </TableCell>
            <TableCell column="actions">
              <div className="flex justify-end gap-1">
                {row.status === "running" ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={actingId === row.id}
                      aria-label={
                        row.paused
                          ? `Resume ${row.automationName}`
                          : `Pause ${row.automationName}`
                      }
                      onClick={() =>
                        void act(row, () =>
                          pauseFlow(row.automationId, !row.paused)
                        )
                      }
                    >
                      {row.paused ? (
                        <PlayIcon className="size-3.5" />
                      ) : (
                        <PauseIcon className="size-3.5" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={actingId === row.id}
                      aria-label={`Stop ${row.automationName}`}
                      onClick={() => setStopping(row)}
                    >
                      <SquareIcon className="size-3.5" />
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  // A switched-on run is not something to delete on the way
                  // past: its row is what holds the wallet and what says on the
                  // canvas that a flow is trading. Switch it off first.
                  disabled={row.status !== "stopped"}
                  aria-label={`Delete the run of ${row.automationName}`}
                  onClick={() => setDeleting([row.id])}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <ConfirmDialog
        open={stopping !== null}
        onOpenChange={(open) => {
          if (!open) setStopping(null)
        }}
        title="Stop this flow?"
        description={
          <>
            It stops looking for coins and calls off the{" "}
            {plural(stopping?.working ?? 0, "ladder", "ladders")} it placed that
            have not bought anything. A coin already held keeps its position,
            its stop and its target. To leave everything exactly as it is, use{" "}
            <strong>Pause</strong> instead.
          </>
        }
        confirmLabel="Stop it"
        loading={stopping !== null && actingId === stopping.id}
        onConfirm={() => {
          if (stopping)
            void act(stopping, () => stopFlow(stopping.automationId))
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={
          deleting && deleting.length > 1
            ? `Delete ${deleting.length} runs?`
            : "Delete this run?"
        }
        description="What it was set up to do, what it was waiting on and which orders it sent all go. The trades themselves stay — they are made of fills, which are kept forever — but they stop being tied to the run that made them."
        confirmLabel="Delete"
        loading={deleteBusy}
        onConfirm={() => {
          if (deleting) void remove(deleting)
        }}
      />
    </>
  )
}
