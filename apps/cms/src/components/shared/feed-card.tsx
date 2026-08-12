import * as React from "react"

import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
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
    <WorkspacePanelHeader
      icon={<Icon className={cn("size-4", iconClassName)} />}
      title={
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="truncate">{title}</span>
          {sample ? <SampleBadge /> : null}
        </span>
      }
      meta={
        meta ? (
          <span className={cn("shrink-0 font-normal", metaClassName)}>
            {meta}
          </span>
        ) : null
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
 * A card header whose right-hand side is a tab strip. `CardTop` centres what
 * it is handed, and an underline tab needs the full height of the row for its
 * line to land on the card's hairline — so this is the same header laid out to
 * stretch instead. Same icon, heading, count and gutters, so a row of cards
 * still lines up whether or not its header carries tabs.
 */
export function CardHeaderRow({
  icon: Icon,
  title,
  meta,
  metaClassName,
  iconClassName,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  meta?: string
  /** For hiding the count on widths where it would squeeze the tabs. */
  metaClassName?: string
  iconClassName?: string
  /** The right-hand side — the tab strip. */
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex h-[3.15rem] shrink-0 items-stretch gap-2.5 border-b px-4 sm:px-5",
        className
      )}
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
      <h2 className="font-heading flex min-w-0 items-center truncate text-[0.99rem] leading-snug font-medium">
        {title}
      </h2>
      {meta ? (
        <div
          className={cn(
            "flex min-w-0 items-center truncate text-xs text-muted-foreground",
            metaClassName
          )}
        >
          {meta}
        </div>
      ) : null}
      <div className="ml-auto flex shrink-0 items-stretch">{children}</div>
    </div>
  )
}

export function EmptyRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p
      className={cn(
        "px-4 py-8 text-center text-sm text-muted-foreground sm:px-5",
        className
      )}
    >
      {children}
    </p>
  )
}
