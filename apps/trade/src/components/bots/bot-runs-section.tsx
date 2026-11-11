import * as React from "react"
import { Trash2Icon } from "lucide-react"

import { toneClass } from "@/components/backtest/backtest-kpi"
import type { BotsSectionProps } from "@/components/bots/bots-dashboard"
import { RecordMenu } from "@/components/bots/bots-record"
import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { FlowRunPage } from "@/components/flow-run/flow-run-page"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell } from "@/components/ui/table"
import {
  getFlowRunErrorMessage,
  loadFlowRuns,
  removeFlowRuns,
  type FlowRunListRow,
  type FlowRunReport,
} from "@/lib/api/trade/flow-runs"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDateTime, formatRelativeTime } from "@/lib/format/format-time"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { showErrorToast } from "@/lib/toast/error-toast"
import { ErrorRow } from "@/components/ui/error-row"
import type { ChartView } from "@/lib/trade/chart-view"
import { formatSignedUsd } from "@/lib/trade/format"
import type { TradePanelLayouts } from "@/lib/trade/panel-layout"

/** What the route read for Bots: every run, and the one opened in the middle. */
export type BotRunsLoaded = {
  view: "bots"
  runs: FlowRunListRow[]
  opened: { report: FlowRunReport; chartView: ChartView | null; panelLayouts: TradePanelLayouts } | null
}

type Column = "flow" | "wallet" | "working" | "net" | "started"

const COLUMNS = [
  { key: "flow", label: "Bot", column: "main" },
  { key: "wallet", label: "Wallet", column: "meta", className: "hidden @3xl:table-cell" },
  { key: "working", label: "Coins working", column: "meta", className: "hidden @4xl:table-cell" },
  { key: "net", label: "Made or lost", column: "meta" },
  { key: "started", label: "Started", column: "meta", className: "hidden @2xl:table-cell" },
] as const

/** How often the list is read again while anything is still switched on. */
const REFRESH_MS = 5_000

/** What a run is doing, in a word. */
function stateOf(row: FlowRunListRow) {
  if (row.status === "stopped") return "Stopped"
  if (row.status === "stopping") return "Stopping"
  if (row.paused) return "Paused"
  return row.holding ? "Waiting" : "Running"
}


/**
 * Bots on the Bots dashboard: every recipe ever switched on with a real or
 * practice wallet, newest first, the ones still switched on above the rest.
 * The table has no right panel: a line opens its chart at once (Tyler, 9 Nov
 * 2026: "same with bots dashboard"), its Result and Trades cards on the right,
 * and Pause and Stop in their footer. A run is a record of money that moved,
 * so it has no rename or pin, and one still switched on is stopped, never
 * deleted.
 */
export function BotRunsSection({
  loaded,
  search,
  heading,
  headingEnd,
  frame,
  go,
  openElsewhere,
  onChanged,
}: BotsSectionProps & { loaded: BotRunsLoaded }) {
  const [read, setRead] = React.useState({ from: loaded.runs, runs: loaded.runs })
  if (read.from !== loaded.runs) setRead({ from: loaded.runs, runs: loaded.runs })
  const runs = read.runs
  const [massOn, setMassOn] = React.useState(false)
  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set())
  const [deleting, setDeleting] = React.useState<string[] | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  const [rowMenu, setRowMenu] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const { sort, direction, toggleSort } = useTableSort<Column>("started", "desc")
  // A re-read that failed while bots run: said under the header with Try
  // again, so old figures never sit there looking current.
  const [refreshError, setRefreshError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      const next = await loadFlowRuns()
      setRead((was) => ({ from: was.from, runs: next }))
    } catch (error) {
      showErrorToast(getFlowRunErrorMessage(error))
    }
  }, [])

  // A switched-on bot moves on its own, so the list follows it, and stops the moment nothing runs.
  const anyRunning = runs.some((run) => run.status !== "stopped")
  React.useEffect(() => {
    if (!anyRunning) return
    const timer = setInterval(() => {
      // Not while the browser tab is hidden: nobody is reading it.
      if (document.visibilityState !== "visible") return
      loadFlowRuns()
        .then((next) => {
          setRead((was) => ({ from: was.from, runs: next }))
          setRefreshError(null)
        })
        .catch((error: unknown) => setRefreshError(getFlowRunErrorMessage(error)))
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [anyRunning])

  const query = (search.q ?? "").trim().toLowerCase()
  const sorted = React.useMemo(() => {
    const way = direction === "asc" ? 1 : -1
    return runs
      .filter(
        (run) =>
          !query || run.automationName.toLowerCase().includes(query) || run.walletLabel.toLowerCase().includes(query)
      )
      .sort((left, right) => {
        // A bot still switched on sits above the finished ones: it is the only kind somebody may need to act on.
        const on = (row: FlowRunListRow) => (row.status === "stopped" ? 1 : 0)
        if (on(left) !== on(right)) return on(left) - on(right)
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
  }, [runs, query, sort, direction])

  const ids = sorted.map((run) => run.id)
  const openId = search.open
  // Only finished bots can be ticked: one still switched on is stopped, never deleted.
  const deletable = sorted.filter((run) => run.status === "stopped").map((run) => run.id)
  const chosen = [...ticked].filter((id) => deletable.includes(id))

  const remove = async (gone: string[]) => {
    setDeleteBusy(true)
    try {
      const { deleted } = await removeFlowRuns(gone)
      if (deleted.length < gone.length) {
        showErrorToast(describeBulkResult({ done: deleted.length, kept: gone.length - deleted.length, one: "run", many: "runs", verb: "deleted" }))
      }
      setTicked(new Set())
      await refresh()
      onChanged()
      if (search.full && openId && deleted.includes(openId)) go({ view: "bots" })
    } catch (error) {
      showErrorToast(getFlowRunErrorMessage(error))
    } finally {
      setDeleteBusy(false)
      setDeleting(null)
    }
  }

  // A switched-on bot holds its wallet, so it is stopped, never deleted. Delete
  // stays pressable and says so, rather than sitting greyed out with no word
  // of why (Tyler's rule: no greyed-out buttons while idle).
  const askDelete = (run: FlowRunListRow) => {
    if (run.status !== "stopped") {
      showErrorToast("Stop this bot first. A bot still switched on holds its wallet, so it is never deleted.")
      return
    }
    setDeleting([run.id])
  }

  const menuFor = (run: FlowRunListRow) => (
    <RecordMenu
      label="Bot menu"
      actions={[
        {
          label: "Delete",
          icon: <Trash2Icon className="size-4" />,
          destructive: true,
          onClick: () => askDelete(run),
        },
      ]}
    />
  )

  const windows = (
    <>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={deleting && deleting.length > 1 ? `Delete ${deleting.length} runs?` : "Delete this run?"}
        description="What it was set up to do, what it was waiting on and which orders it sent all go. The trades themselves stay, because they are made of fills, which are kept forever, but they stop being tied to the run that made them."
        confirmLabel="Delete"
        loading={deleteBusy}
        onConfirm={() => {
          if (deleting) void remove(deleting)
        }}
      />
      {rowMenu ? (
        <CrmRowMenu
          at={rowMenu}
          massSelect={{
            on: massOn,
            onToggle: () => {
              setMassOn(!massOn)
              setTicked(massOn || !deletable.includes(rowMenu.id) ? new Set() : new Set([rowMenu.id]))
            },
          }}
          items={[
            {
              label: "Delete",
              icon: <Trash2Icon className="size-4" />,
              destructive: true,
              onSelect: () => {
                const run = runs.find((one) => one.id === rowMenu.id)
                if (run) askDelete(run)
              },
            },
          ]}
          onClose={() => setRowMenu(null)}
        />
      ) : null}
    </>
  )

  if (search.full && loaded.opened && loaded.opened.report.head.id === openId) {
    const opened = loaded.opened
    const listed = runs.find((run) => run.id === opened.report.head.id)
    return (
      <FlowRunPage
        key={opened.report.head.id}
        initial={opened.report}
        openCoin={
          search.coin && opened.report.coins.some((coin) => coin.marketKey === search.coin) ? search.coin : null
        }
        chartView={opened.chartView}
        initialPanelLayouts={opened.panelLayouts}
        heading={headingEnd}
        menu={listed ? menuFor(listed) : null}
        onCoin={(coin) => go({ ...search, coin })}
        onRunAgain={(runId) => {
          onChanged()
          openElsewhere("bots", runId)
        }}
        frame={(panels) => frame({ ...panels, ids, openId, windows })}
      />
    )
  }

  const header = (
    <CrmListHeader
      tabs={heading}
      selected={
        chosen.length ? (
          <SelectedMenu
            count={chosen.length}
            onClear={() => setTicked(new Set())}
            pages={{}}
            main={(menu) => (
              <SelectedMenuRow
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  menu.close()
                  setDeleting(chosen)
                }}
              >
                <Trash2Icon className="size-4" />
                Delete
              </SelectedMenuRow>
            )}
          />
        ) : null
      }
      menuLabel="More for bots"
      search={{
        name: "bots-search",
        label: "Search bots",
        placeholder: "Search bots",
        value: search.q ?? "",
        onChange: (q) => go({ ...search, q: q || undefined }),
      }}
      massSelect={{
        on: massOn,
        onToggle: () => {
          setMassOn(!massOn)
          setTicked(new Set())
        },
      }}
    />
  )

  const allTicked = deletable.length > 0 && deletable.every((id) => ticked.has(id))
  const table = (
    <CrmTable
      columns={[...COLUMNS]}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      select={
        massOn
          ? {
              noun: "finished runs",
              checked: allTicked ? true : deletable.some((id) => ticked.has(id)) ? "indeterminate" : false,
              onToggle: () => {
                if (deletable.length === 0) {
                  showErrorToast("No bot here is stopped yet. Only a stopped bot can be ticked.")
                  return
                }
                setTicked(allTicked ? new Set() : new Set(deletable))
              },
            }
          : null
      }
      empty={
        sorted.length > 0 ? null : query ? (
          <span className="grid justify-items-center gap-2">
            {`No bots match "${search.q}".`}
            <Button type="button" variant="outline" size="sm" onClick={() => go({ view: "bots" })}>
              Clear filters
            </Button>
          </span>
        ) : (
          "No bot has been switched on yet. Give a recipe a saved wallet, then press Run recipe above its canvas."
        )
      }
    >
      {sorted.map((run) => (
        <CrmTableRow
          key={run.id}
          open={run.id === openId}
          label={run.automationName}
          tick={
            massOn
              ? {
                  shown: true,
                  ticked: ticked.has(run.id),
                  // A switched-on bot keeps the column's place but has no box.
                  none: run.status !== "stopped",
                  onToggle: () =>
                    setTicked((current) => {
                      const next = new Set(current)
                      if (next.has(run.id)) next.delete(run.id)
                      else next.add(run.id)
                      return next
                    }),
                }
              : null
          }
          onOpen={() => go({ ...search, open: run.id, full: true }, { push: true })}
          onDelete={() => askDelete(run)}
          onRightClick={(x, y) => setRowMenu({ id: run.id, x, y })}
        >
          <MainCell name={run.automationName}>
            {/* Real money is said in words, never in colour alone. */}
            {run.real ? <Chip>Real money</Chip> : null}
            {run.status !== "stopped" ? <Chip>{stateOf(run)}</Chip> : null}
          </MainCell>
          <TableCell column="meta" className="hidden @3xl:table-cell">
            {run.walletLabel}
          </TableCell>
          <TableCell column="meta" className="hidden tabular-nums @4xl:table-cell">
            {run.status === "running"
              ? `${run.working} of ${run.coins}`
              : run.status === "stopping"
                ? `${run.working} left`
                : "None"}
          </TableCell>
          <TableCell column="meta" className={`tabular-nums ${toneClass(run.netUsd)}`}>
            {run.tradesClosed === 0 ? "No trades yet" : formatSignedUsd(run.netUsd)}
          </TableCell>
          <TableCell column="meta" className="hidden @2xl:table-cell" title={formatDateTime(new Date(run.startedAt))}>
            {formatRelativeTime(new Date(run.startedAt), formatDateTime)}
          </TableCell>
        </CrmTableRow>
      ))}
    </CrmTable>
  )

  // No right panel: a line opens its chart at once (Tyler, 9 Nov 2026: "it
  // should go straight to the result chart").
  const retryRefresh = () => {
    loadFlowRuns()
      .then((next) => {
        setRead((was) => ({ from: was.from, runs: next }))
        setRefreshError(null)
      })
      .catch((error: unknown) => setRefreshError(getFlowRunErrorMessage(error)))
  }
  const middle = (
    <>
      {refreshError ? <ErrorRow message={refreshError} onRetry={retryRefresh} className="shrink-0 border-b" /> : null}
      {table}
    </>
  )

  return frame({ header, middle, ids, openId, windows })
}
