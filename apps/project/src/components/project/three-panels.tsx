import * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { middleGutterClassName, SideTogglesProvider } from "@/components/shared/three-panels"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  useBlankSpaceDoubleClick,
  usePanelCollapsed,
  usePanelFold,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { sidePanelWidthsKey, useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import {
  DEFAULT_LEFT_PANEL_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
  clampSidePanelWidth,
} from "@/lib/layout/styling-values"
import { useOptionalShellRuntime } from "@/components/shell/shell-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { cn } from "@/lib/utils"

type Side = { label: string; content: React.ReactNode; showLabel: string }

/**
 * Each side panel opens at the width Settings → Styling → Side panels sets,
 * 10% left and 12% right unless changed, and neither drags narrower than
 * that default, as on the shell's dashboards (`shared/three-panels.tsx`). The
 * middle takes the rest. A width dragged in this browser still wins, kept
 * under the layout key with the two widths added (`sidePanelWidthsKey`), so a
 * changed setting reaches every browser and Reset panels forgets them.
 */

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
  reopenInHeader = false,
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
  /**
   * The middle's header draws the shell's `PanelReopenButton`s, so a shut
   * side panel comes back from there rather than from a knob on the middle's
   * edge (the shell's look since 8 Nov 2026). The side headers' own
   * `SidePanelCollapseButton`s work in this frame as in the shell's.
   */
  reopenInHeader?: boolean
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
  const styling = useOptionalShellRuntime()?.config.styling
  const leftWidth = clampSidePanelWidth(styling?.leftPanelWidth, DEFAULT_LEFT_PANEL_WIDTH)
  const rightWidth = clampSidePanelWidth(styling?.rightPanelWidth, DEFAULT_RIGHT_PANEL_WIDTH)
  const middleWidth = 100 - leftWidth - rightWidth
  const defaultLayout = React.useMemo(
    () => ({ left: leftWidth, middle: middleWidth, right: rightWidth }),
    [leftWidth, middleWidth, rightWidth]
  )
  const layout = useRememberedPanelLayout(sidePanelWidthsKey(layoutKey, leftWidth, rightWidth), defaultLayout)
  const leftState = usePanelCollapsed(leftRef)
  const rightState = usePanelCollapsed(rightRef)
  // Every fold and open slides over 240ms rather than snapping, as on the
  // shell's dashboards (`usePanelFold`).
  const { fold, className: foldingClassName } = usePanelFold()
  const snapLeft = usePanelToggle(leftRef)
  const snapRight = usePanelToggle(rightRef)
  const toggleLeft = React.useCallback(() => fold(snapLeft), [fold, snapLeft])
  const toggleRight = React.useCallback(() => fold(snapRight), [fold, snapRight])
  const leftDoubleClick = useBlankSpaceDoubleClick(toggleLeft)
  const rightDoubleClick = useBlankSpaceDoubleClick(toggleRight)
  const toggles = React.useMemo(
    () => ({
      left: toggleLeft,
      right: toggleRight,
      leftCollapsed: leftState.collapsed,
      rightCollapsed: rightState.collapsed,
    }),
    [toggleLeft, toggleRight, leftState.collapsed, rightState.collapsed]
  )

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
            className={cn(
              narrowView === side ? "flex min-w-0 flex-1 flex-col" : "hidden",
              side === "middle" && middleGutterClassName
            )}
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
    <SideTogglesProvider value={toggles}>
    <div className="flex min-h-0 flex-1 flex-col">
      <ResizablePanelGroup
        groupRef={layout.groupRef}
        orientation="horizontal"
        className={cn("min-h-0 flex-1", foldingClassName)}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <ResizablePanel
          id="left"
          panelRef={leftRef}
          collapsible
          collapsedSize="0%"
          defaultSize={`${leftWidth}%`}
          minSize={`${DEFAULT_LEFT_PANEL_WIDTH}%`}
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
        <ResizablePanel id="middle" defaultSize={`${middleWidth}%`} minSize="28%">
          {/* 24px at the middle's sides, its header and a table's first and last
              columns lining up (the shell's look since 8 Nov 2026). */}
          <WorkspacePanel className={cn("relative flex flex-col", middleGutterClassName)}>
            {middle.content}
            {leftState.collapsed && !reopenInHeader ? (
              <PanelReopenTab side="left" label={left.showLabel} onClick={toggleLeft} />
            ) : null}
            {rightState.collapsed && !reopenInHeader ? (
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
          defaultSize={`${rightWidth}%`}
          minSize={`${DEFAULT_RIGHT_PANEL_WIDTH}%`}
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
    </SideTogglesProvider>
  )
}
