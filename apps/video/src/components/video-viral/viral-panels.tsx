import * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { useBlankSpaceDoubleClick, usePanelToggle } from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"

/**
 * Viral's three panels, the same shape and handles as the editor: the
 * project (or the collections) on the left, the videos in the middle, the
 * one picked playing on the right. Drag the dividers and the sizes come back
 * next time; double-click a side panel's empty space to shut it.
 *
 * Too narrow for three abreast, the left and middle stack and the right
 * panel opens over them as a sheet when something is picked. Closing it
 * leaves the page where it was, so the grid is still at the same place.
 */

/** Where this browser last left the dividers. One key for every Viral screen. */
const LAYOUT_KEY = "video-viral-horizontal"

export function ViralPanels({
  left,
  middle,
  right,
  leftLabel,
  rightLabel,
  rightOpen,
  onCloseRight,
}: {
  left: React.ReactNode
  middle: React.ReactNode
  right: React.ReactNode
  /** What the reopen tab on the left edge says, e.g. "Show the project". */
  leftLabel: string
  rightLabel: string
  /** On a phone: whether something is picked, so the sheet is up. */
  rightOpen: boolean
  onCloseRight: () => void
}) {
  const desktop = useWideScreen()
  const layout = useRememberedPanelLayout(LAYOUT_KEY)
  const leftRef = React.useRef<PanelImperativeHandle>(null)
  const rightRef = React.useRef<PanelImperativeHandle>(null)
  const [leftCollapsed, setLeftCollapsed] = React.useState(false)
  const [rightCollapsed, setRightCollapsed] = React.useState(false)
  const toggleLeft = usePanelToggle(leftRef)
  const toggleRight = usePanelToggle(rightRef)
  const leftDoubleClick = useBlankSpaceDoubleClick(toggleLeft)
  const rightDoubleClick = useBlankSpaceDoubleClick(toggleRight)

  if (!desktop) {
    return (
      <>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col" style={{ gap: "var(--shell-gutter, 0.75rem)" }}>
            <WorkspacePanel className="flex flex-col">{left}</WorkspacePanel>
            <WorkspacePanel className="flex h-[80vh] flex-col">{middle}</WorkspacePanel>
          </div>
        </ScrollArea>
        <Sheet
          open={rightOpen}
          onOpenChange={(open) => {
            if (!open) onCloseRight()
          }}
        >
          <SheetContent side="bottom" className="flex h-[92vh] flex-col gap-0 p-0">
            <SheetTitle className="sr-only">{rightLabel}</SheetTitle>
            <SheetDescription className="sr-only">
              Close it to go back to the grid where you left it.
            </SheetDescription>
            {right}
          </SheetContent>
        </Sheet>
      </>
    )
  }

  return (
    <ResizablePanelGroup
      key={layout.layoutKey}
      orientation="horizontal"
      className="min-h-0 flex-1"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      <ResizablePanel
        id="viral-left"
        panelRef={leftRef}
        collapsible
        collapsedSize="0%"
        defaultSize="22%"
        minSize="16%"
        maxSize="34%"
        onResize={(size) => setLeftCollapsed(size.asPercentage < 0.5)}
      >
        <WorkspacePanel
          collapsed={leftCollapsed}
          onDoubleClick={leftDoubleClick}
          className="flex flex-col"
        >
          {left}
        </WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap collapsed={leftCollapsed} />
      <ResizablePanel id="viral-middle" defaultSize="50%" minSize="30%">
        <div className="relative h-full min-h-0">
          <WorkspacePanel className="flex flex-col">{middle}</WorkspacePanel>
          {leftCollapsed ? (
            <PanelReopenTab side="left" label={leftLabel} onClick={toggleLeft} />
          ) : null}
          {rightCollapsed ? (
            <PanelReopenTab side="right" label={rightLabel} onClick={toggleRight} />
          ) : null}
        </div>
      </ResizablePanel>
      <ResizableHandle gap collapsed={rightCollapsed} />
      <ResizablePanel
        id="viral-right"
        panelRef={rightRef}
        collapsible
        collapsedSize="0%"
        defaultSize="28%"
        minSize="20%"
        maxSize="46%"
        onResize={(size) => setRightCollapsed(size.asPercentage < 0.5)}
      >
        <WorkspacePanel
          collapsed={rightCollapsed}
          onDoubleClick={rightDoubleClick}
          className="flex flex-col"
        >
          {right}
        </WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
