import * as React from "react"
import {
  BookOpenIcon,
  LayersIcon,
  ScrollTextIcon,
} from "lucide-react"

import { BracketsDialog } from "@/components/trade/brackets-dialog"
import {
  OpenOrdersTable,
  PositionsTable,
  TradesTable,
} from "@/components/trade/positions-table"
import type { Trading } from "@/components/trade/use-trading"
import {
  WorkspacePanelTab,
  WorkspacePanelTabsHeader,
} from "@/components/shared/workspace-panel-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { parseMarketKey, type MarketCatalog, type MarketRow } from "@/lib/protocols/contracts"
import { formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { useLiveMarks } from "@/lib/trade/live-market"
import type { LiveTrade } from "@/lib/trade/live-trades"
import {
  positionProfit,
  positionValue,
  type PaperPosition,
} from "@/lib/trade/paper"
import { cn } from "@/lib/utils"

type ActivityTab = "positions" | "orders" | "journal"

/**
 * The bottom panel: what you are holding, what you have asked for, and how the
 * trades that are finished actually went.
 *
 * Its tab row is also its collapsed state — dragging the divider all the way
 * down leaves exactly this header on screen, counts and all, so the panel can
 * always be found and dragged back open. That is why it collapses to a height
 * rather than to nothing the way the side panels do.
 */
export function ActivityPanel({
  trading,
  catalogs,
  onSelectMarket,
  shownTrade,
  onShowTrade,
}: {
  trading: Trading
  catalogs: MarketCatalog[]
  onSelectMarket: (marketKey: string) => void
  /** The trade drawn on the chart right now, owned by the workspace. */
  shownTrade: LiveTrade | null
  onShowTrade: (trade: LiveTrade | null) => void
}) {
  const [tab, setTab] = React.useState<ActivityTab>("positions")
  // Every position, or only the ones placed by hand. Everything by default:
  // hiding a ladder's position once made real money look gone from this
  // table, and a row that exists but is filtered is something the dropdown
  // can say — a row that is silently missing is not.
  const [shown, setShown] = React.useState<"all" | "manual">("all")
  const [editing, setEditing] = React.useState<PaperPosition | null>(null)
  const [flipping, setFlipping] = React.useState<PaperPosition | null>(null)
  const [closingAll, setClosingAll] = React.useState(false)
  // The bin on a row asks first. Nothing here can be put back from the screen,
  // and the two lists sit under a chart people click around on all day.
  const [removingTrade, setRemovingTrade] = React.useState<LiveTrade | null>(null)

  /** Each row says which wallet it is in; the panel shows several at once. */
  const walletName = (walletId: string) =>
    trading.walletNames.get(walletId) ?? "another wallet"
  const marketOf = (marketKey: string) =>
    parseMarketKey(marketKey)?.marketId ?? marketKey

  // Every market on offer, by key, so a row can find its own art and its
  // fallback price without each one searching the catalogues itself.
  const markets = React.useMemo(() => {
    const byKey = new Map<string, MarketRow>()
    for (const catalog of catalogs) {
      for (const row of catalog.rows) byKey.set(row.key, row)
    }
    return byKey
  }, [catalogs])

  /**
   * The positions no ladder, grid or flow is running — the "Manual only"
   * answer. What a smart order is doing still lives in the Smart orders
   * panel; this filter only decides which rows this table lists.
   */
  const byHand = React.useMemo(() => {
    const managed = new Set(
      trading.smartOrders.map((order) => `${order.walletId}:${order.marketKey}`)
    )
    return trading.positions.filter(
      (position) => !managed.has(`${position.walletId}:${position.marketKey}`)
    )
  }, [trading.positions, trading.smartOrders])
  const visible = shown === "manual" ? byHand : trading.positions
  // How many of the open positions are real money — the confirm says it.
  const realCount = trading.positions.filter((one) => one.live).length

  // Resolved against the live list every render, so a position closed by its
  // own stop while its window is open closes the window instead of editing
  // something that is no longer there.
  const editingNow =
    trading.positions.find((one) => one.id === editing?.id) ?? null

  // A count that is not known yet shows nothing rather than a zero — before
  // the first read, and after a first read that failed, "0" would be claiming
  // an answer the panel does not have.
  const countOf = (length: number) =>
    trading.loading || trading.failed ? undefined : length

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as ActivityTab)}
      className="h-full min-h-0 flex-1 gap-0 overflow-hidden bg-card"
    >
      <WorkspacePanelTabsHeader>
        <PositionsGlance positions={visible} markets={markets}>
          <WorkspacePanelTab
            value="positions"
            icon={<LayersIcon className="size-4" />}
            label="Positions"
            count={countOf(visible.length)}
          />
        </PositionsGlance>
        <WorkspacePanelTab
          value="orders"
          icon={<ScrollTextIcon className="size-4" />}
          label="Open orders"
          count={countOf(trading.orders.length + trading.watchOrders.length)}
        />
        <WorkspacePanelTab
          value="journal"
          icon={<BookOpenIcon className="size-4" />}
          label="Journal"
          count={countOf(trading.trades.length)}
        />
        <div className="ml-auto flex items-center gap-2">
          {/* Whether ladder- and flow-run positions are listed too. On the
              positions tab only — the other tabs have nothing it would mean. */}
          {tab === "positions" ? (
            <Select
              value={shown}
              onValueChange={(next) => setShown(next as "all" | "manual")}
            >
              <SelectTrigger aria-label="Which positions to list">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">All positions</SelectItem>
                <SelectItem value="manual">Manual only</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          {/* The emergency button: one press, one confirm, and every open
              position goes — real money included, each real one through the
              same close its own row uses. */}
          {trading.positions.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              disabled={trading.busy}
              onClick={() => setClosingAll(true)}
            >
              Close all
            </Button>
          ) : null}
        </div>
      </WorkspacePanelTabsHeader>

      <TabsContent value="positions" className="min-h-0 flex-1">
        <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
          <PositionsTable
            positions={visible}
            markets={markets}
            walletName={walletName}
            busy={trading.busy}
            loading={trading.loading}
            failed={trading.failed}
            onRetry={trading.retry}
            onSelectMarket={onSelectMarket}
            onEdit={setEditing}
            onFlip={setFlipping}
            onClose={(position) =>
              void trading.close(position.walletId, position.marketKey)
            }
          />
        </ScrollArea>
      </TabsContent>

      <TabsContent value="orders" className="min-h-0 flex-1">
        <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
          <OpenOrdersTable
            // Real, practice and watched in one list — a watched price IS an
            // open order to the person who placed it, wherever it happens to
            // be held.
            orders={[...trading.orders, ...trading.watchOrders]}
            markets={markets}
            walletName={walletName}
            busy={trading.busy}
            loading={trading.loading}
            failed={trading.failed}
            onRetry={trading.retry}
            onSelectMarket={onSelectMarket}
            onCancel={(order) => void trading.cancel(order.walletId, order.id)}
          />
        </ScrollArea>
      </TabsContent>

      <TabsContent value="journal" className="min-h-0 flex-1">
        <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
          <TradesTable
            trades={trading.trades}
            markets={markets}
            walletName={walletName}
            selectedId={shownTrade?.id ?? null}
            busy={trading.busy}
            loading={trading.loading}
            failed={trading.failed}
            onRetry={trading.retry}
            // Pressing the row already drawn puts the chart back to itself,
            // so the same press both shows and hides.
            onSelectTrade={(trade) =>
              onShowTrade(trade.id === shownTrade?.id ? null : trade)
            }
            onSelectMarket={onSelectMarket}
            onRemove={setRemovingTrade}
          />
        </ScrollArea>
      </TabsContent>

      <ConfirmDialog
        open={removingTrade !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingTrade(null)
        }}
        title="Remove this trade from the Journal?"
        description="It stops showing here, and stops being drawn on the chart. Nothing about your money changes — a practice wallet's cash is added up from its fills, so the fills are kept and only hidden."
        confirmLabel="Remove it"
        onConfirm={() => {
          if (removingTrade) {
            // Drawn on the chart right now? Then it goes from there too, or a
            // trade that is no longer in the list stays painted over the
            // candles with nothing to press to be rid of it.
            if (removingTrade.id === shownTrade?.id) onShowTrade(null)
            void trading.hideTrade(removingTrade)
          }
          setRemovingTrade(null)
        }}
      />

      <BracketsDialog
        position={editingNow}
        busy={trading.busy}
        onSave={trading.setBrackets}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={flipping !== null}
        onOpenChange={(open) => {
          if (!open) setFlipping(null)
        }}
        title={
          flipping
            ? `Turn the ${marketOf(flipping.marketKey)} position in ${walletName(flipping.walletId)} around?`
            : "Turn this position around?"
        }
        description="What you are holding is closed at today's price and the same size is opened the other way, in one go. Whatever it has made or lost is banked, and any stop and target are cleared."
        confirmLabel="Turn it around"
        destructive={false}
        onConfirm={() => {
          if (flipping) void trading.flip(flipping.walletId, flipping.marketKey)
          setFlipping(null)
        }}
      />

      <ConfirmDialog
        open={closingAll}
        onOpenChange={setClosingAll}
        title={
          realCount > 0
            ? `Close every position — ${realCount} real?`
            : "Close every position?"
        }
        description={
          realCount > 0
            ? `Every open position is closed, including ${
                realCount === 1 ? "1 position" : `${realCount} positions`
              } of real money, each closed on the exchange exactly as its own row's button would. Practice positions are sold at whatever their market costs right now. Waiting orders are left alone. This cannot be undone.`
            : "Every practice position is sold at whatever its market costs right now, and everything made or lost is banked. Waiting orders are left alone. This cannot be undone."
        }
        confirmLabel="Close all positions"
        onConfirm={() => {
          void trading.closeAll()
          setClosingAll(false)
        }}
      />
    </Tabs>
  )
}

/**
 * A glance at what is held, without leaving the tab you are on.
 *
 * The panel is often collapsed to its header, or you are reading the Journal,
 * and the question "what am I actually in right now" costs a click and a
 * scroll to answer. Hovering the Positions tab answers it: the coin, what the
 * stake is worth at today's price, and what it is up or down.
 *
 * Prices come from the same live feed the table uses, so the two never
 * disagree. With nothing held there is nothing to say and no tooltip opens.
 */
function PositionsGlance({
  positions,
  markets,
  children,
}: {
  positions: PaperPosition[]
  markets: ReadonlyMap<string, MarketRow>
  children: React.ReactNode
}) {
  const marks = useLiveMarks(positions.map((one) => one.marketKey))
  if (positions.length === 0) return <>{children}</>

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent align="start" className="max-w-none p-0">
        <div className="flex flex-col gap-1 p-2">
          {positions.map((position) => {
            const mark =
              marks.get(position.marketKey) ??
              markets.get(position.marketKey)?.price ??
              position.entryPx
            const profit = positionProfit(position, mark)
            return (
              <div
                key={position.id}
                className="flex items-center gap-3 text-xs tabular-nums"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {parseMarketKey(position.marketKey)?.marketId ??
                    position.marketKey}
                </span>
                <span className="shrink-0">
                  {formatUsd(positionValue(position, mark))}
                </span>
                <span
                  className={cn(
                    "w-20 shrink-0 text-right font-medium",
                    profit > 0
                      ? "text-emerald-500"
                      : profit < 0
                        ? "text-red-400"
                        : ""
                  )}
                >
                  {formatSignedUsd(profit)}
                </span>
              </div>
            )
          })}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
