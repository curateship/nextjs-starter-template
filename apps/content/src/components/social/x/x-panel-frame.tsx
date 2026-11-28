import * as React from "react"
import { ArrowLeftIcon, RefreshCwIcon } from "lucide-react"

import { DashboardCardHeader, DashboardCardHeaderIcon, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The X module's right column frame: its header, with the way back to the
 * list on a narrow screen, then whatever is open. The header holds an icon
 * and a title, as every other right panel's does, or the record's own buttons.
 */
export function XPanelFrame({
  title,
  icon,
  header,
  onBack,
  children,
}: {
  title?: string
  /** Beside the title; the way back takes its place on a narrow screen. */
  icon?: React.ReactNode
  header?: React.ReactNode
  /** Only on a narrow screen, where the record covers the list. */
  onBack?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardHeader className="gap-2">
        {onBack ? (
          <Button type="button" size="icon" variant="ghost" aria-label="Back to the list" onClick={onBack}>
            <ArrowLeftIcon />
          </Button>
        ) : null}
        {header ?? (
          <>
            {icon && !onBack ? <DashboardCardHeaderIcon className="[&_svg]:size-4">{icon}</DashboardCardHeaderIcon> : null}
            <span className={cn("min-w-0 flex-1 truncate", dashboardCardHeadingClassName)}>{title}</span>
          </>
        )}
      </DashboardCardHeader>
      {children}
    </div>
  )
}

/** A list that could not be read, with Try again. */
export function XListError({ what, error, onRetry }: { what: string; error: string; onRetry: () => void }) {
  return (
    <div className="grid justify-items-start gap-3 p-4">
      <p className="text-sm text-muted-foreground">
        The {what} could not be read. {error}
      </p>
      <Button type="button" variant="outline" onClick={onRetry}>
        <RefreshCwIcon />
        Try again
      </Button>
    </div>
  )
}
