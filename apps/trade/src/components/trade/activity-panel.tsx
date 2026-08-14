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
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { parseMarketKey, type MarketCatalog, type MarketRow } from "@/lib/protocols/contracts"
import type { LiveTrade } from "@/lib/trade/live-trades"
import type { PaperPosition } from "@/lib/trade/paper"

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

  // Resolved against the live list every render, so a position closed by its
  // own stop while its window is open closes the window instead of editing
  // something that is no longer there.
  const editingNow =
    trading.positions.find((one) => one.id === editing?.id) ?? null

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as ActivityTab)}
      className="h-full min-h-0 flex-1 gap-0 overflow-hidden bg-card"
    >
      <WorkspacePanelTabsHeader>
        <WorkspacePanelTab
          value="positions"
          icon={<LayersIcon className="size-4" />}
          label="Positions"
          count={trading.positions.length}
        />
        <WorkspacePanelTab
          value="orders"
          icon={<ScrollTextIcon className="size-4" />}
          label="Open orders"
          count={trading.orders.length}
        />
        <WorkspacePanelTab
          value="journal"
          icon={<BookOpenIcon className="size-4" />}
          label="Journal"
          count={trading.trades.length}
        />
        {/* Close all is the practice engine's sweep; real positions are
            closed one by one, each with its own question. */}
        {trading.positions.some((position) => !position.live) ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={trading.busy}
            onClick={() => setClosingAll(true)}
          >
            Close all
          </Button>
        ) : null}
      </WorkspacePanelTabsHeader>

      <TabsContent value="positions" className="min-h-0 flex-1">
        <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
          <PositionsTable
            positions={trading.positions}
            markets={markets}
            walletName={walletName}
            smartOrders={trading.smartOrders}
            busy={trading.busy}
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
            orders={trading.orders}
            markets={markets}
            walletName={walletName}
            busy={trading.busy}
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
        title="Close every practice position?"
        description="Every practice position is sold at whatever its market costs right now, and everything made or lost is banked. Real positions and waiting orders are left alone. This cannot be undone."
        confirmLabel="Close all positions"
        onConfirm={() => {
          void trading.closeAll()
          setClosingAll(false)
        }}
      />
    </Tabs>
  )
}
