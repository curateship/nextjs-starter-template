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

/** Where this browser last left the dividers on the posts dashboard. */
const LAYOUT_KEY = "note-posts-horizontal"

/**
 * The posts dashboard's three panels, copied from the Videos screen's own
 * (`src/components/note-videos/three-panels.tsx`) so the two can change apart:
 * folders and authors on the left, posts in the middle, the picked post on
 * the right.
 *
 * The side panels collapse by being dragged shut or by a double-click on blank
 * space, reopen from the tabs on the middle panel's edge, and the widths are
 * remembered per browser. Below 1280px one panel shows at a time under three
 * tabs. All three stay mounted and the hidden two are `inert`, so switching
 * tabs keeps each panel's scroll and loaded list instead of starting it over.
 */
export function ThreePanels({
  left,
  middle,
  right,
  showRightFor,
}: {
  left: Side
  middle: { label: string; content: React.ReactNode }
  right: Side
  /**
   * On a narrow screen, each new value here switches to the right panel's
   * tab, so picking a card shows it at once. Going back to nothing returns
   * to the middle panel's tab.
   */
  showRightFor?: string
}) {
  const wide = useWideScreen()
  // A page opened with a post already picked, from a notice, starts on it.
  const [narrowView, setNarrowView] = React.useState<"left" | "middle" | "right">(
    showRightFor ? "right" : "middle"
  )
  const [rightFor, setRightFor] = React.useState(showRightFor)
  if (showRightFor !== rightFor) {
    setRightFor(showRightFor)
    if (showRightFor) setNarrowView("right")
    else if (narrowView === "right") setNarrowView("middle")
  }
  const leftRef = React.useRef<PanelImperativeHandle | null>(null)
  const rightRef = React.useRef<PanelImperativeHandle | null>(null)
  const layout = useRememberedPanelLayout(LAYOUT_KEY)
  const leftState = usePanelCollapsed(leftRef)
  const rightState = usePanelCollapsed(rightRef)
  const toggleLeft = usePanelToggle(leftRef)
  const toggleRight = usePanelToggle(rightRef)
  const leftDoubleClick = useBlankSpaceDoubleClick(toggleLeft)
  const rightDoubleClick = useBlankSpaceDoubleClick(toggleRight)

  if (!wide) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <Tabs
          value={narrowView}
          onValueChange={(value) => setNarrowView(value as typeof narrowView)}
        >
          <TabsList>
            <TabsTrigger value="left">{left.label}</TabsTrigger>
            <TabsTrigger value="middle">{middle.label}</TabsTrigger>
            <TabsTrigger value="right">{right.label}</TabsTrigger>
          </TabsList>
        </Tabs>
        {(["left", "middle", "right"] as const).map((side) => (
          <WorkspacePanel
            key={side}
            className={narrowView === side ? "flex min-w-0 flex-1 flex-col" : "hidden"}
            inert={narrowView !== side}
          >
            {side === "middle" ? middle.content : side === "left" ? left.content : right.content}
          </WorkspacePanel>
        ))}
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
          defaultSize="18%"
          minSize="14%"
          maxSize="34%"
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
        <ResizablePanel id="middle" defaultSize="52%" minSize="30%">
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
          defaultSize="30%"
          minSize="20%"
          maxSize="46%"
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
    </div>
  )
}
