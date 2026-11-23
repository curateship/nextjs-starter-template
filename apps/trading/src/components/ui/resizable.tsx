import * as React from "react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  gap,
  collapsed,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  gap?: boolean
  /** The panel on one side is collapsed, so the gutter closes up. */
  collapsed?: boolean
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "relative flex w-px items-center justify-center bg-border ring-offset-background after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90",
        gap &&
          // Gap between full-screen workspace panels tracks the content-spacing
          // setting. The transparent after-strip stays as the drag hit area so
          // panels remain draggable even when the gutter is 0 (flat mode).
          "w-[var(--shell-gutter,0.75rem)] bg-transparent aria-[orientation=horizontal]:h-[var(--shell-gutter,0.75rem)] aria-[orientation=horizontal]:w-full",
        // A hidden neighbour has no edge to separate, so the gutter collapses
        // to nothing and the two remaining panels sit flush.
        collapsed && "w-0 bg-transparent aria-[orientation=horizontal]:h-0",
        className
      )}
      {...props}
    >
      {gap && !collapsed ? (
        // Grab knob: a small grey bar so the gutter reads as draggable.
        <div className="z-10 h-6 w-1 shrink-0 rounded-full bg-border" />
      ) : null}
    </ResizablePrimitive.Separator>
  )
}

/**
 * The header row every bottom workspace panel wears — the automation activity
 * log's bar. 56px tall with a divider under it; content on the left, the
 * panel's own actions pushed right with `ml-auto`. Never a coloured band.
 */
const BOTTOM_PANEL_HEADER =
  "flex min-h-14 shrink-0 items-center gap-2 border-b px-4"

/**
 * What a workspace's bottom panel collapses to: exactly its own header (the
 * 56px row above plus the card's top and bottom hairlines). The panel-collapse
 * toggles live in that row, so collapsing to nothing would take away the very
 * buttons that reopen the panels.
 *
 * Because the panel is still on screen when collapsed, the handle above it
 * keeps its gap — pass `gap` alone, never `collapsed`, or the collapsed bar
 * sits flush against the chart.
 */
const BOTTOM_COLLAPSED_HEIGHT = "58px"

function WorkspacePanel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="workspace-panel"
      className={cn(
        "h-full min-h-0 overflow-hidden rounded-xl border border-foreground/5 bg-card",
        className
      )}
      {...props}
    />
  )
}

export {
  BOTTOM_COLLAPSED_HEIGHT,
  BOTTOM_PANEL_HEADER,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
}
