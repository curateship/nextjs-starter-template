import * as React from "react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { EmptyRow } from "@/components/shared/feed-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { titleLink } from "@/lib/nav/title-link"
import { cn } from "@/lib/utils"

/**
 * The handful of things somebody has to do something about, most pressing
 * first. A row only appears while it is true.
 *
 * It only draws what it is handed. Which rows belong on it is a question about
 * a page's own numbers, so the rules live apart from it —
 * `buildOverviewNeedsYou` puts the Overview's list together out of the four
 * feeds' rules and its own.
 */

export type NeedsYouItem = {
  id: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  detail: string
  action: string
  to: string
  /** Set when the destination has a piece of its path to fill in, like a tab. */
  params?: Record<string, string>
  /**
   * The address the destination list should arrive on: `{ open }` to open one
   * record, or the list's own filter and sort values so the page lands already
   * showing the rows this row is about rather than everything.
   */
  search?: Record<string, string>
  /** Set when the row points at a block further down the same page. */
  hash?: string
}

export function NeedsYouList({ items }: { items: NeedsYouItem[] }) {
  return (
    <>
      {items.length ? (
        // Scrolls inside the card when the column gives it less height than
        // the list needs, so the header stays put and the page does not grow.
        // On a card left to size itself this does nothing.
        //
        // `[&>div]:block!` because Radix wraps what it is given in a
        // `display: table` box, which sizes to its widest line rather than to
        // the card. One long detail line then stretches every row and pushes
        // the buttons out past the card's edge, where they are clipped.
        <ScrollArea
          className="min-h-0 flex-1"
          viewportClassName="[&>div]:block!"
        >
          <div className="divide-y">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3 sm:px-5"
              >
                {/* The top row is the one to do first, so it carries the colour
                    and the solid button; the rest stay quiet. */}
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground",
                    index === 0 &&
                      "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300"
                  )}
                  aria-hidden
                >
                  <item.icon className="size-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col items-start">
                  <Link
                    to={item.to}
                    params={item.params}
                    search={item.search}
                    hash={item.hash}
                    className={cn(titleLink, "max-w-full text-sm font-medium")}
                    title={item.title}
                  >
                    {item.title}
                  </Link>
                  <p
                    className="w-full truncate text-xs text-muted-foreground"
                    title={item.detail}
                  >
                    {item.detail}
                  </p>
                </div>
                <Button asChild variant={index === 0 ? "default" : "outline"}>
                  <Link
                    to={item.to}
                    params={item.params}
                    search={item.search}
                    hash={item.hash}
                  >
                    {item.action}
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <EmptyRow>Nothing needs you right now.</EmptyRow>
      )}
    </>
  )
}
