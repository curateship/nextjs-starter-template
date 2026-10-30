import * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  useBlankSpaceDoubleClick,
  usePanelCollapsed,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"

type Side = { label: string; content: React.ReactNode; showLabel: string }

/**
 * Project's three-panel screen: the four-panel dashboard without its bottom
 * panel, as Tyler asked for the project page, and used by My dashboard and
 * the Team dashboard too. The layout is the CRM screen's
 * (`crm-workspace.tsx`). The side panels collapse by being dragged shut or by
 * a double-click on blank space, and widths are remembered under `layoutKey`.
 * The page fills the screen and each panel scrolls on its own. Below 1280px
 * one panel shows at a time, with a tab for each. All three stay mounted and
 * the hidden two are `inert`, so switching tabs keeps each panel's own tab,
 * scroll and loaded lists instead of starting it over. A screen may add one
 * more tab there, after the left panel's, for a card that gets a tab of its
 * own on a phone, such as the site admin's Projects.
 */
export function ThreePanels({
  layoutKey,
  left,
  middle,
  right,
  showMiddleFor,
  showRightFor,
  narrowTab,
  narrowStart = "middle",
  children,
}: {
  layoutKey: string
  left: Side
  middle: { label: string; content: React.ReactNode }
  right: Side
  /**
   * On a narrow screen, each new value here switches to the middle panel's
   * tab: a task opened from the inbox or a notice shows at once.
   */
  showMiddleFor?: string
  /**
   * The same for the right panel: each new value switches to its tab, and
   * going back to nothing returns to the middle panel's tab, as closing the
   * project page's task does.
   */
  showRightFor?: string
  /** A fourth tab below 1280px, after the left panel's; the screen draws its content in no panel when wide. */
  narrowTab?: { label: string; content: React.ReactNode }
  /** The tab a narrow screen opens on; the site admin's My dashboard opens on its Daily card. */
  narrowStart?: "left" | "middle"
  /** Windows that open over the screen. */
  children?: React.ReactNode
}) {
  const wide = useWideScreen()
  const [narrowView, setNarrowView] = React.useState<"left" | "middle" | "right" | "extra">(narrowStart)
  const [shownFor, setShownFor] = React.useState(showMiddleFor)
  if (showMiddleFor !== shownFor) {
    setShownFor(showMiddleFor)
    if (showMiddleFor) setNarrowView("middle")
  }
  const [rightFor, setRightFor] = React.useState(showRightFor)
  if (showRightFor !== rightFor) {
    setRightFor(showRightFor)
    if (showRightFor) setNarrowView("right")
    else if (narrowView === "right") setNarrowView("middle")
  }
  const leftRef = React.useRef<PanelImperativeHandle | null>(null)
  const rightRef = React.useRef<PanelImperativeHandle | null>(null)
  const layout = useRememberedPanelLayout(layoutKey)
  const leftState = usePanelCollapsed(leftRef)
  const rightState = usePanelCollapsed(rightRef)
  const toggleLeft = usePanelToggle(leftRef)
  const toggleRight = usePanelToggle(rightRef)
  const leftDoubleClick = useBlankSpaceDoubleClick(toggleLeft)
  const rightDoubleClick = useBlankSpaceDoubleClick(toggleRight)

  if (!wide) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <Tabs value={narrowView} onValueChange={(value) => setNarrowView(value as typeof narrowView)}>
          <TabsList>
            <TabsTrigger value="middle">{middle.label}</TabsTrigger>
            <TabsTrigger value="left">{left.label}</TabsTrigger>
            {narrowTab ? <TabsTrigger value="extra">{narrowTab.label}</TabsTrigger> : null}
            <TabsTrigger value="right">{right.label}</TabsTrigger>
          </TabsList>
        </Tabs>
        {[
          { side: "middle", content: middle.content },
          { side: "left", content: left.content },
          ...(narrowTab ? [{ side: "extra", content: narrowTab.content }] : []),
          { side: "right", content: right.content },
        ].map(({ side, content }) => (
          <WorkspacePanel
            key={side}
            className={narrowView === side ? "flex min-w-0 flex-1 flex-col" : "hidden"}
            inert={narrowView !== side}
          >
            {content}
          </WorkspacePanel>
        ))}
        {children}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ResizablePanelGroup
        key={layout.layoutKey}
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <ResizablePanel
          id="left"
          panelRef={leftRef}
          collapsible
          collapsedSize="0%"
          defaultSize="22%"
          minSize="16%"
          maxSize="36%"
          onResize={leftState.onResize}
        >
          <WorkspacePanel
            collapsed={leftState.collapsed}
            onDoubleClick={leftDoubleClick}
            className="flex flex-col"
          >
            {left.content}
          </WorkspacePanel>
        </ResizablePanel>
        <ResizableHandle gap collapsed={leftState.collapsed} />
        <ResizablePanel id="middle" defaultSize="54%" minSize="32%">
          <WorkspacePanel className="relative flex flex-col">
            {middle.content}
            {leftState.collapsed ? (
              <PanelReopenTab side="left" label={left.showLabel} onClick={toggleLeft} />
            ) : null}
            {rightState.collapsed ? (
              <PanelReopenTab side="right" label={right.showLabel} onClick={toggleRight} />
            ) : null}
          </WorkspacePanel>
        </ResizablePanel>
        <ResizableHandle gap collapsed={rightState.collapsed} />
        <ResizablePanel
          id="right"
          panelRef={rightRef}
          collapsible
          collapsedSize="0%"
          defaultSize="24%"
          minSize="16%"
          maxSize="36%"
          onResize={rightState.onResize}
        >
          <WorkspacePanel
            collapsed={rightState.collapsed}
            onDoubleClick={rightDoubleClick}
            className="flex flex-col"
          >
            {right.content}
          </WorkspacePanel>
        </ResizablePanel>
      </ResizablePanelGroup>
      {children}
    </div>
  )
}
