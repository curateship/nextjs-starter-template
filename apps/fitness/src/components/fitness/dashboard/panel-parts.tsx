import type * as React from "react"

import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

/**
 * The two pieces every panel on a program's dashboard is made of, so all
 * three panels and every view line up: a 57px header row, then a body that
 * scrolls on its own.
 */
export function PanelHeader({ plain = false, children }: { plain?: boolean; children: React.ReactNode }) {
  // `plain` drops the line under the header, for panels Tyler drew on 18 Oct
  // 2026 where the body runs straight on from the header.
  return <DashboardCardHeader className={cn(plain && "border-b-0")}>{children}</DashboardCardHeader>
}

export function PanelBody({ children, padded = true }: { children: React.ReactNode; padded?: boolean }) {
  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      {padded ? <div className="grid gap-3 p-3">{children}</div> : children}
    </ScrollArea>
  )
}

/** A view's quiet line when there is nothing to show yet. */
export function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <p className="p-3 text-sm text-muted-foreground">{children}</p>
}
