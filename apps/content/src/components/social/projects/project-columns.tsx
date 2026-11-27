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
import { useOptionalShellRuntime } from "@/components/shell/shell-layout"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useBlankSpaceDoubleClick, usePanelCollapsed, usePanelFold, usePanelToggle } from "@/lib/layout/panel-collapse"
import { sidePanelWidthsKey, useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { clampSidePanelWidth, DEFAULT_LEFT_PANEL_WIDTH, DEFAULT_RIGHT_PANEL_WIDTH } from "@/lib/layout/styling-values"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { cn } from "@/lib/utils"
import { PROJECTS_PANEL_LAYOUT_KEY } from "@/lib/social/reddit/options"

import { ProjectColumnsPick } from "./project-columns-pick"

/**
 * A table's name column takes the room the other columns leave and cuts a
 * long name short with "…", never narrower than its 160px floor: a post
 * title as long as a paragraph would otherwise widen the table past the
 * panel and push its figures off the edge (Tyler, 12 Nov 2026, of Reddit's
 * Commenting: "this is a crazy ui"). Set from the frame, so the shell's table
 * is not edited.
 */
const MIDDLE_TABLES = "[&_td[data-column=main]]:w-full [&_td[data-column=main]]:max-w-0"

/**
 * A table drawn inside a column, rather than as a card of its own on the page:
 * the column is already the card, so the table drops its own rounded edge and
 * outline and takes the column's height.
 */
export const IN_COLUMN_TABLE = "rounded-none bg-transparent ring-0"

/**
 * A project's dashboard as three columns: the Projects dashboard's left panel
 * on the left, and what the project's tab shows in the middle and on the
 * right (Tyler, 27 Nov 2026: "click project > middle and right panel
 * change"). The middle's one header starts with the project's controls
 * (`ProjectHeaderLead`), then the list's own. Every network fills
 * the same frame, so a second network is a second pair of panels and nothing
 * else.
 *
 * `left` is null on a guest's page, which must not list every project, and
 * `right` is null on Content's Videos, whose videos open the editor on the
 * whole screen; the middle then takes that column's room.
 *
 * Drawn as Project's own three-panel frame is (Tyler, 12 Nov 2026: "the
 * project page itsel is not updated to the new design"). The sides open at
 * the Styling widths, fold with a slide from their header's collapse button
 * or a double-click on blank space, and come back from the middle's header
 * (or a knob on its edge, for a network whose header has no reopen buttons
 * yet). The dividers drag, and the widths are remembered. Not the shell's
 * `ThreePanels`: a guest from Project opens this page outside the signed-in
 * area, where that frame cannot read where it was.
 *
 * Below 1280px one column shows at a time, as on every three-column dashboard
 * (UI standard, "Under 1280px, one panel at a time"): a row of the three
 * column names above them, the hidden two kept drawn and `inert`, so each
 * keeps its tab, scroll and loaded list. A row picked in the left column
 * shows the middle one; something opened by a press (`rightOpen`) shows the
 * right one, and closing it goes back to the middle. A post that opened by
 * itself waits behind its name.
 */
export function ProjectColumns({
  left,
  middle,
  right,
  rightOpen,
  rightLabel,
  onCloseRight,
  reopenInHeader = false,
  children,
}: {
  left: React.ReactNode | null
  middle: React.ReactNode
  right: React.ReactNode | null
  /**
   * Whether something was opened in the right column by a press, which shows
   * it below 1280px. Leave out anything that opened by itself.
   */
  rightOpen: boolean
  /** The tab that brings the right column back once it is shut. */
  rightLabel: string
  /**
   * Below 1280px, called when the right column is left by its name in the
   * row above, so pressing the same post again shows it again.
   */
  onCloseRight?: () => void
  /**
   * The middle's header draws the shell's `PanelReopenButton`s, so a shut
   * side comes back from there rather than from a knob on the middle's edge.
   * A network whose header does not yet leaves it off.
   */
  reopenInHeader?: boolean
  /** Windows, drawn beside the columns. */
  children?: React.ReactNode
}) {
  const desktop = useWideScreen()
  const pick = React.useContext(ProjectColumnsPick)
  const hasLeft = left !== null
  const hasRight = right !== null
  const [narrowView, setNarrowView] = React.useState<"left" | "middle" | "right">(rightOpen && hasRight ? "right" : "middle")
  const [pickShown, setPickShown] = React.useState(pick.key)
  if (pick.key !== pickShown) {
    setPickShown(pick.key)
    setNarrowView("middle")
  }
  const [wasOpen, setWasOpen] = React.useState(rightOpen)
  if (rightOpen !== wasOpen) {
    setWasOpen(rightOpen)
    if (rightOpen && hasRight) setNarrowView("right")
    else if (narrowView === "right") setNarrowView("middle")
  }
  const leftRef = React.useRef<PanelImperativeHandle | null>(null)
  const rightRef = React.useRef<PanelImperativeHandle | null>(null)
  // Each side opens at the width Settings → Styling → Side panels sets, and
  // neither drags narrower, as on the shell's dashboards and Project's frame
  // (`apps/project/src/components/project/three-panels.tsx`). A width dragged
  // in this browser still wins, kept under the key with the two widths added.
  const styling = useOptionalShellRuntime()?.config.styling
  const leftWidth = clampSidePanelWidth(styling?.leftPanelWidth, DEFAULT_LEFT_PANEL_WIDTH)
  const rightWidth = clampSidePanelWidth(styling?.rightPanelWidth, DEFAULT_RIGHT_PANEL_WIDTH)
  // A column left out gives its room to the middle, with widths of its own kept under their own key.
  const middleWidth = 100 - (hasLeft ? leftWidth : 0) - (hasRight ? rightWidth : 0)
  const defaultLayout = React.useMemo(
    () => ({ ...(hasLeft ? { left: leftWidth } : {}), middle: middleWidth, ...(hasRight ? { right: rightWidth } : {}) }),
    [hasLeft, hasRight, leftWidth, middleWidth, rightWidth]
  )
  const shapeKey = `${PROJECTS_PANEL_LAYOUT_KEY}${hasLeft ? "" : "-no-left"}${hasRight ? "" : "-no-right"}`
  const layout = useRememberedPanelLayout(sidePanelWidthsKey(shapeKey, leftWidth, rightWidth), defaultLayout)
  const leftState = usePanelCollapsed(leftRef)
  const rightState = usePanelCollapsed(rightRef)
  // Every fold and open slides rather than snapping (`usePanelFold`).
  const { fold, className: foldingClassName } = usePanelFold()
  const snapLeft = usePanelToggle(leftRef)
  const snapRight = usePanelToggle(rightRef)
  const toggleLeft = React.useCallback(() => fold(snapLeft), [fold, snapLeft])
  const toggleRight = React.useCallback(() => fold(snapRight), [fold, snapRight])
  const leftDoubleClick = useBlankSpaceDoubleClick(toggleLeft)
  const rightDoubleClick = useBlankSpaceDoubleClick(toggleRight)
  // The side headers' collapse buttons and the middle header's reopen
  // buttons work through these, as in the shell's frame.
  const toggles = React.useMemo(
    () => ({ left: toggleLeft, right: toggleRight, leftCollapsed: leftState.collapsed, rightCollapsed: rightState.collapsed }),
    [toggleLeft, toggleRight, leftState.collapsed, rightState.collapsed]
  )

  if (!desktop) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <Tabs
          value={narrowView}
          onValueChange={(value) => {
            if (narrowView === "right" && value !== "right" && rightOpen) onCloseRight?.()
            setNarrowView(value as typeof narrowView)
          }}
        >
          <TabsList>
            <TabsTrigger value="middle">{pick.label}</TabsTrigger>
            {hasLeft ? <TabsTrigger value="left">Projects</TabsTrigger> : null}
            {hasRight ? <TabsTrigger value="right">Open</TabsTrigger> : null}
          </TabsList>
        </Tabs>
        {(["middle", ...(hasLeft ? ["left" as const] : []), ...(hasRight ? ["right" as const] : [])] as const).map((column) => (
          <WorkspacePanel
            key={column}
            className={cn(narrowView === column ? "flex min-w-0 flex-1 flex-col" : "hidden", column === "middle" && [middleGutterClassName, "[&_td[colspan]]:whitespace-normal", MIDDLE_TABLES])}
            inert={narrowView !== column}
          >
            {column === "middle" ? middle : column === "left" ? left : right}
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
          {hasLeft ? (
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
            <WorkspacePanel className="flex flex-col" collapsed={leftState.collapsed} onDoubleClick={leftDoubleClick}>
              {left}
            </WorkspacePanel>
          </ResizablePanel>
          ) : null}

          {hasLeft ? <ResizableHandle gap collapsed={leftState.collapsed} /> : null}

          <ResizablePanel id="middle" defaultSize={`${middleWidth}%`} minSize="28%">
            {/* 24px at the middle's sides, its header and a table's first and last columns lining up. */}
            <WorkspacePanel className={cn("relative flex min-h-0 flex-col [&_td[colspan]]:whitespace-normal", MIDDLE_TABLES, middleGutterClassName)}>
              {middle}
              {hasLeft && leftState.collapsed && !reopenInHeader ? (
                <PanelReopenTab side="left" label="Show the Projects page" onClick={toggleLeft} />
              ) : null}
              {hasRight && rightState.collapsed && !reopenInHeader ? <PanelReopenTab side="right" label={rightLabel} onClick={toggleRight} /> : null}
            </WorkspacePanel>
          </ResizablePanel>

          {hasRight ? <ResizableHandle gap collapsed={rightState.collapsed} /> : null}

          {hasRight ? (
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
            <WorkspacePanel className="flex flex-col" collapsed={rightState.collapsed} onDoubleClick={rightDoubleClick}>
              {right}
            </WorkspacePanel>
          </ResizablePanel>
          ) : null}
        </ResizablePanelGroup>
        {children}
      </div>
    </SideTogglesProvider>
  )
}
