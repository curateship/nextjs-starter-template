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

/**
 * The number beside a tab's label: how many rows are behind it.
 *
 * A soft chip in the muted shade, not a coloured number. On the chosen tab it
 * sits on the raised white pill and reads as a chip; on the others it sits on
 * the track, which is the same shade, so it quietly disappears — which is what
 * a count on a tab nobody is looking at should do. A coloured number competes
 * with the label for attention and makes the control look like it is warning
 * about something.
 *
 * Fixed-width digits and a minimum width, so the pill does not jump as the
 * number goes from 9 to 10, and `aria-hidden` because the label beside it
 * already names what is being counted and a screen reader reading "Unread 2"
 * as two separate things is noise. Give the trigger its own full label when
 * the number matters to somebody who cannot see it.
 */
function TabsCount({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="tabs-count"
      aria-hidden
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-xs leading-none font-medium text-muted-foreground tabular-nums",
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

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsCount }
