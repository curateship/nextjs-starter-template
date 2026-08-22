import * as React from "react"
import { ChevronDownIcon, ChevronRightIcon, Grid2x2Icon } from "lucide-react"

import { MarketIcon } from "@/components/trade/market-icon"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { marketSymbol, type MarketRow } from "@/lib/protocols/contracts"
import { formatDateTime } from "@/lib/format/format-time"
import { formatPrice, formatSignedUsd } from "@/lib/trade/format"
import { useLiveMarks } from "@/lib/trade/live-market"
import {
  gridRoundTrips,
  type LiveFill,
  type LiveTrade,
} from "@/lib/trade/live-trades"
import type { PaperPosition } from "@/lib/trade/paper"
import { moneyTone } from "@/lib/trade/money-tone"
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
  settled,
  failed,
  onRetry,
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
  /**
   * Both halves of the read have landed — see `settled` on `Trading`.
   *
   * Not `loading`: that turns false when EITHER half lands, and this panel
   * lists practice ladders and real ones together. "No ladder of your own is
   * working" is a claim about money, so it waits for both.
   */
  settled: boolean
  /** The first read failed and there is nothing to fall back on. */
  failed: boolean
  onRetry: () => void
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
    () =>
      smartOrders.filter(
        // A watched price is a plain order that has not fired yet — it shares
        // the smart orders' table because the engine watches it the same way,
        // but it is not a strategy and it already has a line on the chart and
        // a row under Open orders. Listing it here too made one order read as
        // two things.
        (order) => order.flowRunId === null && order.kind !== "watch"
      ),
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
        const holdingFirst = (order: SmartOrder) =>
          held.has(`${order.walletId}:${order.marketKey}`) ? 0 : 1
        return (
          holdingFirst(left) - holdingFirst(right) ||
          marketSymbol(left.marketKey).localeCompare(
            marketSymbol(right.marketKey)
          )
        )
      }),
    [mine, held]
  )

  return (
    <>
      <WorkspacePanelHeader
        icon={<Grid2x2Icon />}
        title="Smart orders"
        // A count that is not known yet says nothing rather than "none
        // working" — before the first read, and after one that failed, zero
        // would be claiming an answer the panel does not have.
        meta={
          !settled || failed
            ? undefined
            : rows.length === 0
              ? "none working"
              : `${rows.length} working${
                  holding === 0 ? "" : ` · ${holding} holding`
                }`
        }
      />
      {rows.length === 0 && !settled ? (
        <LoadingRow
          label="Reading your smart orders"
          className="flex-1 text-xs"
        />
      ) : rows.length === 0 && failed ? (
        <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          The smart orders could not be read, so it is not known whether a
          ladder or a grid is working.{" "}
          <button type="button" className="underline" onClick={onRetry}>
            Try again
          </button>
        </p>
      ) : rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          No ladder or grid of your own is working. Right-click the chart to
          place one — a flow&rsquo;s orders live on its own dashboard.
        </p>
      ) : (
        // `[&>div]:block!` because Radix wraps what it is given in a
        // `display: table` box, which sizes itself to its widest row instead
        // of to the panel — a long wallet name or a grid's price range then
        // pushed the row's dollars off the right edge instead of being
        // truncated. Every other panel on this screen already passes it.
        <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:block!">
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
                      aria-label={`${isOpen ? "Hide" : "Show"} what ${marketSymbol(order.marketKey)} has done`}
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
                        // `min-w-0` or nothing below it can truncate: a
                        // no-wrap line's whole width is what a flex item
                        // offers as its smallest size, hidden overflow or not,
                        // so the row grew to fit the longest sentence in the
                        // list and pushed its dollars off the panel's edge.
                        "flex min-w-0 flex-1 items-center gap-2 py-2 pr-3 text-left transition-colors hover:bg-muted/60",
                        focusRing
                      )}
                    >
                      <MarketIcon
                        symbol={marketSymbol(order.marketKey)}
                        iconUrl={markets.get(order.marketKey)?.iconUrl ?? null}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="truncate text-xs font-medium">
                            {marketSymbol(order.marketKey)}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {KIND_LABELS[order.kind]} ·{" "}
                            {walletName(order.walletId)}
                          </span>
                        </div>
                        <p className="truncate text-xs leading-4 text-muted-foreground">
                          {whereItHasGot(order, position ?? null)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {open === null ? null : (
                          <span
                            className={cn(
                              "block text-xs tabular-nums",
                              moneyTone(open)
                            )}
                          >
                            {formatSignedUsd(open)}
                          </span>
                        )}
                        {banked.total === 0 ? null : (
                          <span
                            className={cn(
                              "block text-xs tabular-nums",
                              moneyTone(banked.total)
                            )}
                          >
                            {formatSignedUsd(banked.total)} banked
                          </span>
                        )}
                      </div>
                    </button>
                  </div>

                  {isOpen ? (
                    <div className="border-t bg-muted/30">
                      {banked.sells.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          Nothing sold yet.
                        </p>
                      ) : (
                        <>
                          <div className="flex flex-col gap-1 px-3 py-2">
                            {banked.capped ? (
                              <p className="pb-1 text-xs text-muted-foreground">
                                The {SHOW_AT_MOST} most recent are listed; the
                                total counts them all.
                              </p>
                            ) : null}
                            {banked.sells.map((sell) => (
                              <div
                                key={sell.fillId}
                                className="flex items-baseline justify-between gap-3 text-xs"
                              >
                                <span className="truncate text-muted-foreground">
                                  {formatDateTime(new Date(sell.at))} ·{" "}
                                  {formatPrice(sell.px)}
                                </span>
                                <span
                                  className={cn(
                                    "shrink-0 tabular-nums",
                                    sell.money === null
                                      ? "text-muted-foreground"
                                      : moneyTone(sell.money)
                                  )}
                                >
                                  {sell.money === null
                                    ? "—"
                                    : formatSignedUsd(sell.money)}
                                </span>
                              </div>
                            ))}
                          </div>
                          {/* The line runs the whole width and the total sits
                              on its own shade, so the sum reads as the foot of
                              the list rather than one more row in it. */}
                          <div className="flex items-baseline justify-between gap-3 border-y bg-muted/60 px-3 py-2 text-xs font-medium">
                            <span>
                              {banked.sells.length}{" "}
                              {banked.sells.length === 1 ? "sale" : "sales"}
                            </span>
                            <span
                              className={cn(
                                "tabular-nums",
                                banked.unpriced === banked.sells.length
                                  ? "text-muted-foreground"
                                  : moneyTone(banked.total)
                              )}
                            >
                              {banked.unpriced === banked.sells.length
                                ? "—"
                                : formatSignedUsd(banked.total)}
                            </span>
                          </div>
                          {/* Said once, under the total, because a total that
                              quietly leaves sales out is worse than one that
                              admits it. KuCoin states money per position
                              closed, and a grid selling part of what it holds
                              never closes one. */}
                          {banked.unpriced > 0 ? (
                            <p className="px-3 py-2 text-xs text-muted-foreground">
                              {banked.unpriced === 1
                                ? "The exchange has not said what that sale banked."
                                : `The exchange has not said what ${banked.unpriced} of these sales banked.`}
                            </p>
                          ) : null}
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
    const waiting = order.plan.levels.filter(
      (level) => level.status === "waiting"
    ).length
    const completed = order.plan.levels.filter(
      (level) => level.status === "holding"
    ).length
    return `${waiting} waiting · ${completed} completed`
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

type Sale = {
  fillId: string
  at: number
  px: number
  /** Null when the venue sold but never said what the sale banked. */
  money: number | null
}

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
 *
 * **A sell is a sale even when the venue states no profit for it.** This used
 * to count only fills carrying a closed profit, and on KuCoin that is never a
 * grid's fills: KuCoin reports money per POSITION closed, not per fill, and a
 * grid selling a fifth of what it holds never closes a position. So a KuCoin
 * grid recycled all week and the panel still said "Nothing sold yet". A grid
 * and a ladder are both long only, so a sell on their coin is a sale, whoever
 * is keeping the books.
 *
 * What the venue would not state is left NULL rather than counted as zero.
 * Zero is a real answer, meaning the sale broke even, and printing it for a
 * sale that made money is the kind of wrong that gets believed.
 *
 * **A grid's sale is worth what its own level made.** The venue books every
 * partial sell against the position average, and while a grid is working that
 * average is held up by the expensive levels still holding, so a level that
 * did its job reads as a loss. The panel said "$1.15 banked" on a CHIP level
 * that put $4.28 in the account. `gridRoundTrips` has the arithmetic. It also
 * answers where KuCoin says nothing at all, because it is worked out from the
 * fills rather than asked for.
 */
export function bankedBy(
  order: SmartOrder,
  fills: readonly LiveFill[],
  trades: readonly LiveTrade[]
): {
  sells: Sale[]
  total: number
  capped: boolean
  /** Sales the venue never put a figure on, so the total is short of them. */
  unpriced: number
} {
  const mine = (walletId: string, marketKey: string, at: number) =>
    walletId === order.walletId &&
    marketKey === order.marketKey &&
    at >= order.createdAt

  // Over every fill, not only this order's: a level's round trip is paid out
  // of the buy that level made, and that buy has to still be in the list for
  // the sale to be worth anything.
  const levels = gridRoundTrips(fills)

  const sales: Sale[] = []
  for (const fill of fills) {
    if (!mine(fill.walletId, fill.marketKey, fill.at)) continue
    const level = levels.get(fill.fillId)
    // A stated profit, or a sell out of a long-only order. The first also
    // catches a short being bought back, which the second cannot see.
    const stated = fill.closedPnl !== 0
    if (!level && !stated && fill.side !== "sell") continue
    sales.push({
      fillId: fill.fillId,
      at: fill.at,
      px: fill.px,
      money: level ? level.money : stated ? fill.closedPnl - fill.fee : null,
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
  const total = sales.reduce((sum, sale) => sum + (sale.money ?? 0), 0)
  return {
    sells: sales.slice(0, SHOW_AT_MOST),
    total,
    capped: sales.length > SHOW_AT_MOST,
    /** Sales the venue never put a figure on, so the total is short of them. */
    unpriced: sales.filter((sale) => sale.money === null).length,
  }
}
