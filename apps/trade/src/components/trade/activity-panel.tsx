import * as React from "react"
import { LayersIcon, ScrollTextIcon, ReceiptIcon } from "lucide-react"

import { BracketsDialog } from "@/components/trade/brackets-dialog"
import {
  JournalTable,
  OpenOrdersTable,
  PositionsTable,
} from "@/components/trade/positions-table"
import type { PaperTrading } from "@/components/trade/use-paper-trading"
import {
  WorkspacePanelTab,
  WorkspacePanelTabsHeader,
} from "@/components/shared/workspace-panel-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { parseMarketKey, type MarketCatalog, type MarketRow } from "@/lib/protocols/contracts"
import type { PaperPosition } from "@/lib/trade/paper"

type ActivityTab = "positions" | "orders" | "journal"

/**
 * The bottom panel: what you are holding, what you have asked for, and what
 * actually happened.
 *
 * Its tab row is also its collapsed state — dragging the divider all the way
 * down leaves exactly this header on screen, counts and all, so the panel can
 * always be found and dragged back open. That is why it collapses to a height
 * rather than to nothing the way the side panels do.
 */
export function ActivityPanel({
  paper,
  catalogs,
  onSelectMarket,
}: {
  paper: PaperTrading
  catalogs: MarketCatalog[]
  onSelectMarket: (marketKey: string) => void
}) {
  const [tab, setTab] = React.useState<ActivityTab>("positions")
  const [editing, setEditing] = React.useState<PaperPosition | null>(null)
  const [flipping, setFlipping] = React.useState<PaperPosition | null>(null)
  const [closingAll, setClosingAll] = React.useState(false)

  /** Each row says which wallet it is in; the panel shows several at once. */
  const walletName = (walletId: string) =>
    paper.walletNames.get(walletId) ?? "another wallet"
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
    paper.positions.find((one) => one.id === editing?.id) ?? null

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
          count={paper.positions.length}
        />
        <WorkspacePanelTab
          value="orders"
          icon={<ScrollTextIcon className="size-4" />}
          label="Open orders"
          count={paper.orders.length}
        />
        <WorkspacePanelTab
          value="journal"
          icon={<ReceiptIcon className="size-4" />}
          label="Fill history"
          count={paper.journal.length}
        />
        {paper.positions.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={paper.busy}
            onClick={() => setClosingAll(true)}
          >
            Close all
          </Button>
        ) : null}
      </WorkspacePanelTabsHeader>

      <TabsContent value="positions" className="min-h-0 flex-1">
        <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
          <PositionsTable
            positions={paper.positions}
            markets={markets}
            walletName={walletName}
            busy={paper.busy}
            onSelectMarket={onSelectMarket}
            onEdit={setEditing}
            onFlip={setFlipping}
            onClose={(position) =>
              void paper.close(position.walletId, position.marketKey)
            }
          />
        </ScrollArea>
      </TabsContent>

      <TabsContent value="orders" className="min-h-0 flex-1">
        <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
          <OpenOrdersTable
            orders={paper.orders}
            markets={markets}
            walletName={walletName}
            busy={paper.busy}
            onSelectMarket={onSelectMarket}
            onCancel={(order) => void paper.cancel(order.walletId, order.id)}
          />
        </ScrollArea>
      </TabsContent>

      <TabsContent value="journal" className="min-h-0 flex-1">
        <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
          <JournalTable
            journal={paper.journal}
            markets={markets}
            walletName={walletName}
            onSelectMarket={onSelectMarket}
          />
        </ScrollArea>
      </TabsContent>

      <BracketsDialog
        position={editingNow}
        busy={paper.busy}
        onSave={paper.setBrackets}
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
          if (flipping) void paper.flip(flipping.walletId, flipping.marketKey)
          setFlipping(null)
        }}
      />

      <ConfirmDialog
        open={closingAll}
        onOpenChange={setClosingAll}
        title="Close every position?"
        description="All of them are sold at whatever their markets cost right now, and everything they have made or lost is banked. Waiting orders are left alone. This cannot be undone."
        confirmLabel="Close all positions"
        onConfirm={() => {
          void paper.closeAll()
          setClosingAll(false)
        }}
      />
    </Tabs>
  )
}
