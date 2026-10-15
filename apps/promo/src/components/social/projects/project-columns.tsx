import * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { useBlankSpaceDoubleClick, usePanelToggle } from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { PROJECTS_PANEL_LAYOUT_KEY } from "@/lib/social/reddit/options"

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
 * it, the dividers drag, and the arrangement is remembered. Below 1280px the
 * columns stack, because three columns on a phone is three unreadable columns:
 * the left column and the middle one, one above the other, until the right one
 * has something open (`rightOpen`), which then takes the screen.
 */
export function ProjectColumns({
  left,
  middle,
  right,
  rightOpen,
  rightLabel,
  children,
}: {
  left: React.ReactNode
  middle: React.ReactNode
  right: React.ReactNode
  /** Whether the right column has something open, which takes the screen below 1280px. */
  rightOpen: boolean
  /** The tab that brings the right column back once it is shut. */
  rightLabel: string
  /** Windows, drawn beside the columns. */
  children?: React.ReactNode
}) {
  const desktop = useWideScreen()
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
      <div className="flex min-h-0 flex-1 flex-col">
        {rightOpen ? (
          <WorkspacePanel className="flex min-w-0 flex-1 flex-col">{right}</WorkspacePanel>
        ) : (
          <>
            <WorkspacePanel className="flex min-w-0 flex-1 flex-col">{left}</WorkspacePanel>
            <WorkspacePanel className="flex min-w-0 flex-[2] flex-col">{middle}</WorkspacePanel>
          </>
        )}
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
