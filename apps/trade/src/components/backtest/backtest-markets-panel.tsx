import * as React from "react"

import { signedUsd, toneClass, usd } from "@/components/backtest/backtest-kpi"
import { MarketIcon } from "@/components/trade/market-icon"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
  whyNoLadder,
  type BacktestSkip,
} from "@/lib/trade/backtest/result"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { cn } from "@/lib/utils"

import type { BacktestCoinRow } from "./backtest-run-page"
import { listSkipped, type SkippedCoin } from "./skipped-coins"

/**
 * Every market the run tested — the same table the old app puts down the right of
 * its backtest screen: the coin, what it made, how far it fell, and how often
 * it won. Clicking one charts it.
 *
 * Win says "2/6", which already carries the trade count, so the separate Trades
 * column that used to sit beside it was the same number written twice — and it
 * was taking a quarter of a narrow panel to do it.
 *
 * **Two lists, because there are two kinds of coin here.** Traded holds the
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
 * **It looks like the Grid trades block** (Tyler, 10 Nov 2026: "revamp
 * backtest dashboard trades panel ... to this", with a picture of Grid
 * trades): each coin's logo before its name, every column left-aligned under
 * a small heading with its sort arrow after it, figures in the monospaced
 * font, Total coloured by whether it made or lost money, and Dip muted the
 * way Grid trades mutes Value. The styles are copied from
 * `smart-orders-panel.tsx`, so the two tables read as one.
 *
 * It is the body of the right panel's Trades card and of its Skipped card:
 * the card is the frame and the panel scrolls, so nothing here scrolls. As the
 * card narrows, Dip drops out first and then Win, so the coin and what it made
 * always have room.
 */
type Column = "coin" | "net" | "dip" | "win"

export type MarketsTab = "traded" | "skipped"

export function BacktestMarketsPanel({
  coins,
  skipped,
  openCoin,
  onOpenCoin,
  tab,
  icons,
}: {
  /** Which list shows: the Trades card's, or the Skipped card's. Neither has a header of its own. */
  tab: MarketsTab
  coins: readonly BacktestCoinRow[]
  /** Coins the run could not test at all, with the reason it gives. */
  skipped: readonly BacktestSkip[]
  openCoin: string | null
  onOpenCoin: (marketKey: string) => void
  /** Each coin's logo address by market key. A coin without one shows its first letter. */
  icons?: ReadonlyMap<string, string>
}) {
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
  const skippedRows = React.useMemo(() => listSkipped(coins, skipped), [coins, skipped])

  // What is left for the results table: the coins that actually traded, plus
  // any the run has not finished with yet — a live run's rows have no figures
  // and no verdict, and hiding them would look like the run had lost them.
  const walked = React.useMemo(
    () =>
      coins.filter(
        (coin) =>
          coin.status !== "skipped" &&
          coin.status !== "error" &&
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

  // The Grid trades heading: 12px, left-aligned, the arrow 2px after the
  // word. 12px because the figures under it are 12px, and a bigger heading
  // was wider than its own column ("Trades" came out as "Trade").
  const head = (label: string, column: Column, width: string) => (
    <TableHead className={cn(width, "px-1", HIDE[column])}>
      <TableSortButton
        active={sort === column}
        direction={direction}
        onClick={() => toggleSort(column)}
        className="gap-0.5 whitespace-nowrap sm:text-xs"
      >
        {label}
      </TableSortButton>
    </TableHead>
  )

  if (tab === "skipped") return <SkippedList rows={skippedRows} />

  return (
    // Fills the card's white tile edge to edge and straight under the
    // heading, as Grid trades' table fills its block's tile. The margins
    // undo the tile's own padding, read from the same settings the tile uses
    // (theme.css, [data-panel-card-tile]), so the table moves with them. The
    // heading row loses the table's grey band, as it does in a block.
    <div className="@container -mx-4 -mb-4 mt-[calc(var(--shell-panel-card-tile-top,0px)*-1)] [&_thead_tr]:bg-transparent">
          {/* `table-fixed` with the widths as PERCENTAGES. Left to itself a
            table hands the spare width to the coin names, so a ticker sat a
            hand's width from its own result; pixels outgrow a narrow panel.
            Percentages always add up to the card, whatever width it is
            dragged to. 4px either side of each column, as Grid trades has,
            and the card's own 16px at the outside edges. A coin's status
            note sits on a line of its own under its name, lined up with the
            name rather than the logo, as Grid trades' "Paused" does. */}
          <Table className="table-fixed [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th]:overflow-hidden [&_th:first-child]:pl-4 [&_th:last-child]:pr-4 [&_tbody_tr:first-child_td]:pt-2 [&_tbody_tr:last-child_td]:pb-2">
            <TableHeader>
              <TableRow>
                {head("Market", "coin", "w-[34%]")}
                {head("Total", "net", "w-[26%]")}
                {head("Dip", "dip", "w-[20%]")}
                {head("Win", "win", "w-[20%]")}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((coin) => {
                const noLadder = coin.summary ? whyNoLadder(coin.summary) : null
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
                    <TableCell className="py-1.5 pr-1 whitespace-nowrap">
                      <span className="flex min-w-0 items-center gap-1">
                        {/* A coin still holding a trade when the run ended shows a
                          green dot in place of its logo, with the money still in
                          it on hover (Tyler, 11 Nov 2026). */}
                        {coin.summary && coin.summary.openAtEndUsd > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                data-open-dot=""
                                aria-label={`${usd(coin.summary.openAtEndUsd)} still in this trade`}
                                className="flex size-4 shrink-0 items-center justify-center"
                              >
                                <span className="size-2 rounded-full bg-emerald-500" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {usd(coin.summary.openAtEndUsd)} still in this trade
                            </TooltipContent>
                          </Tooltip>
                        ) : icons?.get(coin.marketKey) ? (
                          <MarketIcon
                            symbol={coin.symbol}
                            iconUrl={icons.get(coin.marketKey) ?? null}
                          />
                        ) : (
                          // A coin out of trades with no logo gets a grey dot,
                          // not its first letter (Tyler, 11 Nov 2026).
                          <span
                            data-idle-dot=""
                            aria-hidden
                            className="flex size-4 shrink-0 items-center justify-center"
                          >
                            <span className="size-2 rounded-full bg-muted-foreground/40" />
                          </span>
                        )}
                        <span
                          className={cn(
                            "block min-w-0 truncate text-xs font-semibold",
                            coin.marketKey === openCoin &&
                              "underline underline-offset-4"
                          )}
                        >
                          {coin.symbol}
                        </span>
                      </span>
                      {coin.summary ? null : (
                        <Hint words={coin.skipReason ?? coin.error}>
                          <span className="block truncate pl-5 text-[10px] text-muted-foreground">
                            {(coin.status === "waiting" ||
                              coin.status === "running") &&
                            coin.progressNote
                              ? coin.progressNote
                              : BACKTEST_STATUS_LABELS[coin.status]}
                          </span>
                        </Hint>
                      )}
                      {/* A coin the run walked and never traded. Without this it is
                        a row of zeroes with nothing to ask — and working out
                        whether it was waiting for a base, already under one, or
                        simply unaffordable meant reading the price history by
                        hand against the ladder's settings. */}
                      {noLadder ? (
                        <Hint
                          words={`${noLadder.bars} ${plural(noLadder.bars, "bar", "bars")}, last on ${formatDate(new Date(noLadder.lastAt))}`}
                        >
                          <span className="block truncate pl-5 text-[10px] text-muted-foreground">
                            {noLadder.words}
                          </span>
                        </Hint>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-1 py-1.5 font-mono text-xs tabular-nums">
                      {coin.summary ? (
                        <span className="flex flex-col items-start">
                          <span className={cn("font-medium", toneClass(coin.summary.madeOrLost))}>
                            {signedUsd(coin.summary.madeOrLost)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn("px-1 py-1.5 font-mono text-xs text-muted-foreground tabular-nums", HIDE.dip)}
                    >
                      {coin.summary ? usd(coin.summary.worstDipUsd) : "—"}
                    </TableCell>
                    {/* Win carries the count with it — "2/6" already says six
                      trades — so a column repeating the six was a column of
                      numbers that were on the row twice. */}
                    <TableCell
                      className={cn("px-1 py-1.5 font-mono text-xs tabular-nums", HIDE.win)}
                    >
                      {coin.summary ? (
                        `${coin.summary.won}/${coin.summary.closed}`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
                  <TableCell className="py-2.5 pr-1 text-xs font-medium whitespace-nowrap text-muted-foreground">
                    {tested.length} traded
                  </TableCell>
                  <TableCell className="px-1 py-2.5 font-mono text-xs tabular-nums">
                    <span className="flex flex-col items-start">
                      <span
                        className={cn(
                          "font-semibold",
                          toneClass(total((coin) => coin.summary?.madeOrLost ?? 0))
                        )}
                      >
                        {signedUsd(
                          total((coin) => coin.summary?.madeOrLost ?? 0)
                        )}
                      </span>
                    </span>
                  </TableCell>
                  {/* No total for the dip: adding up each coin's worst moment
                    would describe a day that never happened. The run's own dip
                    is on the left, measured on the one combined line. */}
                  <TableCell className={cn("px-1 py-2.5 text-xs text-muted-foreground", HIDE.dip)}>
                    —
                  </TableCell>
                  <TableCell className={cn("px-1 py-2.5 font-mono text-xs font-semibold tabular-nums", HIDE.win)}>
                    {wonTotal}/{closedTotal}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
    </div>
  )
}

/**
 * The coins that produced nothing, grouped by why (Tyler, 10 Nov 2026:
 * "revamp skipped card", with a picture): each reason once, in grey with its
 * count in a pill, and its coins under it as small boxed names. The biggest
 * group comes first. A reason is usually a sentence about missing history,
 * and writing it once per group instead of once per coin is what makes a
 * long list readable.
 */
function SkippedList({ rows }: { rows: readonly SkippedCoin[] }) {
  if (rows.length === 0) {
    return <p className="py-2 text-center text-xs text-muted-foreground">Every market on the list traded at least once.</p>
  }
  const groups = new Map<string, SkippedCoin[]>()
  for (const row of rows) {
    const group = groups.get(row.reason)
    if (group) group.push(row)
    else groups.set(row.reason, [row])
  }
  const ordered = [...groups.entries()].sort(
    (left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0])
  )
  return (
    <div className="grid gap-6">
      {ordered.map(([reason, coins]) => (
        <section key={reason} className="grid gap-3">
          <div className="flex items-start gap-3">
            <p className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground">{reason}</p>
            <span className="mt-0.5 shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
              {coins.length}
            </span>
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {coins.map((coin) => (
              <li
                key={coin.marketKey}
                data-skipped-coin=""
                className="rounded-md border border-foreground/15 bg-background px-2 py-0.5 text-xs font-semibold"
              >
                {coin.symbol}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * Which columns drop out as the card narrows (Tyler's polish pick, 10 Nov
 * 2026): Dip under 18rem, Win under 14rem. Market and Total always stay.
 */
const HIDE: Partial<Record<Column, string>> = {
  dip: "hidden @[18rem]:table-cell",
  win: "hidden @[14rem]:table-cell",
}

/** A muted note that explains itself on hover, in the shared tooltip. */
function Hint({ words, children }: { words: string | null; children: React.ReactElement }) {
  if (!words) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-64">{words}</TooltipContent>
    </Tooltip>
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
