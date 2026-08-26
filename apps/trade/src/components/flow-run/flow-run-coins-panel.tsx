import * as React from "react"
import { CoinsIcon, ListOrderedIcon } from "lucide-react"

import { signedUsd, toneClass, usd } from "@/components/backtest/backtest-kpi"
import {
  DashboardCardTab,
  DashboardCardTabsHeader,
} from "@/components/shared/dashboard-card-header"
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
import type { FlowRunReport } from "@/lib/api/flow-runs"
import { formatPrice } from "@/lib/trade/format"
import { cn } from "@/lib/utils"

/**
 * Down the right: every coin the run watches, with the ones it is actually
 * holding money in at the top, and what each coin has made.
 *
 * **The held coins float to the top rather than getting a tab of their own.**
 * A tab is a place you have to go and look; the two or three coins with real
 * money in them are the reason the panel is open, and they belong in front of
 * you the moment it is. The rest of the list is the same list it always was.
 *
 * A run that is switched on has coins it has not bought yet — and the reason it has not is the single most
 * useful thing on this screen. A coin patiently waiting for its price and a
 * coin refused for want of money both show nothing, and only one of them is
 * working.
 *
 * The words come from `flow-waiting.ts`, the same ones the canvas chip uses, so
 * the two places that report on a run never say it differently.
 */
type Tab = "coins" | "results"
type Column = "coin" | "net" | "trades"

const TABLE_CLASS =
  "table-fixed text-xs [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_td]:overflow-hidden [&_td]:px-1.5 [&_td]:text-ellipsis [&_th:first-child]:pl-5 [&_th:last-child]:pr-5 [&_th]:overflow-hidden [&_th]:px-1.5"

export function FlowRunCoinsPanel({
  report,
  openCoin,
  onOpenCoin,
}: {
  report: FlowRunReport
  openCoin: string | null
  onOpenCoin: (marketKey: string) => void
}) {
  const [tab, setTab] = React.useState<Tab>("coins")
  const { sort, direction, toggleSort } = useTableSort<Column>("net", "desc")

  const traded = React.useMemo(
    () => report.coins.filter((coin) => coin.trades > 0),
    [report.coins]
  )

  const results = React.useMemo(() => {
    const way = direction === "asc" ? 1 : -1
    return [...traded].sort((left, right) => {
      if (sort === "coin") return way * left.coin.localeCompare(right.coin)
      const pick = sort === "trades" ? "trades" : "netUsd"
      return way * (left[pick] - right[pick])
    })
  }, [traded, sort, direction])

  const heldBy = React.useMemo(
    () => new Map(report.positions.map((one) => [one.marketKey, one])),
    [report.positions]
  )

  // Coins with money in them first — that is what somebody opens this panel
  // for. Then anything needing a person, then the ones still waiting, then the
  // ones quietly working, which need nothing from you.
  const coins = React.useMemo(() => {
    const rank = (coin: FlowRunReport["coins"][number]) =>
      heldBy.has(coin.marketKey) ? 0 : coin.problem ? 1 : coin.working ? 3 : 2
    return [...report.coins].sort(
      (left, right) =>
        rank(left) - rank(right) || left.coin.localeCompare(right.coin)
    )
  }, [report.coins, heldBy])

  const head = (label: string, column: Column, width: string, right = false) => (
    <TableHead column="meta" className={cn(width, right && "text-right")}>
      <TableSortButton
        active={sort === column}
        direction={direction}
        onClick={() => toggleSort(column)}
        className={cn("gap-1 text-xs sm:text-xs", right && "ml-auto flex-row-reverse")}
      >
        {label}
      </TableSortButton>
    </TableHead>
  )

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as Tab)}
      className="h-full min-h-0 flex-1 gap-0 overflow-hidden"
    >
      <DashboardCardTabsHeader>
        <DashboardCardTab
          value="coins"
          icon={<CoinsIcon className="size-4" />}
          label="Coins"
          count={report.coins.length}
        />
        <DashboardCardTab
          value="results"
          icon={<ListOrderedIcon className="size-4" />}
          label="Results"
          count={traded.length}
        />
      </DashboardCardTabsHeader>

      <TabsContent value="coins" className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:block!">
          <Table className={TABLE_CLASS}>
            <TableHeader>
              <TableRow>
                <TableHead column="meta" className="w-[30%]">
                  Market
                </TableHead>
                <TableHead column="meta" className="w-[45%]">
                  What it is doing
                </TableHead>
                <TableHead column="meta" className="w-[25%] text-right">
                  Holding
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coins.map((coin) => {
                const held = heldBy.get(coin.marketKey) ?? null
                return (
                  <TableRow
                    key={coin.marketKey}
                    data-state={
                      coin.marketKey === openCoin ? "selected" : undefined
                    }
                    rowAction={() => onOpenCoin(coin.marketKey)}
                  >
                    <TableCell column="meta" className="whitespace-nowrap">
                      <span
                        className={cn(
                          "font-medium",
                          coin.marketKey === openCoin &&
                            "underline underline-offset-4"
                        )}
                      >
                        {coin.coin}
                      </span>
                    </TableCell>
                    <TableCell column="meta">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5",
                          coin.problem && "text-amber-700 dark:text-amber-400",
                          !held &&
                            !coin.problem &&
                            coin.working &&
                            "text-yellow-600 dark:text-yellow-400"
                        )}
                      >
                        {!held && !coin.problem && coin.working ? (
                          <span
                            aria-hidden
                            className="size-1.5 shrink-0 rounded-full bg-yellow-500"
                          />
                        ) : null}
                        {/* Never colour alone: every state says which it is in
                            words too, so the row still reads in black and
                            white. */}
                        {held
                          ? `Bought at ${formatPrice(held.entryPx)}${
                              held.stopPx === null
                                ? ""
                                : `, stop ${formatPrice(held.stopPx)}`
                            }`
                          : coin.working
                            ? "Rungs placed"
                            : coin.problem
                              ? `Needs you — ${lowerFirst(coin.words ?? "something is wrong")}`
                              : (coin.words ?? "Not looked at yet")}
                      </span>
                    </TableCell>
                    <TableCell
                      column="meta"
                      className={cn(
                        "text-right tabular-nums",
                        toneClass(held?.unrealisedUsd ?? undefined)
                      )}
                    >
                      {!held ? (
                        <span className="text-muted-foreground">—</span>
                      ) : held.unrealisedUsd === null ? (
                        usd(held.amountUsd)
                      ) : (
                        <>
                          {signedUsd(held.unrealisedUsd)}
                          <span className="block text-[10px] text-muted-foreground">
                            {usd(held.amountUsd)} in
                          </span>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="results" className="flex min-h-0 flex-1 flex-col">
        {traded.length === 0 ? (
          <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            No coin has finished a trade yet.
          </p>
        ) : (
          <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:block!">
            <Table className={TABLE_CLASS}>
              <TableHeader>
                <TableRow>
                  {head("Market", "coin", "w-[40%]")}
                  {head("Net", "net", "w-[36%]", true)}
                  {head("Trades", "trades", "w-[24%]", true)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((coin) => (
                  <TableRow
                    key={coin.marketKey}
                    data-state={coin.marketKey === openCoin ? "selected" : undefined}
                    rowAction={() => onOpenCoin(coin.marketKey)}
                  >
                    <TableCell column="meta" className="whitespace-nowrap font-medium">
                      {coin.coin}
                    </TableCell>
                    <TableCell
                      column="meta"
                      className={cn("text-right tabular-nums", toneClass(coin.netUsd))}
                    >
                      {signedUsd(coin.netUsd)}
                    </TableCell>
                    <TableCell column="meta" className="text-right tabular-nums">
                      {coin.trades}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
        {report.notMine > 0 ? (
          // Said out loud rather than left out quietly. Every figure on this
          // page leaves these trades alone, and a page that did that without
          // saying so would read as the whole wallet.
          <p className="shrink-0 border-t px-5 py-2 text-[11px] text-muted-foreground">
            {report.notMine} finished{" "}
            {report.notMine === 1 ? "trade" : "trades"} on{" "}
            {report.head.walletLabel} {report.notMine === 1 ? "was" : "were"} not
            this run&rsquo;s, and {report.notMine === 1 ? "is" : "are"} left out
            of every figure here.
          </p>
        ) : null}
      </TabsContent>
    </Tabs>
  )
}

function lowerFirst(text: string): string {
  return text.length > 0 ? text[0].toLowerCase() + text.slice(1) : text
}
