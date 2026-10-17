import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * One card in the Team dashboard's right panel, as Tyler drew it on 14 Oct
 * 2026: a grey box with a border, a 15px heading with a short answer or a
 * button at its right ("1 of 1 checked in", "+ Add"), then its rows.
 * Check-ins, Meetings, Due this day, Workload and Attention all use it, so
 * the cards stacked down the panel read as one set.
 */
export function TeamSideCard({
  title,
  aside,
  className,
  children,
}: {
  /** Left out for a card whose rows say it all, such as Attention's. */
  title?: string
  aside?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <section
      aria-label={title}
      className={cn("grid min-w-0 gap-3 rounded-lg border bg-muted/40 p-4", className)}
    >
      {title ? (
        // Wraps rather than cutting: in a narrow panel the aside takes the next line.
        <div className="flex min-h-7 min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <h3 className="shrink-0 text-[15px] font-semibold whitespace-nowrap">{title}</h3>
          {/* The heading keeps its line; the answer is cut short only once it has a line to itself. */}
          {aside ? (
            // The words sit in a span of their own: a flex box can't cut its own text short.
            <div className="flex min-w-0 items-center text-sm text-muted-foreground">
              <span className="min-w-0 truncate">{aside}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
