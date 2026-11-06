import * as React from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The heading of a card that folds on the site admin's left panel: the Daily
 * card's greeting, Pinned projects and Need your attention. It sits inside a
 * Collapsible. The heading is the button that folds and opens the card
 * (Tyler, 30 Oct 2026: "clicking on the text area should uncollpase it"), and
 * the arrow at its right is the same press, shown only while the heading is
 * pointed at or has the keyboard's focus, always on a screen with no pointer.
 * Every card on the panel folds this way (Tyler, 6 Nov 2026: "The pinned
 * project should have the same toggle card like the good morning card").
 *
 * - `line` is the muted line under the title, such as the date and weather.
 * - `count` sits beside the title on a light grey ground (Tyler, 31 Oct 2026:
 *   "should have the amount beside it. Also add a light gray bg to the amount").
 * - `children` sits between the heading and the arrow, such as Pinned
 *   projects' "All projects".
 * - `foldHint` names what folding leaves, as the arrow's hover hint.
 */
export function FoldHeading({
  id,
  icon,
  title,
  line,
  count,
  open,
  foldHint,
  band = false,
  className,
  children,
}: {
  id?: string
  /** Before the title (Tyler, 6 Nov 2026: "Add icon to each card"). */
  icon?: React.ReactNode
  title: React.ReactNode
  line?: React.ReactNode
  count?: number
  open: boolean
  foldHint?: string
  /**
   * A card's heading on a light band running the card's width, with the
   * card's padding (Tyler, 6 Nov 2026: "Add a light bg to the header"). The
   * card's body then brings its own padding, so a folded card is the band alone.
   */
  band?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const arrow = (
    <CollapsibleTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        tabIndex={-1}
        aria-hidden
        // Plain, open or folded, like a panel card's arrow.
        className="opacity-0 transition-opacity group-hover/fold:opacity-100 group-has-[:focus-visible]/fold:opacity-100 aria-expanded:bg-transparent aria-expanded:text-foreground dark:aria-expanded:bg-transparent [@media(hover:none)]:opacity-100"
      >
        <ChevronDown className={cn("size-4 transition-transform duration-200", !open && "-rotate-90")} />
      </Button>
    </CollapsibleTrigger>
  )
  return (
    // Centred on the arrow, which is taller than one line of words, so a one-line
    // heading has no extra room under it (Tyler, 6 Nov 2026: "There is extra padding
    // in the bottom here").
    <div className={cn("group/fold flex items-center gap-2", band && "bg-muted/25 px-3.75 py-2.5", className)}>
      {icon ? <span className="flex shrink-0 text-muted-foreground [&>svg]:size-4">{icon}</span> : null}
      <h2 id={id} className="min-w-0 flex-1 text-base leading-tight font-semibold">
        <CollapsibleTrigger asChild>
          <button type="button" className={cn("grid w-full cursor-pointer gap-0.5 rounded-md text-left select-none", focusRingInset)}>
            {/* The count follows the words, so in a narrow panel it drops to the next
                line rather than squeezing the title onto two. */}
            <span className="min-w-0">
              {title}
              {count === undefined ? null : (
                <span className="ml-2 inline-block rounded-md bg-muted px-1.5 py-0.5 align-middle text-xs font-medium text-muted-foreground tabular-nums">
                  {count}
                </span>
              )}
            </span>
            {line ? <span className="text-sm font-normal text-muted-foreground">{line}</span> : null}
          </button>
        </CollapsibleTrigger>
      </h2>
      {children}
      {foldHint ? (
        <Tooltip>
          <TooltipTrigger asChild>{arrow}</TooltipTrigger>
          <TooltipContent>{open ? foldHint : "Open it again"}</TooltipContent>
        </Tooltip>
      ) : (
        arrow
      )}
    </div>
  )
}
