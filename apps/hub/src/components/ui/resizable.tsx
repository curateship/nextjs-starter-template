"use client"

import * as React from "react"
import * as ResizablePrimitive from "react-resizable-panels"
import { cn } from "@/lib/utils/tailwind"

export function ResizablePanelGroup({ className, ...props }: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn("flex h-full w-full aria-[orientation=vertical]:flex-col", className)}
      {...props}
    />
  )
}

export function ResizablePanel(props: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

export function ResizableHandle({ className, gap = false, ...props }: ResizablePrimitive.SeparatorProps & { gap?: boolean }) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "relative flex w-px items-center justify-center bg-border ring-offset-background after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2",
        gap &&
          // Gap between full-screen workspace panels tracks the content-spacing
          // (gutter) setting. The transparent after-strip stays as the drag hit
          // area so panels remain draggable even when the gutter is 0 (flat mode).
          "w-[var(--shell-gutter,0.75rem)] bg-transparent aria-[orientation=horizontal]:h-[var(--shell-gutter,0.75rem)] aria-[orientation=horizontal]:w-full",
        className
      )}
      {...props}
    />
  )
}

export function WorkspacePanel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="workspace-panel"
      className={cn("h-full min-h-0 overflow-hidden rounded-xl border border-foreground/5 bg-card", className)}
      {...props}
    />
  )
}
