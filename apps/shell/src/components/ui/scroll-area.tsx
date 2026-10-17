import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"

import { cn } from "../../lib/utils"

function ScrollArea({
  className,
  viewportClassName,
  children,
  scrollHideDelay = 0,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  /**
   * Classes for the scrolling box itself, which is where a height belongs. The
   * viewport is `size-full`, so a height on the outside only trims the frame —
   * the viewport keeps its full size inside and the overflow is clipped with no
   * way to reach it.
   */
  viewportClassName?: string
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      scrollHideDelay={scrollHideDelay}
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:outline-1 focus-visible:ring-[3px] focus-visible:ring-ring/50",
          // Radix wraps the children in a `display: table` box that sizes
          // itself to its content, so a wide column walks straight past the
          // panel's right edge, no percentage height resolves inside, and a
          // sticky heading cannot stick. Every screen wants a plain block, so
          // the wrapper is one here — with `!` because Radix sets the table
          // as an inline style. Horizontal scrolling still works: the
          // viewport measures its content's overflow, not the wrapper.
          "[&>div]:block!",
          viewportClassName
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
