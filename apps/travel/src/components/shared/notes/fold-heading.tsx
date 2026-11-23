import * as React from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The heading of a card that folds, copied from Project (`apps/project/src/components/project/fold-heading.tsx`, 7 Nov 2026) for the Trade dashboard blocks. In Project: the project page's footer cards (Details,
 * Milestones) and an employee's Daily card greeting. It sits inside a
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
   * The heading of a card that is a box of its own, as the left panel's
   * footer cards are (Tyler, 6 Nov 2026, drawing them as rounded light grey
   * boxes): the card's padding, the count on a white patch, and the arrow
   * always shown. The box brings the grey; the body brings its own padding
   * (`FOOTER_CARD_BODY`), so a folded card is its heading alone.
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
        // Plain, open or folded, like a panel card's arrow. A card that is its own box
        // always shows it, muted, as Tyler drew the footer cards.
        className={cn(
          "aria-expanded:bg-transparent dark:aria-expanded:bg-transparent",
          band
            ? "text-muted-foreground hover:bg-transparent aria-expanded:text-muted-foreground"
            : "opacity-0 transition-opacity group-hover/fold:opacity-100 group-has-[:focus-visible]/fold:opacity-100 aria-expanded:text-foreground [@media(hover:none)]:opacity-100"
        )}
      >
        <ChevronDown className={cn("size-4 transition-transform duration-200", !open && "-rotate-90")} />
      </Button>
    </CollapsibleTrigger>
  )
  return (
    // Centred on the arrow, which is taller than one line of words, so a one-line
    // heading has no extra room under it (Tyler, 6 Nov 2026: "There is extra padding
    // in the bottom here").
    <div className={cn("group/fold flex items-center gap-2", band && "py-2.5 pr-2.5 pl-4", className)}>
      {icon ? <span className="flex shrink-0 text-muted-foreground [&>svg]:size-4">{icon}</span> : null}
      <h2 id={id} className="min-w-0 flex-1 text-base leading-tight font-semibold">
        <CollapsibleTrigger asChild>
          <button type="button" className={cn("grid w-full cursor-pointer gap-0.5 rounded-md text-left select-none", focusRingInset)}>
            {/* The count follows the words, so in a narrow panel it drops to the next
                line rather than squeezing the title onto two. The title itself
                stays on one line and ends in "…" when even that is too wide,
                never broken mid-word (9 Nov 2026, the 10% left panel). */}
            <span className="flex min-w-0 flex-wrap items-center gap-x-2">
              <span className="min-w-0 max-w-full truncate">{title}</span>
              {count === undefined ? null : (
                <span
                  className={cn(
                    "inline-block shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums",
                    band ? "bg-background" : "bg-muted"
                  )}
                >
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
