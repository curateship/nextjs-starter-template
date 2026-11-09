import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * One card on the Team dashboard, as Tyler drew the right panel's on 14 Oct
 * 2026: a grey box with a border, a 15px heading with a short answer or a
 * button at its right ("1 of 1 checked in", "+ Add"), then its rows. Meetings
 * and Due this day under the calendar use it, and inside a team block
 * (Check-ins, Attention) it is a white tile (`TeamSideCardTiles`).
 */
/**
 * Inside a team block on the team's page, each side card is a part of the
 * block's one white tile, a line between parts, with a smaller heading, so
 * the block's own heading is the only big one (Tyler, 7 Nov 2026; one tile
 * since 9 Nov 2026: "Shell look, one tile").
 */
const AsTiles = React.createContext(false)

export function TeamSideCardTiles({ children }: { children: React.ReactNode }) {
  return <AsTiles.Provider value>{children}</AsTiles.Provider>
}

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
  const tile = React.useContext(AsTiles)
  return (
    <section
      aria-label={title}
      className={cn(
        "grid min-w-0 gap-3",
        // In a block, the block's one white tile holds every card, a line between them.
        tile ? "border-t p-3 first:border-t-0" : "rounded-lg border bg-muted/40 p-4",
        className
      )}
    >
      {title ? (
        // Wraps rather than cutting: in a narrow panel the aside takes the next line.
        <div className="flex min-h-7 min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <h3 className={cn("shrink-0 font-semibold whitespace-nowrap", tile ? "text-sm" : "text-[15px]")}>{title}</h3>
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
