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

// Drag handle styled for vertical groups: a thin full-width strip with a centered grabber pill.
function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "relative flex h-2 w-full items-center justify-center bg-border/60 transition-colors hover:bg-border focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 h-1 w-9 rounded-full bg-muted-foreground/50" />
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
