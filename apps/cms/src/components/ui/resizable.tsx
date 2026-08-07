import * as React from "react"
import * as ResizablePrimitive from "react-resizable-panels"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

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
 * 50.4px row plus the card's top and bottom hairlines). The panel stays on
 * screen when collapsed — its header holds the reopen controls, and the handle
 * above it keeps its gap so the bar stays draggable back open. Pass `gap`
 * alone to that handle, never `collapsed`.
 */
const BOTTOM_COLLAPSED_HEIGHT = "52.4px"

function WorkspacePanel({
  className,
  collapsed,
  ...props
}: React.ComponentProps<"div"> & {
  /**
   * The panel this sits in has been collapsed **to nothing** (`collapsedSize`
   * of `0%`). A box with no width still paints its left and right borders,
   * which land on top of each other and leave a stray hairline down the
   * workspace, so the card is taken away entirely while the panel is shut.
   *
   * Never pass this for a panel that collapses to its own header, like the
   * bottom panel on `BOTTOM_COLLAPSED_HEIGHT` — that header is still on screen
   * and still needs its card.
   *
   * The border comes off in `theme.css`, on the `data-collapsed` attribute
   * below: the styling rule there sets the border width from the user's
   * settings and would put it straight back over any class written here.
   */
  collapsed?: boolean
}) {
  return (
    <div
      data-slot="workspace-panel"
      data-collapsed={collapsed ? "true" : undefined}
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

/**
 * A slim tab on the middle panel's edge, shown while a side panel is collapsed,
 * so reopening is discoverable right where the panel disappeared. The arrow
 * points toward where the panel opens.
 */
function PanelReopenTab({
  side,
  label,
  onClick,
}: {
  side: "left" | "right"
  label: string
  onClick: () => void
}) {
  const Icon = side === "left" ? ChevronRightIcon : ChevronLeftIcon
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 z-10 flex h-14 w-5 -translate-y-1/2 items-center justify-center border border-foreground/10 bg-card text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        side === "left"
          ? "left-0 rounded-r-lg border-l-0"
          : "right-0 rounded-l-lg border-r-0"
      )}
    >
      <Icon className="size-4" />
    </button>
  )
}

export {
  BOTTOM_COLLAPSED_HEIGHT,
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
}
