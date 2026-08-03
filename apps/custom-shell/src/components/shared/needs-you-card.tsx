import * as React from "react"
import { Link } from "@tanstack/react-router"
import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CardTop, EmptyRow, FeedCard } from "@/components/shared/feed-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { plural } from "@/lib/plural"
import { titleLink } from "@/lib/title-link"
import { cn } from "@/lib/utils"

/**
 * The handful of things somebody has to do something about, most pressing
 * first. A row only appears while it is true.
 *
 * The card only draws what it is handed. Which rows belong on it is a question
 * about a page's own numbers, so the rules live apart from it —
 * `buildOverviewNeedsYou` puts the Overview's list together out of the four
 * feeds' rules and its own, and `buildMembershipNeedsYou` does the same for the
 * Membership page's accounts-and-money list.
 *
 * Two pages carry one of these, so the heading is settable. Without that they
 * would be two cards with the same title and different rows, which reads as the
 * same card gone wrong rather than as two different lists.
 */

export type NeedsYouItem = {
  id: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  detail: string
  action: string
  to: string
  /** Set when the row is about one record the page can open on arrival. */
  search?: { open: string }
  /** Set when the row points at a block further down the same page. */
  hash?: string
}

export function NeedsYouCard({
  items,
  title = "Needs you",
  icon,
  className,
}: {
  items: NeedsYouItem[]
  /** Defaults to "Needs you" — set it when a page carries a narrower list. */
  title?: string
  /** Shown instead of the warning triangle while there are rows. */
  icon?: React.ComponentType<{ className?: string }>
  className?: string
}) {
  return (
    <FeedCard className={className}>
      <CardTop
        icon={items.length ? (icon ?? TriangleAlertIcon) : CheckCircle2Icon}
        iconClassName={items.length ? "text-amber-500 dark:text-amber-400" : ""}
        title={title}
        meta={
          items.length
            ? `${items.length} ${plural(items.length, "thing")}`
            : undefined
        }
      />
      {items.length ? (
        // Scrolls inside the card when the column gives it less height than
        // the list needs, so the header stays put and the page does not grow.
        // On a card left to size itself this does nothing.
        <ScrollArea className="min-h-0 flex-1">
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
                  <Link to={item.to} search={item.search} hash={item.hash}>
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
    </FeedCard>
  )
}
