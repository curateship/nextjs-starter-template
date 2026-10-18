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
import { DATING_PANEL_LAYOUT_KEY } from "@/lib/dating/options"

/**
 * The Dating dashboard as three columns: the cards and matches on the left,
 * the person or the conversation in the middle, and the AI's read, the reply
 * and the phone on the right. Copied from Promo's project columns
 * (`apps/promo/src/components/social/projects/project-columns.tsx`) with its
 * own remembered layout; Date owns this copy.
 *
 * The sides collapse all the way to nothing and leave a tab on the middle
 * column's edge to bring them back, double-clicking a side's blank space shuts
 * it, the dividers drag, and the arrangement is remembered. Below 1280px the
 * columns stack, because three columns on a phone is three unreadable columns:
 * the list alone until something is open (`open`), then that card or
 * conversation with the right column's cards under it. The middle column's
 * header carries the arrow back to the list.
 */
export function DatingColumns({
  left,
  middle,
  right,
  open,
  rightLabel,
  leftLabel,
  children,
}: {
  left: React.ReactNode
  middle: React.ReactNode
  right: React.ReactNode
  /** Whether a card or a conversation is open, which takes the screen below 1280px. */
  open: boolean
  /** The tab that brings the right column back once it is shut. */
  rightLabel: string
  /** The tab that brings the left column back once it is shut. */
  leftLabel: string
  /** Windows, drawn beside the columns. */
  children?: React.ReactNode
}) {
  const desktop = useWideScreen()
  const [leftCollapsed, setLeftCollapsed] = React.useState(false)
  const [rightCollapsed, setRightCollapsed] = React.useState(false)
  const leftRef = React.useRef<PanelImperativeHandle | null>(null)
  const rightRef = React.useRef<PanelImperativeHandle | null>(null)
  const layout = useRememberedPanelLayout(DATING_PANEL_LAYOUT_KEY)

  const toggleLeft = usePanelToggle(leftRef)
  const toggleRight = usePanelToggle(rightRef)
  const leftDoubleClick = useBlankSpaceDoubleClick(toggleLeft)
  const rightDoubleClick = useBlankSpaceDoubleClick(toggleRight)

  if (!desktop) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {open ? (
          <>
            <WorkspacePanel className="flex min-h-[70vh] min-w-0 flex-col">{middle}</WorkspacePanel>
            <WorkspacePanel className="flex min-w-0 flex-col">{right}</WorkspacePanel>
          </>
        ) : (
          <WorkspacePanel className="flex min-w-0 flex-1 flex-col">{left}</WorkspacePanel>
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
          id="list"
          panelRef={leftRef}
          collapsible
          collapsedSize="0%"
          // Opens at its narrowest, so the middle gets the room. Tyler, 6 Oct
          // 2026: each side panel's default is its minimum width. In pixels,
          // not a share of the screen, so a big screen does not make the sides
          // wide (Tyler, 18 Oct 2026: "the min width of the left and right
          // panel is too wide"). Each is the narrowest its header fits in.
          defaultSize="230px"
          minSize="230px"
          maxSize="32%"
          onResize={(size) => setLeftCollapsed(size.asPercentage < 0.5)}
        >
          <WorkspacePanel className="flex flex-col" collapsed={leftCollapsed} onDoubleClick={leftDoubleClick}>
            {left}
          </WorkspacePanel>
        </ResizablePanel>

        <ResizableHandle gap collapsed={leftCollapsed} />

        <ResizablePanel id="middle" minSize="30%">
          <div className="relative flex h-full min-h-0 flex-col">
            <WorkspacePanel className="flex min-h-0 flex-1 flex-col">{middle}</WorkspacePanel>
            {leftCollapsed ? (
              <PanelReopenTab side="left" label={leftLabel} onClick={toggleLeft} />
            ) : null}
            {rightCollapsed ? <PanelReopenTab side="right" label={rightLabel} onClick={toggleRight} /> : null}
          </div>
        </ResizablePanel>

        <ResizableHandle gap collapsed={rightCollapsed} />

        <ResizablePanel
          id="rail"
          panelRef={rightRef}
          collapsible
          collapsedSize="0%"
          defaultSize="280px"
          minSize="280px"
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
