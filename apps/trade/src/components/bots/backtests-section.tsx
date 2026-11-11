import * as React from "react"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  PinIcon,
  Trash2Icon,
} from "lucide-react"

import { BacktestPreviewPanel } from "@/components/backtest/backtest-preview-panel"
import { backtestDurationText, backtestElapsedMs, useBacktestClock } from "@/components/backtest/backtest-duration"
import { signedUsd, usd } from "@/components/backtest/backtest-kpi"
import { BacktestRunPage, type BacktestCoinRow, type BacktestRunView } from "@/components/backtest/backtest-run-page"
import type { BotsSectionProps } from "@/components/bots/bots-dashboard"
import { RecordMenu, type RecordAction } from "@/components/bots/bots-record"
import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow, SelectedMenuSeparator } from "@/components/shared/mass-select"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import {
  archiveBacktests,
  deleteBacktests,
  getBacktestErrorMessage,
  loadBacktests,
  pinBacktests,
  renameBacktest,
} from "@/lib/api/trade/backtests"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDateTime, formatRelativeTime } from "@/lib/format/format-time"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { showErrorToast } from "@/lib/toast/error-toast"
import { ErrorRow } from "@/components/ui/error-row"
import type { BacktestListRow } from "@/lib/trade/backtest/result"
import { backtestName } from "@/lib/trade/backtest/backtest-name"
import type { ChartView } from "@/lib/trade/chart-view"
import type { TradePanelLayouts } from "@/lib/trade/panel-layout"

/** What the route read for Backtests: the list, and the run opened in the middle. */
export type BacktestsLoaded = {
  view: "backtests"
  runs: BacktestListRow[]
  opened: {
    run: BacktestRunView
    coins: BacktestCoinRow[]
    panelLayouts: TradePanelLayouts
    /** The Trade chart's remembered view, which a coin's chart opens at. */
    chartView: ChartView | null
  } | null
}

type Column = "name" | "coins" | "madeOrLost" | "worstDip" | "ran" | "took"

const COLUMNS = [
  { key: "name", label: "Name", column: "main" },
  { key: "coins", label: "Coins", column: "meta", className: "hidden @3xl:table-cell" },
  { key: "madeOrLost", label: "Made or lost", column: "meta" },
  { key: "worstDip", label: "Worst dip", column: "meta", className: "hidden @4xl:table-cell" },
  { key: "ran", label: "Ran", column: "meta", className: "hidden @2xl:table-cell" },
  { key: "took", label: "Took", column: "meta", className: "hidden @5xl:table-cell" },
] as const

/** How often the list is read again while a run is still going. */
const REFRESH_MS = 2_000

const NAME_NOTE = "A named run is kept. An unnamed one is replaced the next time the same recipe finishes a backtest."

/**
 * Backtests on the Bots dashboard: every run, newest first, the pinned ones
 * on top. The table has no right panel: a line opens its chart at once
 * (Tyler, 9 Nov 2026: "it should go straight to the result chart"), with its
 * Result and Trades cards on the right.
 */
export function BacktestsSection({
  loaded,
  search,
  heading,
  headingEnd,
  frame,
  go,
  onChanged,
}: BotsSectionProps & { loaded: BacktestsLoaded }) {
  const showArchived = search.archived === true
  const [read, setRead] = React.useState({ from: loaded.runs, runs: loaded.runs })
  // A fresh answer from the route replaces the list, while rendering, so the old one never draws once more.
  if (read.from !== loaded.runs) setRead({ from: loaded.runs, runs: loaded.runs })
  const runs = read.runs
  const [massOn, setMassOn] = React.useState(false)
  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set())
  const [deleting, setDeleting] = React.useState<string[] | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  const [rowMenu, setRowMenu] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const { sort, direction, toggleSort } = useTableSort<Column>("ran", "desc")
  // A re-read that failed while backtests run: said under the header with Try
  // again, so old progress never sits there looking current.
  const [refreshError, setRefreshError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      const { runs: next } = await loadBacktests({ includeArchived: showArchived })
      setRead((was) => ({ from: was.from, runs: next }))
    } catch (error) {
      showErrorToast(getBacktestErrorMessage(error))
    }
  }, [showArchived])

  // A run still going moves on its own, so the list follows it, and stops the moment nothing runs.
  const anyRunning = runs.some((run) => run.finishedAt === null)
  const now = useBacktestClock(anyRunning)
  React.useEffect(() => {
    if (!anyRunning) return
    const timer = setInterval(() => {
      // Not while the browser tab is hidden: nobody is reading it.
      if (document.visibilityState !== "visible") return
      loadBacktests({ includeArchived: showArchived })
        .then(({ runs: next }) => {
          setRead((was) => ({ from: was.from, runs: next }))
          setRefreshError(null)
        })
        .catch((error: unknown) => setRefreshError(getBacktestErrorMessage(error)))
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [anyRunning, showArchived])

  const query = (search.q ?? "").trim().toLowerCase()
  // One recipe's backtests, from Filter → Recipe.
  const recipe = search.recipe
  // Every recipe that has a run in the list, by name, for the filter.
  const recipesRun = React.useMemo(() => {
    const names = new Map<string, string>()
    for (const run of runs) names.set(run.automationId, run.automationName)
    // A recipe with no run listed still shows as picked.
    if (recipe && !names.has(recipe)) names.set(recipe, "This recipe")
    return [...names].sort((a, b) => a[1].localeCompare(b[1]))
  }, [runs, recipe])
  const sorted = React.useMemo(() => {
    const way = direction === "asc" ? 1 : -1
    return runs
      .filter((run) => !recipe || run.automationId === recipe)
      .filter(
        (run) =>
          !query ||
          backtestName(run).toLowerCase().includes(query) ||
          run.automationName.toLowerCase().includes(query)
      )
      .sort((left, right) => {
        // Pinned rows float above the sort: pinning is somebody saying "keep this one where I can see it".
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
        switch (sort) {
          case "name":
            return way * backtestName(left).localeCompare(backtestName(right))
          case "coins":
            return way * (left.coinsTotal - right.coinsTotal)
          case "madeOrLost":
            return way * ((left.summary?.madeOrLost ?? 0) - (right.summary?.madeOrLost ?? 0))
          case "worstDip":
            return way * ((left.summary?.worstDipUsd ?? 0) - (right.summary?.worstDipUsd ?? 0))
          case "took":
            return way * (backtestElapsedMs(left, now) - backtestElapsedMs(right, now))
          default:
            return way * (left.createdAt - right.createdAt)
        }
      })
  }, [runs, query, sort, direction, now, recipe])

  const ids = sorted.map((run) => run.id)
  const openId = search.open
  const chosen = [...ticked].filter((id) => ids.includes(id))

  async function act(work: () => Promise<{ ids: string[]; total: number }>, words: { verb: string }) {
    try {
      const { ids: done, total } = await work()
      setTicked(new Set())
      await refresh()
      onChanged()
      // Only a refusal is said; what went through shows in the table.
      if (done.length < total) {
        showErrorToast(describeBulkResult({ done: done.length, kept: total - done.length, one: "backtest", many: "backtests", verb: words.verb }))
      }
    } catch (error) {
      showErrorToast(getBacktestErrorMessage(error))
    }
  }

  const pin = (run: BacktestListRow) =>
    void act(
      async () => ({ ids: (await pinBacktests([run.id], !run.pinned)).changed, total: 1 }),
      { verb: run.pinned ? "unpinned" : "pinned" }
    )
  const archive = (groupIds: string[], on: boolean) =>
    void act(async () => ({ ids: (await archiveBacktests(groupIds, on)).changed, total: groupIds.length }), {
      verb: on ? "archived" : "brought back",
    })
  const rename = async (run: BacktestListRow, name: string) => {
    try {
      await renameBacktest(run.id, name)
      await refresh()
    } catch (error) {
      showErrorToast(getBacktestErrorMessage(error))
    }
  }


  const actionsFor = (run: BacktestListRow): RecordAction[] => [
    { label: run.pinned ? "Unpin" : "Pin to top", icon: <PinIcon className="size-4" />, onClick: () => pin(run) },
    {
      label: run.archived ? "Bring back" : "Archive",
      icon: run.archived ? <ArchiveRestoreIcon className="size-4" /> : <ArchiveIcon className="size-4" />,
      onClick: () => archive([run.id], !run.archived),
    },
    { label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onClick: () => setDeleting([run.id]) },
  ]
  const menuFor = (run: BacktestListRow) => (
    <RecordMenu
      label="Backtest menu"
      name={{
        value: run.name ?? "",
        placeholder: backtestName({ ...run, name: null }),
        note: NAME_NOTE,
        onCommit: (name) => void rename(run, name),
      }}
      actions={actionsFor(run)}
    />
  )

  const windows = (
    <>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={deleting && deleting.length > 1 ? `Delete ${deleting.length} backtests?` : "Delete this backtest?"}
        description="Its trades and its chart go with it. This cannot be undone."
        confirmLabel="Delete"
        loading={deleteBusy}
        onConfirm={() => {
          if (!deleting) return
          const gone = deleting
          setDeleteBusy(true)
          void act(async () => ({ ids: (await deleteBacktests(gone)).deleted, total: gone.length }), { verb: "deleted" })
            .then(() => {
              // An opened run that was deleted leaves for its table.
              if (search.full && openId && gone.includes(openId)) go({ view: "backtests" })
            })
            .finally(() => {
              setDeleteBusy(false)
              setDeleting(null)
            })
        }}
      />
      {rowMenu ? (
        <CrmRowMenu
          at={rowMenu}
          massSelect={{
            on: massOn,
            onToggle: () => {
              setMassOn(!massOn)
              setTicked(massOn ? new Set() : new Set([rowMenu.id]))
            },
          }}
          items={[
            { label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setDeleting([rowMenu.id]) },
          ]}
          onClose={() => setRowMenu(null)}
        />
      ) : null}
    </>
  )

  // Opened: the run's chart in the middle, its Result and Trades cards on the right.
  if (search.full && loaded.opened && loaded.opened.run.id === openId) {
    const opened = loaded.opened
    const listed = runs.find((run) => run.id === opened.run.id)
    return (
      <BacktestRunPage
        key={opened.run.id}
        run={opened.run}
        coins={opened.coins}
        openCoin={search.coin && opened.coins.some((coin) => coin.marketKey === search.coin) ? search.coin : null}
        chartView={opened.chartView}
        initialPanelLayouts={opened.panelLayouts}
        heading={headingEnd}
        menu={listed ? menuFor(listed) : null}
        onCoin={(coin, push) => go({ ...search, coin }, { push })}
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
              <>
                <SelectedMenuRow
                  onClick={() => {
                    menu.close()
                    archive(chosen, !showArchived)
                  }}
                >
                  {showArchived ? <ArchiveRestoreIcon className="size-4" /> : <ArchiveIcon className="size-4" />}
                  {showArchived ? "Bring back" : "Archive"}
                </SelectedMenuRow>
                <SelectedMenuSeparator />
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
              </>
            )}
          />
        ) : null
      }
      filter={
        <FilterPopover
          count={(showArchived ? 1 : 0) + (recipe ? 1 : 0)}
          onClear={() => go({ ...search, archived: undefined, recipe: undefined })}
          save={null}
        >
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="backtests-recipe">Recipe</FieldLabel>
            <Select
              value={recipe ?? "all"}
              onValueChange={(value) => go({ ...search, recipe: value === "all" ? undefined : value })}
            >
              <SelectTrigger id="backtests-recipe" className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every recipe</SelectItem>
                {recipesRun.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <FieldLabel htmlFor="backtests-which">Which runs</FieldLabel>
            <Select
              value={showArchived ? "archived" : "current"}
              onValueChange={(value) => go({ ...search, archived: value === "archived" ? true : undefined })}
            >
              <SelectTrigger id="backtests-which" className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current runs</SelectItem>
                <SelectItem value="archived">Including archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FilterPopover>
      }
      menuLabel="More for backtests"
      search={{
        name: "backtests-search",
        label: "Search backtests",
        placeholder: "Search backtests",
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

  const allTicked = ids.length > 0 && ids.every((id) => ticked.has(id))
  const table = (
    <CrmTable
      columns={[...COLUMNS]}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      select={
        massOn
          ? {
              noun: "backtests",
              checked: allTicked ? true : ids.some((id) => ticked.has(id)) ? "indeterminate" : false,
              onToggle: () => {
                if (ids.length === 0) {
                  showErrorToast("There are no backtests here to tick.")
                  return
                }
                setTicked(allTicked ? new Set() : new Set(ids))
              },
            }
          : null
      }
      empty={
        sorted.length > 0 ? null : query || recipe ? (
          <span className="grid justify-items-center gap-2">
            {query
              ? `No backtests match "${search.q}".`
              : "This recipe has no backtests here yet. Open it and press Backtest above its canvas."}
            <Button type="button" variant="outline" size="sm" onClick={() => go({ view: "backtests" })}>
              Clear filters
            </Button>
          </span>
        ) : (
          "No backtests yet. Give a recipe a pretend wallet, then press Backtest above its canvas."
        )
      }
    >
      {sorted.map((run) => (
        <CrmTableRow
          key={run.id}
          open={run.id === openId}
          label={backtestName(run)}
          tick={
            massOn
              ? {
                  shown: true,
                  ticked: ticked.has(run.id),
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
          // A line is picked, its Result on the right; Open chart there opens
          // its chart and graph in the middle.
          onOpen={() => go({ ...search, open: run.id, full: undefined, coin: undefined })}
          onDelete={() => setDeleting([run.id])}
          onRightClick={(x, y) => setRowMenu({ id: run.id, x, y })}
        >
          <MainCell
            name={backtestName(run)}
            lead={run.pinned ? <PinIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Pinned" /> : null}
          >
            {run.finishedAt === null ? <Chip>{`${run.coinsDone} of ${run.coinsTotal}`}</Chip> : null}
            {run.archived ? <Chip muted>Archived</Chip> : null}
          </MainCell>
          <TableCell column="meta" className="hidden tabular-nums @3xl:table-cell">
            {run.coinsTotal}
          </TableCell>
          <TableCell column="meta" className="tabular-nums">
            {run.summary ? signedUsd(run.summary.madeOrLost) : "None yet"}
          </TableCell>
          <TableCell column="meta" className="hidden tabular-nums @4xl:table-cell">
            {run.summary ? usd(run.summary.worstDipUsd) : "None yet"}
          </TableCell>
          <TableCell column="meta" className="hidden @2xl:table-cell" title={formatDateTime(new Date(run.createdAt))}>
            {formatRelativeTime(new Date(run.createdAt), formatDateTime)}
          </TableCell>
          <TableCell column="meta" className="hidden whitespace-nowrap tabular-nums @5xl:table-cell">
            {backtestDurationText(run, now)}
          </TableCell>
        </CrmTableRow>
      ))}
    </CrmTable>
  )

  const retryRefresh = () => {
    loadBacktests({ includeArchived: showArchived })
      .then(({ runs: next }) => {
        setRead((was) => ({ from: was.from, runs: next }))
        setRefreshError(null)
      })
      .catch((error: unknown) => setRefreshError(getBacktestErrorMessage(error)))
  }
  const middle = (
    <>
      {refreshError ? <ErrorRow message={refreshError} onRetry={retryRefresh} className="shrink-0 border-b" /> : null}
      {table}
    </>
  )

  // The line picked shows its Result card on the right, with Open chart in
  // the footer (Tyler, 10 Nov 2026: "clicking on the table item should open
  // up the right panel to show the results and in the footer have a button to
  // click on to show the chart and graph").
  const picked = loaded.opened && loaded.opened.run.id === openId ? loaded.opened : null
  const pickedRow = picked ? runs.find((run) => run.id === picked.run.id) : undefined
  const right = picked
    ? {
        label: "Backtest",
        content: (
          <BacktestPreviewPanel
            key={picked.run.id}
            run={picked.run}
            coins={picked.coins}
            menu={pickedRow ? menuFor(pickedRow) : null}
            onOpen={() => go({ ...search, open: picked.run.id, full: true }, { push: true })}
          />
        ),
      }
    : undefined

  return frame({ header, middle, right, ids, openId, windows })
}
