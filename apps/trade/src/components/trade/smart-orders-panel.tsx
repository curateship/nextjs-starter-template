import * as React from "react"
import { Grid2x2Icon } from "lucide-react"

import { MarketIcon } from "@/components/trade/market-icon"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { parseMarketKey, type MarketRow } from "@/lib/protocols/contracts"
import { formatPrice, formatUsd } from "@/lib/trade/format"
import { useLiveMarks } from "@/lib/trade/live-market"
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
  markets,
  walletName,
  onSelectMarket,
}: {
  smartOrders: readonly SmartOrder[]
  /** What each of them is holding, when it has bought anything yet. */
  positions: readonly PaperPosition[]
  markets: ReadonlyMap<string, MarketRow>
  walletName: (walletId: string) => string
  onSelectMarket: (marketKey: string) => void
}) {
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
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => onSelectMarket(order.marketKey)}
                  className={cn(
                    "flex items-center gap-2 border-b px-3 py-2 text-left transition-colors hover:bg-muted/60",
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
                        {KIND_LABELS[order.kind]} · {walletName(order.walletId)}
                      </span>
                    </div>
                    <p className="truncate text-[11px] leading-4 text-muted-foreground">
                      {whereItHasGot(order, position ?? null)}
                    </p>
                  </div>
                  {open === null ? null : (
                    <span
                      className={cn(
                        "shrink-0 text-xs tabular-nums",
                        open > 0
                          ? "text-teal-600 dark:text-teal-400"
                          : open < 0
                            ? "text-red-600 dark:text-red-400"
                            : undefined
                      )}
                    >
                      {formatUsd(open)}
                    </span>
                  )}
                </button>
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

function symbolOf(marketKey: string): string {
  return parseMarketKey(marketKey)?.marketId ?? marketKey
}
