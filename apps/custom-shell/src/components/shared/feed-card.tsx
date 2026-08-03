import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * The pieces every list card shares: a hairline header row with an icon, a
 * title, a quiet count beside it, and whatever belongs on the right. It is
 * built from the shared card header parts, so these titles are the same
 * heading font and size as every other admin card rather than a second look.
 */

export function FeedCard({ className, ...props }: React.ComponentProps<"div">) {
  return <Card className={cn("min-w-0 gap-0 py-0", className)} {...props} />
}

export function CardTop({
  icon: Icon,
  title,
  meta,
  metaClassName,
  iconClassName,
  action,
  sample = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  meta?: string
  /** For hiding the count on widths where it would squeeze the title. */
  metaClassName?: string
  iconClassName?: string
  action?: React.ReactNode
  /** This card's figures are stand-ins, not yet read from anything real. */
  sample?: boolean
}) {
  return (
    <CardHeader className="min-h-14 items-center border-b pt-4 sm:px-5">
      <CardTitle className="flex min-w-0 items-center gap-2.5">
        <Icon
          className={cn("size-4 shrink-0 text-muted-foreground", iconClassName)}
          aria-hidden
        />
        <span className="truncate">{title}</span>
        {sample ? <SampleBadge /> : null}
        {meta ? (
          <span
            className={cn(
              "shrink-0 text-xs font-normal text-muted-foreground",
              metaClassName
            )}
          >
            {meta}
          </span>
        ) : null}
      </CardTitle>
      {/* `row-span-1` undoes `CardAction`'s default of two. That default is for
          a header with a description under the title; this one never has one,
          so the second row stayed empty and a few pixels tall — enough to pull
          the title up off the middle of the row. */}
      {action ? (
        <CardAction className="row-span-1 self-center">{action}</CardAction>
      ) : null}
    </CardHeader>
  )
}

/**
 * Says a figure is a stand-in. In words, not a colour or a shade — somebody
 * reading in greyscale or with a screen reader has to be able to tell the made
 * up numbers from the real ones just as easily as anyone else.
 */
function SampleBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 border-dashed font-normal", className)}
      title="A stand-in figure. Nothing in the app records this yet."
    >
      Sample
    </Badge>
  )
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
      {children}
    </p>
  )
}
