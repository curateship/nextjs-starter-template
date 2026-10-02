import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import {
  slidingPillMotionClassName,
  useSlidingPill,
} from "@/lib/hooks/use-sliding-pill"
import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

// Segmented style per the UI rules: muted container, raised selected tab, and
// triggers that stay content-width instead of stretching. The raised white
// background is one pill behind the triggers rather than a background on the
// selected trigger, so switching tabs slides it across instead of blinking it
// from one tab to the next. It is measured from the selected trigger, because
// the triggers are content-width and "Overview" is wider than "AI".
function TabsList({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const { trackRef, trackProps, pillProps } = useSlidingPill<HTMLDivElement>({
    selected: '[data-slot="tabs-trigger"][data-state="active"]',
    observe: '[data-slot="tabs-trigger"]',
    attributes: ["data-state"],
    className: "rounded-md",
  })

  return (
    <TabsPrimitive.List
      ref={trackRef}
      data-slot="tabs-list"
      {...trackProps}
      className={cn(
        "relative inline-flex h-8 w-fit items-center justify-center rounded-lg bg-muted/60 p-0.5 text-muted-foreground",
        className
      )}
      {...props}
    >
      <span data-slot="tabs-pill" {...pillProps} />
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative z-10 inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
        slidingPillMotionClassName,
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:text-foreground",
        // Before the pill is measured, the chosen tab carries the raised
        // background itself. See `use-sliding-pill.ts`.
        "in-data-[pill=pending]:data-[state=active]:bg-background in-data-[pill=pending]:data-[state=active]:shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
