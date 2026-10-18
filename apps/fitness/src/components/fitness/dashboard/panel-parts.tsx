import type * as React from "react"

import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { ScrollArea } from "@/components/ui/scroll-area"

/**
 * The two pieces every panel on a program's dashboard is made of, so all
 * three panels and every view line up: a 57px header row, then a body that
 * scrolls on its own.
 */
export function PanelHeader({ children }: { children: React.ReactNode }) {
  return <DashboardCardHeader>{children}</DashboardCardHeader>
}

export function PanelBody({ children, padded = true }: { children: React.ReactNode; padded?: boolean }) {
  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      {padded ? <div className="grid gap-3 p-3">{children}</div> : children}
    </ScrollArea>
  )
}

/**
 * A middle view's row of controls under the dashboard's tabs: search,
 * filters, then the one primary action last, the same order as a dashboard
 * table's toolbar.
 */
export function PanelToolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">{children}</div>
}

/** A view's quiet line when there is nothing to show yet. */
export function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <p className="p-3 text-sm text-muted-foreground">{children}</p>
}
