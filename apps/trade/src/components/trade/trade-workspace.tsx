import * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { AccountPanel } from "@/components/trade/account-panel"
import { ActivityPanel } from "@/components/trade/activity-panel"
import { ChartPanel } from "@/components/trade/chart-panel"
import { FavouritesPanel } from "@/components/trade/favourites-panel"
import { MarketHeader } from "@/components/trade/market-header"
import { MarketListPanel } from "@/components/trade/market-list-panel"
import { OrderPanel } from "@/components/trade/order-panel"
import {
  BOTTOM_COLLAPSED_HEIGHT,
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/panel-layout"
import { tradePanelLayoutKey } from "@/lib/trade/panel-keys"
import { SAMPLE_MARKET } from "@/lib/trade/sample-market"
import { useWideScreen } from "@/lib/wide-screen"

/** Which side panel a narrow screen has slid open, if any. */
type OpenSheet = "markets" | "account" | null

/**
 * A side panel, split into two rows with a divider between them.
 *
 * The rows drag against each other; the panel as a whole is what shuts, which
 * is why both rows are handed the same collapsed flag and the same double-click.
 * A row with no width still paints its left and right borders, so both cards
 * have to be taken away together or the shut panel leaves a stray line behind.
 */
function SideColumn({
  id,
  layoutKey,
  topSize,
  collapsed,
  onDoubleClick,
  top,
  bottom,
}: {
  id: string
  layoutKey: string
  topSize: string
  collapsed: boolean
  onDoubleClick: (event: React.MouseEvent) => void
  top: React.ReactNode
  bottom: React.ReactNode
}) {
  const layout = useRememberedPanelLayout(layoutKey)

  return (
    <ResizablePanelGroup
      key={layout.layoutKey}
      orientation="vertical"
      className="min-h-0 flex-1"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      <ResizablePanel id={`${id}-top`} defaultSize={topSize} minSize="15%">
        <WorkspacePanel collapsed={collapsed} onDoubleClick={onDoubleClick}>
          {top}
        </WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap collapsed={collapsed} />
      <ResizablePanel id={`${id}-bottom`} minSize="15%">
        <WorkspacePanel collapsed={collapsed} onDoubleClick={onDoubleClick}>
          {bottom}
        </WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

/**
 * The Trade workspace: markets on the left, the market you picked in the
 * middle, the account on the right, and what you are holding along the bottom.
 *
 * Built on the same panel parts as the Automation Canvas rather than a second
 * panel system of its own, so resizing, collapsing, the reopen tabs and the
 * remembered layout all behave identically on both pages and only have to be
 * got right once.
 *
 * Nothing here is connected yet. Every panel draws the empty state it will
 * still show on the finished page, and the only figures on screen are
 * stand-ins, marked as such in words as well as in style.
 */
export function TradeWorkspace() {
  // Known before the first render on both sides, so the page opens in the
  // layout it is going to keep instead of painting the phone version and
  // rebuilding itself a beat later.
  const desktop = useWideScreen()
  const [marketsCollapsed, setMarketsCollapsed] = React.useState(false)
  const [accountCollapsed, setAccountCollapsed] = React.useState(false)
  const [openSheet, setOpenSheet] = React.useState<OpenSheet>(null)

  const marketsPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const accountPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const activityPanelRef = React.useRef<PanelImperativeHandle | null>(null)

  const horizontalLayout = useRememberedPanelLayout(
    tradePanelLayoutKey.workspaceHorizontal
  )
  const verticalLayout = useRememberedPanelLayout(
    tradePanelLayoutKey.workspaceVertical
  )

  const toggleMarkets = usePanelToggle(marketsPanelRef)
  const toggleAccount = usePanelToggle(accountPanelRef)
  const toggleActivity = usePanelToggle(activityPanelRef)

  // Double-clicking the empty part of a panel shuts it, and double-clicking
  // what is left of it opens it again.
  const marketsDoubleClick = useBlankSpaceDoubleClick(toggleMarkets)
  const accountDoubleClick = useBlankSpaceDoubleClick(toggleAccount)
  const activityDoubleClick = useBlankSpaceDoubleClick(toggleActivity)

  // A slid-open panel belongs to the narrow layout, so crossing the width
  // boundary shuts it. Widening otherwise leaves the sheet sitting over the
  // whole workspace with the button that opened it gone from the header — and
  // the panel it stands in for visible behind it. Narrowing again must not
  // bring it back by itself either, which is why either direction closes it.
  //
  // Adjusted during render rather than in an effect: React re-runs the render
  // immediately without painting in between, so the sheet is already gone in
  // the frame the new layout appears in.
  const [lastDesktop, setLastDesktop] = React.useState(desktop)
  if (desktop !== lastDesktop) {
    setLastDesktop(desktop)
    setOpenSheet(null)
  }

  const middle = (
    // flex-1 and min-w-0 are load-bearing: this sits in a flex row, and without
    // a width to fill it shrinks to its content.
    <WorkspacePanel className="flex min-w-0 flex-1 flex-col">
      <MarketHeader
        market={SAMPLE_MARKET}
        // On a wide screen both panels are already on screen, so the buttons
        // would only be a second way to do what the dividers already do.
        onOpenMarkets={desktop ? undefined : () => setOpenSheet("markets")}
        onOpenAccount={desktop ? undefined : () => setOpenSheet("account")}
      />
      <div className="relative flex min-h-0 flex-1">
        <div className="min-h-0 flex-1">
          <ChartPanel />
        </div>
        {/* Shown where the panel disappeared, so getting it back is findable
            without remembering that the divider is still draggable. */}
        {desktop && marketsCollapsed ? (
          <PanelReopenTab
            side="left"
            label="Show markets"
            onClick={toggleMarkets}
          />
        ) : null}
        {desktop && accountCollapsed ? (
          <PanelReopenTab
            side="right"
            label="Show account"
            onClick={toggleAccount}
          />
        ) : null}
      </div>
    </WorkspacePanel>
  )

  const upper = desktop ? (
    <ResizablePanelGroup
      key={horizontalLayout.layoutKey}
      orientation="horizontal"
      className="min-h-0 flex-1"
      defaultLayout={horizontalLayout.defaultLayout}
      onLayoutChanged={horizontalLayout.onLayoutChanged}
    >
      <ResizablePanel
        id="markets"
        panelRef={marketsPanelRef}
        collapsible
        collapsedSize="0%"
        defaultSize="16%"
        minSize="12%"
        maxSize="30%"
        onResize={(size) => setMarketsCollapsed(size.asPercentage < 0.5)}
      >
        <SideColumn
          id="markets"
          layoutKey={tradePanelLayoutKey.marketsColumn}
          topSize="60%"
          collapsed={marketsCollapsed}
          onDoubleClick={marketsDoubleClick}
          top={<MarketListPanel />}
          bottom={<FavouritesPanel />}
        />
      </ResizablePanel>
      <ResizableHandle gap collapsed={marketsCollapsed} />
      <ResizablePanel id="chart" defaultSize="62%" minSize="30%">
        {middle}
      </ResizablePanel>
      <ResizableHandle gap collapsed={accountCollapsed} />
      <ResizablePanel
        id="account"
        panelRef={accountPanelRef}
        collapsible
        collapsedSize="0%"
        defaultSize="22%"
        minSize="16%"
        maxSize="36%"
        onResize={(size) => setAccountCollapsed(size.asPercentage < 0.5)}
      >
        <SideColumn
          id="account"
          layoutKey={tradePanelLayoutKey.accountColumn}
          topSize="35%"
          collapsed={accountCollapsed}
          onDoubleClick={accountDoubleClick}
          top={<AccountPanel />}
          bottom={<OrderPanel />}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    middle
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ResizablePanelGroup
        key={verticalLayout.layoutKey}
        orientation="vertical"
        className="min-h-0 flex-1"
        defaultLayout={verticalLayout.defaultLayout}
        onLayoutChanged={verticalLayout.onLayoutChanged}
      >
        <ResizablePanel id="workspace" defaultSize="72%" minSize="35%">
          <div className="flex h-full min-h-0">{upper}</div>
        </ResizablePanel>
        {/* Keeps its gap even while the panel below is collapsed — that
            collapsed tab row is still a panel on screen, and this handle is
            what makes it draggable back open. */}
        <ResizableHandle gap />
        <ResizablePanel
          id="activity"
          panelRef={activityPanelRef}
          defaultSize="28%"
          minSize="12%"
          maxSize="60%"
          // Down to its own header rather than to nothing, so its tabs and
          // their counts never disappear.
          collapsible
          collapsedSize={BOTTOM_COLLAPSED_HEIGHT}
        >
          <WorkspacePanel onDoubleClick={activityDoubleClick}>
            <ActivityPanel />
          </WorkspacePanel>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Narrow screens keep the market itself as the page and reach the side
          panels through the two buttons in its header, rather than squeezing
          three columns into a width none of them fits in. */}
      <Sheet
        open={openSheet !== null}
        onOpenChange={(open) => setOpenSheet(open ? openSheet : null)}
      >
        <SheetContent side={openSheet === "account" ? "right" : "left"}>
          <SheetHeader className="sr-only">
            <SheetTitle>
              {openSheet === "account" ? "Account" : "Markets"}
            </SheetTitle>
          </SheetHeader>
          {/* Both rows, stacked, sharing the height. A divider between them
              would be a third way to size the same thing on a screen with no
              room to spare, so here they simply split it. */}
          <div className="flex min-h-0 flex-1 flex-col divide-y divide-foreground/10">
            <div className="min-h-0 flex-1">
              {openSheet === "account" ? <AccountPanel /> : <MarketListPanel />}
            </div>
            <div className="min-h-0 flex-1">
              {openSheet === "account" ? <OrderPanel /> : <FavouritesPanel />}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
