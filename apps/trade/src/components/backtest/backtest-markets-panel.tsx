import * as React from "react"
import { ListOrderedIcon, SkipForwardIcon } from "lucide-react"

import { signedUsd, toneClass, usd } from "@/components/backtest/backtest-kpi"
import {
  WorkspacePanelTab,
  WorkspacePanelTabsHeader,
} from "@/components/shared/workspace-panel-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import {
  BACKTEST_STATUS_LABELS,
  openPnlOf,
  whyNoLadder,
  type BacktestSkip,
} from "@/lib/trade/backtest/result"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { cn } from "@/lib/utils"

import type { BacktestCoinRow } from "./backtest-run-page"

/**
 * Every market the run tested — the same table the old app puts down the right of
 * its backtest screen: the coin, what it made, how far it fell, and how often
 * it won. Clicking one charts it.
 *
 * Win says "2/6", which already carries the trade count, so the separate Trades
 * column that used to sit beside it was the same number written twice — and it
 * was taking a quarter of a narrow panel to do it.
 *
 * **Two tabs, because there are two kinds of coin here.** Results holds the
 * ones that traded. Skipped holds every coin that produced nothing — whether
 * it was ruled out before the run began or walked the whole window without
 * opening a trade — with the reason in words beside it. They used to share one
 * table, where the ones that did nothing were dozens of identical rows of
 * $0.00, $0.00, 0/0 between the results you came to read.
 *
 * Sorted biggest-first on whichever figure you pick, with the totals pinned at
 * the bottom — a list of fifty coins is only readable from its ends, and the
 * total is the one number that says whether the strategy worked at all.
 *
 * Right-aligned columns flip their sort button so the arrow hugs the number,
 * exactly as `sortHead` does in the old app.
 */
type Column = "coin" | "net" | "dip" | "win"

type PanelTab = "results" | "skipped"

export function BacktestMarketsPanel({
  coins,
  skipped,
  openCoin,
  onOpenCoin,
}: {
  coins: readonly BacktestCoinRow[]
  /** Coins the run could not test at all, with the reason it gives. */
  skipped: readonly BacktestSkip[]
  openCoin: string | null
  onOpenCoin: (marketKey: string) => void
}) {
  const [tab, setTab] = React.useState<PanelTab>("results")
  const { sort, direction, toggleSort } = useTableSort<Column>("net", "desc")

  // **Every coin that produced nothing**, whichever way it produced nothing:
  // the ones ruled out before the walk began, and the ones the run walked all
  // the way through without ever opening a trade.
  //
  // They belong together because they are the same news. A coin that never
  // traded is a row of $0.00, $0.00, 0/0 — and on a 156-coin run there are
  // dozens of them, sitting between the real results and pushing them off the
  // screen. What you actually want to know about one is *why*, and that is a
  // sentence, not four zeroes. So they get a tab with a Why column instead.
  const skippedRows = React.useMemo(() => {
    const rows = new Map<string, { symbol: string; reason: string }>()
    for (const coin of coins) {
      if (coin.status === "skipped") {
        rows.set(coin.marketKey, {
          symbol: coin.symbol,
          reason: coin.skipReason ?? coin.error ?? "No reason recorded.",
        })
        continue
      }
      // Walked to the end and never opened a trade. `whyNoLadder` already works
      // out which of the reasons it was — waiting for a base, already under
      // one, or never affordable — and says it in words.
      if (coin.status === "done" && coin.summary && coin.summary.trades === 0) {
        rows.set(coin.marketKey, {
          symbol: coin.symbol,
          reason:
            whyNoLadder(coin.summary)?.words ??
            "Walked the whole window without a trade.",
        })
      }
    }
    for (const skip of skipped) {
      if (rows.has(skip.marketKey)) continue
      rows.set(skip.marketKey, { symbol: skip.symbol, reason: skip.reason })
    }
    return [...rows.entries()]
      .map(([marketKey, row]) => ({ marketKey, ...row }))
      .sort((left, right) => left.symbol.localeCompare(right.symbol))
  }, [coins, skipped])

  // What is left for the results table: the coins that actually traded, plus
  // any the run has not finished with yet — a live run's rows have no figures
  // and no verdict, and hiding them would look like the run had lost them.
  const walked = React.useMemo(
    () =>
      coins.filter(
        (coin) =>
          coin.status !== "skipped" &&
          !(coin.status === "done" && coin.summary && coin.summary.trades === 0)
      ),
    [coins]
  )

  const sorted = React.useMemo(() => {
    const way = direction === "asc" ? 1 : -1
    return [...walked].sort((left, right) => {
      // Three bands, always in this order however the column is sorted.
      //
      // The ones that traded come first — winners AND losers together, because
      // a coin that lost money is a result and belongs beside the ones that
      // made it. Under them, the coins that never traded: their $0.00 is an
      // absence, not a score, and letting it outrank every loser buries the
      // real news. At the bottom, the ones that could not be tested at all.
      if (bandOf(left) !== bandOf(right)) return bandOf(left) - bandOf(right)

      if (sort === "coin") return way * left.symbol.localeCompare(right.symbol)
      const pick: (row: BacktestCoinRow) => number =
        sort === "dip"
          ? (row) => row.summary?.worstDipUsd ?? 0
          : sort === "win"
            ? (row) => wonShare(row)
            : (row) => row.summary?.madeOrLost ?? 0
      return way * (pick(left) - pick(right))
    })
  }, [walked, sort, direction])

  const tested = sorted.filter((coin) => coin.summary)
  const total = (pick: (coin: BacktestCoinRow) => number) =>
    tested.reduce((sum, coin) => sum + pick(coin), 0)
  const wonTotal = total((coin) => coin.summary?.won ?? 0)
  const closedTotal = total((coin) => coin.summary?.closed ?? 0)
  const openPnlTotal = total((coin) =>
    coin.summary ? (openPnlOf(coin.summary) ?? 0) : 0
  )

  const head = (
    label: string,
    column: Column,
    width: string,
    right = false
  ) => (
    <TableHead column="meta" className={cn(width, right && "text-right")}>
      <TableSortButton
        active={sort === column}
        direction={direction}
        onClick={() => toggleSort(column)}
        // The shared heading is 14px with an 8px gap before its sort arrow,
        // while the figures under it are 12px — so every heading was wider
        // than its own column and "Trades" came out as "Trade". Matched to the
        // figures, which is the size that decides how wide the column has to
        // be anyway.
        className={cn(
          "gap-1 text-xs sm:text-xs",
          right && "ml-auto flex-row-reverse"
        )}
      >
        {label}
      </TableSortButton>
    </TableHead>
  )

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as PanelTab)}
      className="h-full min-h-0 flex-1 gap-0 overflow-hidden"
    >
      <WorkspacePanelTabsHeader>
        <WorkspacePanelTab
          value="results"
          icon={<ListOrderedIcon className="size-4" />}
          label="Results"
          count={tested.length}
        />
        {/* Always there, even at zero. A run where every coin traded is worth
            being able to check, and a tab that comes and goes is one you cannot
            learn the place of. */}
        <WorkspacePanelTab
          value="skipped"
          icon={<SkipForwardIcon className="size-4" />}
          label="Skipped"
          count={skippedRows.length}
        />
      </WorkspacePanelTabsHeader>

      <TabsContent value="results" className="flex min-h-0 flex-1 flex-col">
        {/* The scroll box's own inner element is `display: table`, which sizes
          itself to its CONTENTS. A table set to `w-full` inside it therefore
          measures 100% of ITSELF and grows as wide as its widest row, so the
          panel simply clipped whatever did not fit — the last columns
          disappeared off the right edge with no scrollbar to reach them.
          Making that element a plain block ties the width back to the panel,
          and the fixed column widths below then share out the panel's width
          instead of ignoring it. */}
        <ScrollArea
          className="min-h-0 flex-1"
          viewportClassName="[&>div]:block!"
        >
          {/* The old app's exact table type and padding: small text, 8px between
            columns and 12px at the two outside edges. The shared cell padding
            is a dashboard rule — 20px each side — and at this width it pushed
            the numbers so far right that a coin's name and its result were at
            opposite ends of the panel. Tightened here rather than in the
            primitive, which every dashboard table depends on. */}
          {/* `table-fixed` with the five widths as PERCENTAGES adding up to 100.
            
            Everything else was tried and each failed the same way. Left to
            itself, a table hands the spare width to whichever column has the
            widest content — the coin names — so a ticker sat a hand's width
            from its own result. `w-full` on that column was worse: it means
            "this column wants the whole table" and the browser adds the others
            ON TOP, so the table outgrew the panel and the last column fell off
            the edge. Fixed widths in PIXELS fail too: when their total is more
            than the panel, a fixed-layout table grows to fit the total rather
            than shrinking the columns.
            
            Percentages cannot do any of that. They always add up to the panel,
            whatever width it is dragged to, so nothing is ever clipped and the
            columns stay evenly spread instead of one of them hogging the room.
            The old app's type and spacing — small text, 8px between columns,
            12px at the outside edges — because the shared dashboard padding is
            20px a side and this panel does not have that to give. */}
          <Table className="table-fixed text-xs [&_td]:overflow-hidden [&_td]:px-1.5 [&_td]:text-ellipsis [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th]:overflow-hidden [&_th]:px-1.5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
            <TableHeader>
              <TableRow>
                {head("Market", "coin", "w-[30%]")}
                {head("Total", "net", "w-[27%]", true)}
                {head("Dip", "dip", "w-[22%]", true)}
                {head("Win", "win", "w-[21%]", true)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((coin) => {
                const noLadder = coin.summary ? whyNoLadder(coin.summary) : null
                const openPnl = coin.summary ? openPnlOf(coin.summary) : null
                return (
                  <TableRow
                    key={coin.id}
                    data-state={
                      coin.marketKey === openCoin ? "selected" : undefined
                    }
                    rowAction={
                      coin.summary
                        ? () => onOpenCoin(coin.marketKey)
                        : undefined
                    }
                  >
                    <TableCell column="meta" className="whitespace-nowrap">
                      <span
                        className={cn(
                          "font-medium",
                          coin.marketKey === openCoin &&
                            "underline underline-offset-4"
                        )}
                      >
                        {coin.symbol}
                      </span>
                      {coin.summary ? null : (
                        <span
                          className="ml-2 text-[10px] text-muted-foreground"
                          title={coin.skipReason ?? coin.error ?? undefined}
                        >
                          {BACKTEST_STATUS_LABELS[coin.status]}
                        </span>
                      )}
                      {/* A coin the run walked and never traded. Without this it is
                        a row of zeroes with nothing to ask — and working out
                        whether it was waiting for a base, already under one, or
                        simply unaffordable meant reading the price history by
                        hand against the ladder's settings. */}
                      {noLadder ? (
                        <span
                          className="ml-2 text-[10px] text-muted-foreground"
                          title={`${noLadder.bars} ${plural(noLadder.bars, "bar", "bars")}, last on ${formatDate(new Date(noLadder.lastAt))}`}
                        >
                          {noLadder.words}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell
                      column="meta"
                      className={cn(
                        "text-right tabular-nums",
                        toneClass(coin.summary?.madeOrLost)
                      )}
                    >
                      {coin.summary ? (
                        <span className="flex flex-col items-end">
                          <span>{signedUsd(coin.summary.madeOrLost)}</span>
                          {coin.summary.openAtEndUsd > 0 ? (
                            <span className="text-[10px] font-normal text-muted-foreground">
                              {openPnl === null
                                ? "open P&L unavailable"
                                : `${signedUsd(openPnl)} open`}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell
                      column="meta"
                      className="text-right tabular-nums"
                    >
                      {coin.summary ? usd(coin.summary.worstDipUsd) : "—"}
                    </TableCell>
                    {/* Win carries the count with it — "2/6" already says six
                      trades — so a column repeating the six was a column of
                      numbers that were on the row twice. */}
                    <TableCell
                      column="meta"
                      className="text-right tabular-nums"
                    >
                      {coin.summary
                        ? `${coin.summary.won}/${coin.summary.closed}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                )
              })}
              {/* The totals as the last row of the body: this table primitive
                has no footer, and a total that scrolled away with the rows
                would be the one number nobody could find. */}
              {tested.length > 0 ? (
                <TableRow className="border-t-2">
                  {/* "Traded", not "tested": the coins that were tested and did
                    nothing are in the Skipped tab now, and counting them here
                    would describe a list that is not on the screen. */}
                  <TableCell
                    column="meta"
                    className="font-medium whitespace-nowrap"
                  >
                    {tested.length} traded
                  </TableCell>
                  <TableCell
                    column="meta"
                    className={cn(
                      "text-right font-medium tabular-nums",
                      toneClass(total((coin) => coin.summary?.madeOrLost ?? 0))
                    )}
                  >
                    <span className="flex flex-col items-end">
                      <span>
                        {signedUsd(
                          total((coin) => coin.summary?.madeOrLost ?? 0)
                        )}
                      </span>
                      {openPnlTotal !== 0 ? (
                        <span className="text-[10px] font-normal text-muted-foreground">
                          {signedUsd(openPnlTotal)} open
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  {/* No total for the dip: adding up each coin's worst moment
                    would describe a day that never happened. The run's own dip
                    is on the left, measured on the one combined line. */}
                  <TableCell
                    column="meta"
                    className="text-right text-muted-foreground"
                  >
                    —
                  </TableCell>
                  <TableCell
                    column="meta"
                    className="text-right font-medium tabular-nums"
                  >
                    {wonTotal}/{closedTotal}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="skipped" className="flex min-h-0 flex-1 flex-col">
        <ScrollArea
          className="min-h-0 flex-1"
          viewportClassName="[&>div]:block!"
        >
          {skippedRows.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Every market on the list traded at least once.
            </p>
          ) : (
            <Table className="table-fixed text-xs [&_td]:px-1.5 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th]:px-1.5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
              <TableHeader>
                <TableRow>
                  <TableHead column="meta" className="w-[30%]">
                    Coin
                  </TableHead>
                  <TableHead column="meta" className="w-[70%]">
                    Why
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skippedRows.map((row) => (
                  <TableRow key={row.marketKey}>
                    <TableCell
                      column="meta"
                      className="font-medium whitespace-nowrap"
                    >
                      {row.symbol}
                    </TableCell>
                    {/* The reason in full, wrapped. It is usually a sentence
                        about missing history, and a truncated one leaves you
                        guessing at the only thing this row says. */}
                    <TableCell
                      column="meta"
                      className="whitespace-normal text-muted-foreground"
                    >
                      {row.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}

/**
 * Which band a coin sorts into: 0 it traded, 1 it did not, 2 it could not be
 * tested. Kept apart from the column sort so the bands never interleave.
 */
function bandOf(coin: BacktestCoinRow): number {
  if (!coin.summary) return 2
  return coin.summary.trades > 0 ? 0 : 1
}

/** How much of a coin's closed trades won, for the sort. */
function wonShare(coin: BacktestCoinRow): number {
  const summary = coin.summary
  if (!summary || summary.closed === 0) return -1
  return summary.won / summary.closed
}
