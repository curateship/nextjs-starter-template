import * as React from "react"
import { ChevronDown } from "lucide-react"

import { CollapsibleTrigger } from "@/components/ui/collapsible"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * A heading on the site admin's left panel, such as Projects or Need your
 * attention, that folds what is under it. It sits inside a Collapsible:
 * pressing the heading, or the arrow at its right that shows while it is
 * pointed at, folds it, as the Daily card's sections do (Tyler, 31 Oct 2026:
 * "its arrow toggle"). `count` sits beside the title on a light grey
 * ground (Tyler, the same day: "should have the amount beside it. Also add a
 * light gray bg to the amount"). `children` sits between the heading and the
 * arrow, such as Projects' "Hidden 2".
 */
export function FoldHeading({
  id,
  title,
  count,
  className,
  children,
}: {
  id?: string
  title: React.ReactNode
  count?: number
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn("group/fold flex items-center gap-2", className)}>
      <h2 id={id} className="min-w-0 flex-1">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full min-w-0 cursor-pointer items-center rounded-md text-left text-base leading-tight font-semibold select-none",
              focusRingInset
            )}
          >
            <span className="min-w-0 truncate">{title}</span>
            {count === undefined ? null : (
              <span className="ml-2 shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                {count}
              </span>
            )}
          </button>
        </CollapsibleTrigger>
      </h2>
      {children}
      {/* The heading is the button; the arrow is the same press for the pointer, left
          out of the keyboard's way, and shown while the heading is pointed at. */}
      <CollapsibleTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-0 transition-opacity group-hover/fold:opacity-100 group-has-[:focus-visible]/fold:opacity-100 data-[state=closed]:[&>svg]:-rotate-90 [@media(hover:none)]:opacity-100"
        >
          <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200" />
        </button>
      </CollapsibleTrigger>
    </div>
  )
}
