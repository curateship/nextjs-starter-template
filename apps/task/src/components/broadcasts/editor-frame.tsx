import * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import {
  BOTTOM_COLLAPSED_HEIGHT,
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import {
  useBlankSpaceDoubleClick,
  usePanelCollapsed,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { useWideScreen } from "@/lib/layout/wide-screen"

/**
 * The frame the email editor and the automation editor share: things to add on
 * the left, the canvas in the middle, the picked thing's options on the right,
 * and a panel along the bottom.
 *
 * Every divider can be dragged, the side panels can be shut away when you want
 * the canvas full width, and where you left them is remembered under each
 * editor's own `layoutKeys`. Double-clicking the empty part of a panel shuts
 * it, and double-clicking what is left of it opens it again. On a narrow
 * screen only the canvas is drawn.
 */
export function EditorFrame({
  layoutKeys,
  palette,
  inspector,
  inspectorPanelRef,
  canvasHeader,
  canvas,
  canvasOverlay,
  reopenLabels,
  bottom,
  onKeyDown,
  children,
}: {
  /** Each editor's own keys, so its saved widths are its own. */
  layoutKeys: { horizontal: string; vertical: string }
  palette: React.ReactNode
  inspector: React.ReactNode
  /** Lets the editor open the options panel when something is picked. */
  inspectorPanelRef: React.RefObject<PanelImperativeHandle | null>
  canvasHeader: React.ReactNode
  canvas: React.ReactNode
  /**
   * Drawn over the canvas on a wide screen. Giving one boxes the canvas below
   * its header, so the overlay and the reopen tabs are placed against the
   * canvas rather than the whole panel.
   */
  canvasOverlay?: React.ReactNode
  reopenLabels: { palette: string; inspector: string }
  /**
   * The panel along the bottom: its id (part of the saved layout), its share
   * of the height, and what it holds. `active` is false while it is shut down
   * to its own header. Left out, there is no bottom panel at all.
   */
  bottom?: {
    id: string
    defaultSize: number
    render: (active: boolean) => React.ReactNode
  }
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>
  /** Dialogs, drawn after the frame. */
  children?: React.ReactNode
}) {
  // Known before the first render on the server too, so the editor opens in the
  // layout it is going to keep rather than painting the narrow one and
  // rebuilding itself a beat later.
  const desktop = useWideScreen()
  const [paletteCollapsed, setPaletteCollapsed] = React.useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = React.useState(false)
  const palettePanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const bottomPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const horizontalLayout = useRememberedPanelLayout(layoutKeys.horizontal)
  const verticalLayout = useRememberedPanelLayout(layoutKeys.vertical)

  const togglePalette = usePanelToggle(palettePanelRef)
  const toggleInspector = usePanelToggle(inspectorPanelRef)
  const toggleBottom = usePanelToggle(bottomPanelRef)

  // Shut, the bottom panel is exactly its own header, and the header's line
  // would sit on top of the panel's bottom edge. See `headerOnly`.
  const bottomShut = usePanelCollapsed(bottomPanelRef)

  const paletteDoubleClick = useBlankSpaceDoubleClick(togglePalette)
  const inspectorDoubleClick = useBlankSpaceDoubleClick(toggleInspector)
  const bottomDoubleClick = useBlankSpaceDoubleClick(toggleBottom)

  const reopenTabs = (
    <>
      {paletteCollapsed ? (
        <PanelReopenTab
          side="left"
          label={reopenLabels.palette}
          onClick={togglePalette}
        />
      ) : null}
      {inspectorCollapsed ? (
        <PanelReopenTab
          side="right"
          label={reopenLabels.inspector}
          onClick={toggleInspector}
        />
      ) : null}
    </>
  )

  const workspace = desktop ? (
    <ResizablePanelGroup
      key={horizontalLayout.layoutKey}
      orientation="horizontal"
      className="min-h-0 flex-1"
      defaultLayout={horizontalLayout.defaultLayout}
      onLayoutChanged={horizontalLayout.onLayoutChanged}
    >
      <ResizablePanel
        id="palette"
        panelRef={palettePanelRef}
        collapsible
        collapsedSize="0%"
        defaultSize="14%"
        minSize="14%"
        maxSize="26%"
        onResize={(size) => setPaletteCollapsed(size.asPercentage < 0.5)}
      >
        <WorkspacePanel
          collapsed={paletteCollapsed}
          onDoubleClick={paletteDoubleClick}
        >
          {palette}
        </WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap collapsed={paletteCollapsed} />
      <ResizablePanel id="canvas" defaultSize="68%" minSize="30%">
        {canvasOverlay === undefined ? (
          <WorkspacePanel className="relative flex flex-col">
            {canvasHeader}
            {canvas}
            {reopenTabs}
          </WorkspacePanel>
        ) : (
          <WorkspacePanel className="flex flex-col">
            {canvasHeader}
            <div className="relative flex min-h-0 flex-1">
              {canvas}
              {canvasOverlay}
              {reopenTabs}
            </div>
          </WorkspacePanel>
        )}
      </ResizablePanel>
      <ResizableHandle gap collapsed={inspectorCollapsed} />
      <ResizablePanel
        id="inspector"
        panelRef={inspectorPanelRef}
        collapsible
        collapsedSize="0%"
        defaultSize="18%"
        minSize="18%"
        maxSize="34%"
        onResize={(size) => setInspectorCollapsed(size.asPercentage < 0.5)}
      >
        <WorkspacePanel
          collapsed={inspectorCollapsed}
          onDoubleClick={inspectorDoubleClick}
        >
          {inspector}
        </WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    // flex-1 and min-w-0 are load-bearing: this sits in a flex row, and with no
    // width to fill it would shrink to its content and read as a stray line.
    <WorkspacePanel className="flex min-w-0 flex-1 flex-col">
      {canvasHeader}
      {canvas}
    </WorkspacePanel>
  )

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ gap: pageGutter }}
      onKeyDown={onKeyDown}
    >
      {/* No bar of its own. The panels are the whole screen — the way back out
          is the sidebar, and the name of this one is already in the strip
          along the top of the page. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {bottom ? (
          <ResizablePanelGroup
            key={verticalLayout.layoutKey}
            orientation="vertical"
            className="min-h-0 flex-1"
            defaultLayout={verticalLayout.defaultLayout}
            onLayoutChanged={verticalLayout.onLayoutChanged}
          >
            <ResizablePanel
              id="workspace"
              defaultSize={`${100 - bottom.defaultSize}%`}
              minSize="40%"
            >
              <div className="flex h-full min-h-0">{workspace}</div>
            </ResizablePanel>
            {/* Keeps its gap even while the panel below is shut — that
                collapsed strip is still a panel on screen, and this handle is
                what drags it back open. Never pass `collapsed` here. */}
            <ResizableHandle gap />
            <ResizablePanel
              id={bottom.id}
              panelRef={bottomPanelRef}
              defaultSize={`${bottom.defaultSize}%`}
              minSize="12%"
              maxSize="60%"
              collapsible
              collapsedSize={BOTTOM_COLLAPSED_HEIGHT}
              onResize={bottomShut.onResize}
            >
              <WorkspacePanel
                onDoubleClick={bottomDoubleClick}
                headerOnly={bottomShut.collapsed}
              >
                {bottom.render(!bottomShut.collapsed)}
              </WorkspacePanel>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="flex h-full min-h-0">{workspace}</div>
        )}
      </div>

      {children}
    </div>
  )
}
