import * as React from "react"
import { Link, useRouter } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  FlaskConicalIcon,
  PinIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { BacktestRenameDialog } from "@/components/backtest/backtest-rename-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
  archiveBacktests,
  deleteBacktests,
  getBacktestErrorMessage,
  loadBacktests,
  pinBacktests,
} from "@/lib/api/backtests"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDateTime, formatRelativeTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { BacktestListRow } from "@/lib/trade/backtest/result"
import { formatSignedUsd, formatUsd } from "@/lib/trade/format"

/**
 * Every backtest ever run, newest first, with the pinned ones on top.
 *
 * The columns are the four questions somebody actually has about an old run:
 * did it make money, how far down did it go on the way, what did it test, and
 * when. Everything heavier — the trades, the chart — waits until a row is
 * opened.
 */
type Column = "name" | "coins" | "madeOrLost" | "worstDip" | "ran"

export function BacktestsListPage({ initial }: { initial: BacktestListRow[] }) {
  const router = useRouter()
  const [runs, setRuns] = React.useState(initial)
  const [showArchived, setShowArchived] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [renaming, setRenaming] = React.useState<BacktestListRow | null>(null)
  const [deleting, setDeleting] = React.useState<string[] | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)

  const { selected, toggle, toggleVisible, clear, selectAllState } =
    useSelection()
  const { sort, direction, toggleSort } = useTableSort<Column>("ran", "desc")

  const refresh = React.useCallback(
    async (includeArchived: boolean) => {
      setBusy(true)
      try {
        const { runs: next } = await loadBacktests({ includeArchived })
        setRuns(next)
        setError(null)
      } catch (loadError) {
        setError(getBacktestErrorMessage(loadError))
      } finally {
        setBusy(false)
      }
    },
    []
  )

  // A run still going moves on its own, so the list follows it — and stops the
  // moment nothing is running.
  const anyRunning = runs.some((run) => run.finishedAt === null)
  React.useEffect(() => {
    if (!anyRunning) return
    const timer = setInterval(() => void refresh(showArchived), 2_000)
    return () => clearInterval(timer)
  }, [anyRunning, refresh, showArchived])

  const sorted = React.useMemo(() => {
    const way = direction === "asc" ? 1 : -1
    return [...runs].sort((left, right) => {
      // Pinned rows float above the sort, always: pinning is somebody saying
      // "keep this one where I can see it", and a sort that moved it would
      // undo the only thing pinning does.
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
      switch (sort) {
        case "name":
          return way * nameOf(left).localeCompare(nameOf(right))
        case "coins":
          return way * (left.coinsTotal - right.coinsTotal)
        case "madeOrLost":
          return (
            way * ((left.summary?.madeOrLost ?? 0) - (right.summary?.madeOrLost ?? 0))
          )
        case "worstDip":
          return (
            way *
            ((left.summary?.worstDipUsd ?? 0) - (right.summary?.worstDipUsd ?? 0))
          )
        default:
          return way * (left.createdAt - right.createdAt)
      }
    })
  }, [runs, sort, direction])

  const visibleIds = sorted.map((run) => run.id)
  const chosen = [...selected].filter((id) => visibleIds.includes(id))

  async function run(
    work: () => Promise<{ ids: string[]; total: number }>,
    words: { one: string; many: string; verb: string }
  ) {
    try {
      const { ids, total } = await work()
      clear()
      await refresh(showArchived)
      await router.invalidate()
      toast.success(
        describeBulkResult({
          done: ids.length,
          kept: total - ids.length,
          one: words.one,
          many: words.many,
          verb: words.verb,
        })
      )
    } catch (actionError) {
      showErrorToast(getBacktestErrorMessage(actionError))
    }
  }

  return (
    <>
      <DashboardTable
        title="Backtests"
        icon={<FlaskConicalIcon />}
        count={sorted.length}
        busy={busy}
        error={error ? { message: error, onRetry: () => void refresh(showArchived) } : null}
        selectedCount={chosen.length}
        onClearSelection={clear}
        controls={
          <>
            {chosen.length ? (
              <>
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void run(
                      async () => {
                        const { changed } = await archiveBacktests(chosen, !showArchived)
                        return { ids: changed, total: chosen.length }
                      },
                      showArchived
                        ? { one: "backtest", many: "backtests", verb: "brought back" }
                        : { one: "backtest", many: "backtests", verb: "archived" }
                    )
                  }
                >
                  {showArchived ? (
                    <ArchiveRestoreIcon className="size-4" />
                  ) : (
                    <ArchiveIcon className="size-4" />
                  )}
                  {showArchived ? "Bring back" : "Archive"} ({chosen.length})
                </DashboardToolbarButton>
                <DashboardToolbarButton
                  type="button"
                  variant="destructive"
                  onClick={() => setDeleting(chosen)}
                >
                  <Trash2Icon className="size-4" />
                  Delete ({chosen.length})
                </DashboardToolbarButton>
              </>
            ) : null}
            <Select
              value={showArchived ? "archived" : "current"}
              onValueChange={(value) => {
                const next = value === "archived"
                setShowArchived(next)
                void refresh(next)
              }}
            >
              <DashboardToolbarSelectTrigger aria-label="Which runs to show">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current runs</SelectItem>
                <SelectItem value="archived">Including archived</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={selectAllState(visibleIds)}
                  onCheckedChange={() => toggleVisible(visibleIds)}
                  aria-label="Select every run on screen"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={sort === "name"}
                  direction={direction}
                  onClick={() => toggleSort("name")}
                >
                  Run
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "coins"}
                  direction={direction}
                  onClick={() => toggleSort("coins")}
                >
                  Markets
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "madeOrLost"}
                  direction={direction}
                  onClick={() => toggleSort("madeOrLost")}
                >
                  Made or lost
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "worstDip"}
                  direction={direction}
                  onClick={() => toggleSort("worstDip")}
                >
                  Worst dip
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "ran"}
                  direction={direction}
                  onClick={() => toggleSort("ran")}
                >
                  Ran
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={sorted.length === 0}
        emptyText="No backtests yet. Draw a pretend wallet, the markets to test and a DCA ladder on an automation canvas, then press Run above it."
        emptyColSpan={7}
        footer={{ type: "summary", count: sorted.length, label: "run" }}
      >
        {sorted.map((row) => (
          <TableRow
            key={row.id}
            rowAction={() =>
              void router.navigate({
                to: "/backtests/$groupId",
                params: { groupId: row.id },
              })
            }
          >
            <TableCell column="select">
              <Checkbox
                checked={selected.has(row.id)}
                onCheckedChange={() => toggle(row.id)}
                aria-label={`Select ${nameOf(row)}`}
              />
            </TableCell>
            <TableCell column="main">
              <div className="flex min-w-0 items-center gap-2">
                {row.pinned ? (
                  <PinIcon className="size-3.5 shrink-0 text-muted-foreground" />
                ) : null}
                <Link
                  to="/backtests/$groupId"
                  params={{ groupId: row.id }}
                  className="min-w-0 truncate font-medium hover:underline"
                >
                  {nameOf(row)}
                </Link>
                {row.finishedAt === null ? (
                  <Badge variant="default">
                    {row.coinsDone} of {row.coinsTotal}
                  </Badge>
                ) : null}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {row.automationName} · {row.spec.days}{" "}
                {plural(row.spec.days, "day", "days")} of {row.spec.interval}{" "}
                candles from {formatUsd(row.spec.startingUsd)}
              </p>
            </TableCell>
            <TableCell column="meta">{row.coinsTotal}</TableCell>
            <TableCell column="meta" className="tabular-nums">
              {row.summary ? formatSignedUsd(row.summary.madeOrLost) : "—"}
            </TableCell>
            <TableCell column="meta" className="tabular-nums">
              {row.summary ? formatUsd(row.summary.worstDipUsd) : "—"}
            </TableCell>
            <TableCell column="meta" title={formatDateTime(new Date(row.createdAt))}>
              {formatRelativeTime(new Date(row.createdAt), formatDateTime)}
            </TableCell>
            <TableCell column="actions">
              <div className="flex justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={row.pinned ? `Unpin ${nameOf(row)}` : `Pin ${nameOf(row)}`}
                  onClick={() =>
                    void run(
                      async () => {
                        const { changed } = await pinBacktests([row.id], !row.pinned)
                        return { ids: changed, total: 1 }
                      },
                      {
                        one: "backtest",
                        many: "backtests",
                        verb: row.pinned ? "unpinned" : "pinned",
                      }
                    )
                  }
                >
                  <PinIcon
                    className={row.pinned ? "size-3.5 text-foreground" : "size-3.5"}
                  />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Rename ${nameOf(row)}`}
                  onClick={() => setRenaming(row)}
                >
                  <SettingsIcon className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${nameOf(row)}`}
                  onClick={() => setDeleting([row.id])}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <BacktestRenameDialog
        run={renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
        onSaved={() => {
          setRenaming(null)
          void refresh(showArchived)
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={
          deleting && deleting.length > 1
            ? `Delete ${deleting.length} backtests?`
            : "Delete this backtest?"
        }
        description="Its trades and its chart go with it. This cannot be undone."
        confirmLabel="Delete"
        loading={deleteBusy}
        onConfirm={() => {
          if (!deleting) return
          setDeleteBusy(true)
          void run(
            async () => {
              const { deleted } = await deleteBacktests(deleting)
              return { ids: deleted, total: deleting.length }
            },
            { one: "backtest", many: "backtests", verb: "deleted" }
          ).finally(() => {
            setDeleteBusy(false)
            setDeleting(null)
          })
        }}
      />
    </>
  )
}

/** An unnamed run says what it was, which is more use than "Untitled". */
function nameOf(run: BacktestListRow): string {
  return (
    run.name ??
    `${run.coinsTotal} ${plural(run.coinsTotal, "market", "markets")}, ${run.spec.days} ${plural(run.spec.days, "day", "days")}`
  )
}
