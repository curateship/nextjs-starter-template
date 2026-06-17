import * as React from "react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

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

function ResizableHandle({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator>) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "relative flex h-px w-full cursor-row-resize items-center justify-center bg-border transition-colors after:absolute after:top-1/2 after:left-0 after:h-2 after:w-full after:-translate-y-1/2 after:content-[''] focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
        className
      )}
      {...props}
    />
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
