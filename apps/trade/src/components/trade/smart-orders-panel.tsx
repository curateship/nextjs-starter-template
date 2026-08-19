import * as React from "react"
import { ChevronDownIcon, ChevronRightIcon, Grid2x2Icon } from "lucide-react"

import { MarketIcon } from "@/components/trade/market-icon"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { parseMarketKey, type MarketRow } from "@/lib/protocols/contracts"
import { formatDateTime } from "@/lib/format/format-time"
import { formatPrice, formatUsd } from "@/lib/trade/format"
import { useLiveMarks } from "@/lib/trade/live-market"
import { formatUsd as money } from "@/lib/trade/format"
import type { LiveFill, LiveTrade } from "@/lib/trade/live-trades"
import type { PaperPosition } from "@/lib/trade/paper"
import type { SmartOrder, SmartOrderKind } from "@/lib/trade/smart-plan"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * Every coin a smart order is working right now, under the wallets.
 *
 * **These coins are deliberately not in the Positions tab.** A position a
 * ladder or a grid is running is not a position somebody is holding — it is
 * one step of something still happening, and mixed in with hand-placed trades
 * it read as a trade nobody was managing. Positions is what you are holding;
 * this is what is being worked.
 *
 * **Only the ones somebody placed by hand.** A flow can have a hundred and
 * fifty ladders working at once, which would bury the two or three you placed
 * yourself and turn this into a second, worse copy of the run's dashboard.
 * What a flow is doing belongs to that run's page.
 *
 * One row per smart order, saying which kind it is and where it has got to.
 * Clicking a row charts that coin, which is the reason anybody looks here.
 */

const KIND_LABELS: Record<SmartOrderKind, string> = {
  dca: "DCA ladder",
  grid: "Grid",
  signal: "Signals",
  watch: "Watched price",
}

export function SmartOrdersPanel({
  smartOrders,
  positions,
  fills,
  trades,
  markets,
  walletName,
  onSelectMarket,
}: {
  smartOrders: readonly SmartOrder[]
  /** What each of them is holding, when it has bought anything yet. */
  positions: readonly PaperPosition[]
  /** Fills not yet part of a finished trade — where a grid's sells live. */
  fills: readonly LiveFill[]
  /** Finished round trips, for the orders that do go flat. */
  trades: readonly LiveTrade[]
  markets: ReadonlyMap<string, MarketRow>
  walletName: (walletId: string) => string
  onSelectMarket: (marketKey: string) => void
}) {
  /** Which rows are open. Several at once, because comparing two is the point. */
  const [opened, setOpened] = React.useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setOpened((held) => {
      const next = new Set(held)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  // Placed by hand. An order carrying a run id was placed by a flow, and one
  // written before that was recorded reads as a hand-placed one — which is
  // what it looks like on screen anyway.
  const mine = React.useMemo(
    () => smartOrders.filter((order) => order.flowRunId === null),
    [smartOrders]
  )
  const marks = useLiveMarks(mine.map((one) => one.marketKey))
  const held = React.useMemo(
    () =>
      new Map(
        positions.map((one) => [`${one.walletId}:${one.marketKey}`, one])
      ),
    [positions]
  )

  // How many of THESE are holding something. Counting every position on the
  // account would say "2 holding" over a list of one.
  const holding = mine.filter((order) =>
    held.has(`${order.walletId}:${order.marketKey}`)
  ).length

  // Holding first — that is where the money is — then by coin, so the list
  // does not reshuffle every time a rung fills.
  const rows = React.useMemo(
    () =>
      [...mine].sort((left, right) => {
        const money = (order: SmartOrder) =>
          held.has(`${order.walletId}:${order.marketKey}`) ? 0 : 1
        return (
          money(left) - money(right) ||
          symbolOf(left.marketKey).localeCompare(symbolOf(right.marketKey))
        )
      }),
    [mine, held]
  )

  return (
    <>
      <WorkspacePanelHeader
        icon={<Grid2x2Icon />}
        title="Smart orders"
        meta={
          rows.length === 0
            ? "none working"
            : `${rows.length} working${
                holding === 0 ? "" : ` · ${holding} holding`
              }`
        }
      />
      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          No ladder or grid of your own is working. Right-click the chart to
          place one — a flow&rsquo;s orders live on its own dashboard.
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col">
            {rows.map((order) => {
              const position = held.get(`${order.walletId}:${order.marketKey}`)
              const mark =
                marks.get(order.marketKey) ??
                markets.get(order.marketKey)?.price ??
                null
              const open =
                position && mark !== null
                  ? (mark - position.entryPx) * position.szi - position.feesPaid
                  : null
              const banked = bankedBy(order, fills, trades)
              const isOpen = opened.has(order.id)
              return (
                // Open, the total's own bottom line is what parts this row
                // from the next, so the row does not draw a second one on top
                // of it — two hairlines a pixel apart read as a heavier rule
                // than every other line on the panel.
                <div key={order.id} className={cn(!isOpen && "border-b")}>
                  <div className="flex items-stretch">
                    {/* The chevron opens the detail; the rest of the row still
                        charts the coin, which is what it did before. Two jobs,
                        two targets, rather than one that guesses. */}
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Hide" : "Show"} what ${symbolOf(order.marketKey)} has done`}
                      onClick={() => toggle(order.id)}
                      className={cn(
                        "flex w-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                        focusRing
                      )}
                    >
                      {isOpen ? (
                        <ChevronDownIcon className="size-3.5" />
                      ) : (
                        <ChevronRightIcon className="size-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectMarket(order.marketKey)}
                      className={cn(
                        "flex flex-1 items-center gap-2 py-2 pr-3 text-left transition-colors hover:bg-muted/60",
                        focusRing
                      )}
                    >
                      <MarketIcon
                        symbol={symbolOf(order.marketKey)}
                        iconUrl={markets.get(order.marketKey)?.iconUrl ?? null}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="truncate text-xs font-medium">
                            {symbolOf(order.marketKey)}
                          </span>
                          <span className="truncate text-[10px] text-muted-foreground">
                            {KIND_LABELS[order.kind]} ·{" "}
                            {walletName(order.walletId)}
                          </span>
                        </div>
                        <p className="truncate text-[11px] leading-4 text-muted-foreground">
                          {whereItHasGot(order, position ?? null)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {open === null ? null : (
                          <span
                            className={cn(
                              "block text-xs tabular-nums",
                              toneOf(open)
                            )}
                          >
                            {formatUsd(open)}
                          </span>
                        )}
                        {banked.total === 0 ? null : (
                          <span
                            className={cn(
                              "block text-[10px] tabular-nums",
                              toneOf(banked.total)
                            )}
                          >
                            {money(banked.total)} banked
                          </span>
                        )}
                      </div>
                    </button>
                  </div>

                  {isOpen ? (
                    <div className="border-t bg-muted/30">
                      {banked.sells.length === 0 ? (
                        <p className="px-3 py-2 text-[11px] text-muted-foreground">
                          Nothing sold yet.
                        </p>
                      ) : (
                        <>
                          <div className="flex flex-col gap-1 px-3 py-2">
                            {banked.capped ? (
                              <p className="pb-1 text-[10px] text-muted-foreground">
                                The {SHOW_AT_MOST} most recent are listed; the
                                total counts them all.
                              </p>
                            ) : null}
                            {banked.sells.map((sell) => (
                              <div
                                key={sell.fillId}
                                className="flex items-baseline justify-between gap-3 text-[11px]"
                              >
                                <span className="truncate text-muted-foreground">
                                  {formatDateTime(new Date(sell.at))} ·{" "}
                                  {formatPrice(sell.px)}
                                </span>
                                <span
                                  className={cn(
                                    "shrink-0 tabular-nums",
                                    toneOf(sell.money)
                                  )}
                                >
                                  {money(sell.money)}
                                </span>
                              </div>
                            ))}
                          </div>
                          {/* The line runs the whole width and the total sits
                              on its own shade, so the sum reads as the foot of
                              the list rather than one more row in it. */}
                          <div className="flex items-baseline justify-between gap-3 border-y bg-muted/60 px-3 py-2 text-[11px] font-medium">
                            <span>
                              {banked.sells.length}{" "}
                              {banked.sells.length === 1 ? "sale" : "sales"}
                            </span>
                            <span
                              className={cn(
                                "tabular-nums",
                                toneOf(banked.total)
                              )}
                            >
                              {money(banked.total)}
                            </span>
                          </div>
                          {/* Above the total, not under it: the total is the
                              last thing in the row, and a line of small print
                              after it left the row ending on a different edge
                              from every other one. */}
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </>
  )
}

/**
 * Where one smart order has got to, in a line.
 *
 * Each kind is asked its own question, because the same words would be a lie
 * about the others: a ladder has rungs waiting, a grid has levels recycling,
 * and a signal trade is simply in one of four states.
 */
function whereItHasGot(
  order: SmartOrder,
  position: PaperPosition | null
): string {
  if (order.kind === "dca") {
    const waiting = order.plan.rungs.filter(
      (rung) => rung.status === "waiting"
    ).length
    const bought = order.plan.rungs.filter(
      (rung) => rung.status === "filled"
    ).length
    if (bought === 0) {
      return waiting === 0
        ? "Nothing left waiting"
        : `${waiting} ${waiting === 1 ? "rung" : "rungs"} waiting from ${formatPrice(order.plan.anchorPx)}`
    }
    return `${bought} bought, ${waiting} still waiting`
  }
  if (order.kind === "grid") {
    const holding = order.plan.levels.filter(
      (level) => level.status === "holding"
    ).length
    return `${order.plan.levels.length} levels ${formatPrice(order.plan.bottomPx)}–${formatPrice(order.plan.topPx)}, ${holding} bought`
  }
  if (order.kind === "watch") {
    // A watch has its own three states and they mean different things from a
    // signal trade's. Falling through to that one told somebody a price that
    // has not been reached yet was a position being held.
    if (order.plan.phase === "waiting") {
      return `Waiting for ${formatPrice(order.plan.triggerPx)}, nothing sent yet`
    }
    if (order.plan.phase === "stopping") return "Being called off"
    return `Reached ${formatPrice(order.plan.triggerPx)} — buying in`
  }
  const phase = order.plan.phase
  if (phase === "buying") return "Waiting to buy in"
  if (phase === "selling") return "Selling out"
  if (phase === "stopping") return "Getting out"
  return position
    ? `Holding from ${formatPrice(position.entryPx)}`
    : "Holding"
}

/** How many sales are listed before the list gets in the way of reading it. */
const SHOW_AT_MOST = 12

type Sale = { fillId: string; at: number; px: number; money: number }

/**
 * What one smart order has actually banked, and each sale that banked it.
 *
 * **Read off the fills, not off the plan.** A grid's levels say what they were
 * set to do; the fills say what happened, in the exchange's own figures, fee
 * included. Every closing fill on this coin since the order was placed counts
 * — there is one smart order per coin per wallet, so on this coin, over this
 * stretch of time, they are its sales.
 *
 * Finished round trips are counted too, for the kinds that do go flat. A grid
 * rarely does, which is exactly why its sells sit in the open fills instead.
 */
function bankedBy(
  order: SmartOrder,
  fills: readonly LiveFill[],
  trades: readonly LiveTrade[]
): { sells: Sale[]; total: number; capped: boolean } {
  const mine = (walletId: string, marketKey: string, at: number) =>
    walletId === order.walletId &&
    marketKey === order.marketKey &&
    at >= order.createdAt

  const sales: Sale[] = []
  for (const fill of fills) {
    if (!mine(fill.walletId, fill.marketKey, fill.at)) continue
    if (fill.closedPnl === 0) continue
    sales.push({
      fillId: fill.fillId,
      at: fill.at,
      px: fill.px,
      money: fill.closedPnl - fill.fee,
    })
  }
  for (const trade of trades) {
    if (!mine(trade.walletId, trade.marketKey, trade.closedAt)) continue
    sales.push({
      fillId: trade.id,
      at: trade.closedAt,
      px: trade.exitPx,
      money: trade.pnl,
    })
  }

  sales.sort((left, right) => right.at - left.at)
  const total = sales.reduce((sum, sale) => sum + sale.money, 0)
  return {
    sells: sales.slice(0, SHOW_AT_MOST),
    total,
    capped: sales.length > SHOW_AT_MOST,
  }
}

/** Green when it made money, red when it lost, plain at nothing. */
function toneOf(value: number): string | undefined {
  if (value > 0) return "text-teal-600 dark:text-teal-400"
  if (value < 0) return "text-red-600 dark:text-red-400"
  return undefined
}

function symbolOf(marketKey: string): string {
  return parseMarketKey(marketKey)?.marketId ?? marketKey
}
