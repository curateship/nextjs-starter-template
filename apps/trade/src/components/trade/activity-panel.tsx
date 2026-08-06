import * as React from "react"
import { LayersIcon, ReceiptIcon, ScrollTextIcon } from "lucide-react"

import { EmptyRow } from "@/components/shared/feed-card"
import {
  WorkspacePanelTab,
  WorkspacePanelTabsHeader,
} from "@/components/shared/workspace-panel-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent } from "@/components/ui/tabs"

type ActivityTab = "positions" | "orders" | "fills"

/**
 * The bottom panel: what you are holding, what you have asked for, and what
 * actually happened.
 *
 * Its tab row is also its collapsed state — dragging the divider all the way
 * down leaves exactly this header on screen, counts and all, so the panel can
 * always be found and dragged back open. That is why it collapses to a height
 * rather than to nothing the way the side panels do.
 */
export function ActivityPanel() {
  const [tab, setTab] = React.useState<ActivityTab>("positions")

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
          count={0}
        />
        <WorkspacePanelTab
          value="orders"
          icon={<ScrollTextIcon className="size-4" />}
          label="Open orders"
          count={0}
        />
        <WorkspacePanelTab
          value="fills"
          icon={<ReceiptIcon className="size-4" />}
          label="Fills"
          count={0}
        />
      </WorkspacePanelTabsHeader>

      <TabsContent value="positions" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <EmptyRow>
            No open positions. Anything you are holding shows up here.
          </EmptyRow>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="orders" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <EmptyRow>
            No open orders. Orders waiting to fill show up here.
          </EmptyRow>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="fills" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <EmptyRow>No fills yet. Every trade that goes through lands here.</EmptyRow>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}
