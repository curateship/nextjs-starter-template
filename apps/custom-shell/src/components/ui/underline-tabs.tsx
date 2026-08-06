import * as React from "react"

import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

/**
 * A tab group drawn as plain words with a line under the one you are on,
 * rather than the segmented pills the rest of the app uses.
 *
 * It exists for tab groups that sit on a card's own edge — the Activity card's
 * 7 / 30 day switch and the People card's Joining / Newest / Plans switch, both
 * on the header hairline — where a pill would read as a control floating on the
 * line rather than as part of it. Everywhere else, use the segmented `Tabs`.
 */

export function UnderlineTabsList({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <TabsList
      className={cn(
        "h-full justify-start gap-4 rounded-none bg-transparent p-0",
        className
      )}
    >
      {children}
    </TabsList>
  )
}

export function UnderlineTab({
  label,
  count,
  className,
  ...props
}: React.ComponentProps<typeof TabsTrigger> & {
  label: React.ReactNode
  /** A quiet number after the label. Left off where there is nothing to count. */
  count?: number
}) {
  return (
    <TabsTrigger
      className={cn(
        // The line is drawn on the tab's own bottom edge, so the strip has to
        // pull itself down over the card's hairline for the two to meet.
        "h-full flex-none rounded-none border-b-2 border-transparent px-0.5 font-medium text-muted-foreground data-[state=active]:border-foreground/75 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
        className
      )}
      {...props}
    >
      {label}
      {count !== undefined && count > 0 ? (
        <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-lg bg-muted px-1.5 text-xs leading-none font-medium text-muted-foreground tabular-nums">
          {count}
        </span>
      ) : null}
    </TabsTrigger>
  )
}
