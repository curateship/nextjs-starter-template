import * as React from "react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

// shadcn-style wrappers over react-resizable-panels v4 (Group / Panel / Separator API).
// The library controls display/flex-direction/overflow itself; className is for sizing only.
function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn("h-full w-full", className)}
      {...props}
    />
  )
}

function ResizablePanel({
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

// Orientation-aware drag handle. `gap` renders an invisible spacer handle for
// workspace layouts where panels are separate cards (the site gap is the grip).
function ResizableHandle({
  withHandle,
  gap,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean
  gap?: boolean
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
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border" />
      )}
    </ResizablePrimitive.Separator>
  )
}

// The rounded card shell each workspace panel (palette, canvas, inspector,
// runs) sits in, matching the app's content-surface treatment.
function WorkspacePanel({ className, ...props }: React.ComponentProps<"div">) {
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

export { ResizablePanelGroup, ResizablePanel, ResizableHandle, WorkspacePanel }
