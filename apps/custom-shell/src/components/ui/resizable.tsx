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
  withHandle,
  gap,
  collapsed,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
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
        collapsed && "w-0 bg-transparent aria-[orientation=horizontal]:h-0",
        className
      )}
      {...props}
    >
      {withHandle && !collapsed && (
        <div className="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border" />
      )}
    </ResizablePrimitive.Separator>
  )
}

/**
 * What a workspace's bottom panel collapses to: exactly its own header (the
 * 44px row plus the card's top and bottom hairlines). The panel stays on
 * screen when collapsed — its header holds the reopen controls, and the handle
 * above it keeps its gap so the bar stays draggable back open. Pass `gap`
 * alone to that handle, never `collapsed`.
 */
const BOTTOM_COLLAPSED_HEIGHT = "46px"

function WorkspacePanel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="workspace-panel"
      className={cn(
        // A REAL border, not a ring: these panels sit flush inside
        // resizable-panel containers that clip anything drawn outside the box
        // (so an outward ring vanishes), and their children fill them
        // edge-to-edge (so an inset shadow gets painted over). Settings →
        // Styling width/color reach it via the workspace-panel rule in
        // theme.css.
        //
        // bg-clip-padding is load-bearing: the border color is translucent,
        // and every other card's border line composites over the muted PAGE
        // background. Without the clip, this border would composite over the
        // panel's own white background and wash out to near-invisible —
        // clipping the background to the padding box lets the page background
        // show through the border strip, so the line renders exactly like
        // Card/TableSurface borders do.
        "h-full min-h-0 overflow-hidden rounded-xl border border-foreground/10 bg-card bg-clip-padding",
        className
      )}
      {...props}
    />
  )
}

export {
  BOTTOM_COLLAPSED_HEIGHT,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
}
