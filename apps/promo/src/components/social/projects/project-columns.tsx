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
import { useBlankSpaceDoubleClick, usePanelToggle } from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { PROJECTS_PANEL_LAYOUT_KEY } from "@/lib/social/reddit/options"

import { ProjectColumnsPick } from "./project-columns-pick"

/**
 * A table drawn inside a column, rather than as a card of its own on the page:
 * the column is already the card, so the table drops its own rounded edge and
 * outline and takes the column's height.
 */
export const IN_COLUMN_TABLE = "rounded-none bg-transparent ring-0"

/**
 * A project's dashboard as three columns: the project and its networks on the
 * left, and the picked network's two panels in the middle and on the right.
 * Every network fills the same frame, so a second network is a second pair of
 * panels and nothing else.
 *
 * The sides collapse all the way to nothing and leave a tab on the middle
 * column's edge to bring them back, double-clicking a side's blank space shuts
 * it, the dividers drag, and the arrangement is remembered.
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
  children,
}: {
  left: React.ReactNode
  middle: React.ReactNode
  right: React.ReactNode
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
  /** Windows, drawn beside the columns. */
  children?: React.ReactNode
}) {
  const desktop = useWideScreen()
  const pick = React.useContext(ProjectColumnsPick)
  const [narrowView, setNarrowView] = React.useState<"left" | "middle" | "right">(rightOpen ? "right" : "middle")
  const [pickShown, setPickShown] = React.useState(pick.key)
  if (pick.key !== pickShown) {
    setPickShown(pick.key)
    setNarrowView("middle")
  }
  const [wasOpen, setWasOpen] = React.useState(rightOpen)
  if (rightOpen !== wasOpen) {
    setWasOpen(rightOpen)
    if (rightOpen) setNarrowView("right")
    else if (narrowView === "right") setNarrowView("middle")
  }
  const [leftCollapsed, setLeftCollapsed] = React.useState(false)
  const [rightCollapsed, setRightCollapsed] = React.useState(false)
  const leftRef = React.useRef<PanelImperativeHandle | null>(null)
  const rightRef = React.useRef<PanelImperativeHandle | null>(null)
  const layout = useRememberedPanelLayout(PROJECTS_PANEL_LAYOUT_KEY)

  const toggleLeft = usePanelToggle(leftRef)
  const toggleRight = usePanelToggle(rightRef)
  const leftDoubleClick = useBlankSpaceDoubleClick(toggleLeft)
  const rightDoubleClick = useBlankSpaceDoubleClick(toggleRight)

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
            <TabsTrigger value="left">Project</TabsTrigger>
            <TabsTrigger value="right">Open</TabsTrigger>
          </TabsList>
        </Tabs>
        {(["middle", "left", "right"] as const).map((column) => (
          <WorkspacePanel
            key={column}
            className={narrowView === column ? "flex min-w-0 flex-1 flex-col" : "hidden"}
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
    <div className="flex min-h-0 flex-1 flex-col">
      <ResizablePanelGroup
        key={layout.layoutKey}
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <ResizablePanel
          id="project"
          panelRef={leftRef}
          collapsible
          collapsedSize="0%"
          // Opens at its narrowest, so the middle gets the room. Tyler, 6 Oct
          // 2026: each side panel's default is its minimum width.
          defaultSize="18%"
          minSize="18%"
          maxSize="32%"
          onResize={(size) => setLeftCollapsed(size.asPercentage < 0.5)}
        >
          <WorkspacePanel className="flex flex-col" collapsed={leftCollapsed} onDoubleClick={leftDoubleClick}>
            {left}
          </WorkspacePanel>
        </ResizablePanel>

        <ResizableHandle gap collapsed={leftCollapsed} />

        <ResizablePanel id="middle" defaultSize="58%" minSize="30%">
          <div className="relative flex h-full min-h-0 flex-col">
            <WorkspacePanel className="flex min-h-0 flex-1 flex-col">{middle}</WorkspacePanel>
            {leftCollapsed ? (
              <PanelReopenTab side="left" label="Show the project and its networks" onClick={toggleLeft} />
            ) : null}
            {rightCollapsed ? <PanelReopenTab side="right" label={rightLabel} onClick={toggleRight} /> : null}
          </div>
        </ResizablePanel>

        <ResizableHandle gap collapsed={rightCollapsed} />

        <ResizablePanel
          id="answer"
          panelRef={rightRef}
          collapsible
          collapsedSize="0%"
          defaultSize="24%"
          minSize="24%"
          maxSize="50%"
          onResize={(size) => setRightCollapsed(size.asPercentage < 0.5)}
        >
          <WorkspacePanel className="flex flex-col" collapsed={rightCollapsed} onDoubleClick={rightDoubleClick}>
            {right}
          </WorkspacePanel>
        </ResizablePanel>
      </ResizablePanelGroup>
      {children}
    </div>
  )
}
