import * as React from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { ActivityIcon } from "lucide-react"

import { signedUsd, toneClass, usd } from "@/components/backtest/backtest-kpi"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { Badge } from "@/components/ui/badge"
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
  type FlowRunListRow,
} from "@/lib/api/flow-runs"
import { formatDateTime, formatRelativeTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
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
 * There is no rename, pin or delete here, deliberately. A backtest is a
 * document somebody made; a run is a record of money that moved, and tidying
 * one away is not a thing this screen should offer.
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
  const anyRunning = runs.some((run) => run.status === "running")
  React.useEffect(() => {
    if (!anyRunning) return
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [anyRunning, refresh])

  const sorted = React.useMemo(() => {
    const way = direction === "asc" ? 1 : -1
    return [...runs].sort((left, right) => {
      // A run that is still switched on always sits above the finished ones,
      // whichever column is sorted: it is the only kind of row on this page
      // that somebody may need to act on.
      const running = (row: FlowRunListRow) => (row.status === "running" ? 0 : 1)
      if (running(left) !== running(right)) return running(left) - running(right)
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
    <DashboardTable
      title="Live runs"
      icon={<ActivityIcon />}
      count={sorted.length}
      busy={busy}
      error={error ? { message: error, onRetry: () => void refresh() } : null}
      header={
        <TableHeader>
          <TableRow>
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
          </TableRow>
        </TableHeader>
      }
      isEmpty={sorted.length === 0}
      emptyText="No flow has been switched on yet. Draw a wallet, the coins to trade and a strategy on an automation canvas, then switch it on above the canvas."
      emptyColSpan={5}
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
              {row.real ? <Badge variant="destructive">Real money</Badge> : null}
              {row.status === "running" ? (
                <Badge variant="default">
                  {row.paused ? "Paused" : row.holding ? "Waiting" : "Running"}
                </Badge>
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {row.status === "running"
                ? `${row.coins} ${plural(row.coins, "coin", "coins")} · up to ${usd(row.capUsd)}`
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
            {row.status === "running" ? `${row.working} of ${row.coins}` : "—"}
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
        </TableRow>
      ))}
    </DashboardTable>
  )
}
