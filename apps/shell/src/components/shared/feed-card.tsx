import * as React from "react"

import {
  DashboardCardHeader,
  DashboardCardTitleHeader,
  dashboardCardHeadingClassName,
} from "@/components/shared/dashboard-card-header"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * The pieces every list card shares: a hairline header row with an icon, a
 * title, a quiet count beside it, and whatever belongs on the right. It is
 * built from the shared workspace header, so editor panels and admin cards use
 * the same heading font, size and spacing rather than two separate patterns.
 */

export function FeedCard({ className, ...props }: React.ComponentProps<"div">) {
  return <Card className={cn("min-w-0 gap-0 py-0", className)} {...props} />
}

export function CardTop({
  icon: Icon,
  title,
  meta,
  iconClassName,
  action,
  sample = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  meta?: string
  iconClassName?: string
  action?: React.ReactNode
  /** This card's figures are stand-ins, not yet read from anything real. */
  sample?: boolean
}) {
  return (
    <DashboardCardTitleHeader
      icon={<Icon className={cn("size-4", iconClassName)} />}
      title={
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="truncate">{title}</span>
          {sample ? <SampleBadge /> : null}
        </span>
      }
      meta={
        meta ? <span className="shrink-0 font-normal">{meta}</span> : null
      }
      action={action}
    />
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

/**
 * A card header whose right-hand side is a tab strip, drawn as the same pill
 * tabs every other tab group uses, in the card-header tab font. The count
 * beside the heading truncates rather than pushing the tabs off the card.
 * Same icon, heading and gutters as `CardTop`, so a row of cards still lines
 * up whether or not its header carries tabs.
 */
export function CardHeaderRow({
  icon: Icon,
  title,
  meta,
  iconClassName,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  meta?: string
  iconClassName?: string
  /** The right-hand side — the tab strip. */
  children: React.ReactNode
  className?: string
}) {
  return (
    // On a phone the tabs take a row of their own under the title. Beside it,
    // four pills leave the title two letters wide.
    <DashboardCardHeader
      className={cn("flex-wrap gap-2.5 sm:flex-nowrap", className)}
    >
      <span
        className={cn(
          "flex shrink-0 items-center text-muted-foreground",
          iconClassName
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <h2
        className={cn(
          "flex min-w-0 items-center truncate",
          dashboardCardHeadingClassName
        )}
      >
        {title}
      </h2>
      {meta ? (
        <div className="flex min-w-0 items-center truncate text-xs text-muted-foreground">
          {meta}
        </div>
      ) : null}
      <div className="flex w-full shrink-0 items-center sm:ml-auto sm:w-auto">
        {children}
      </div>
    </DashboardCardHeader>
  )
}

export function EmptyRow({
  children,
  className,
  action,
}: {
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "grid justify-items-center gap-3 px-4 py-8 text-center text-sm text-muted-foreground sm:px-5",
        className
      )}
    >
      {children}
      {action}
    </div>
  )
}
