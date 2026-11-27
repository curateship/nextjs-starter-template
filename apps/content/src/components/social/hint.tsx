import * as React from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * A word of help on hover or focus, drawn with the shadcn tooltip.
 *
 * Tyler, 13 Oct 2026, pointing at a browser's own grey title box: "tooltips
 * should be using shadcn ui". A `title` attribute draws the browser's box, in
 * its own font and after its own long wait, and never on a disabled button, so
 * every hint in Promo goes through this instead.
 *
 * The child must take a ref and pointer events: a button, a link, or a span.
 * A disabled control never gets the pointer, so its reason goes through
 * `DisabledReason` instead. No label draws the child alone, with no wrapper.
 */
export function Hint({
  label,
  side,
  children,
}: {
  label: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  children: React.ReactElement
}) {
  if (label === null || label === undefined || label === "") return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
