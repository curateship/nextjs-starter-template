import * as React from "react"
import { ArrowLeftIcon, RefreshCwIcon } from "lucide-react"

import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"

/**
 * The X module's right column frame: its header, with the way back to the
 * list on a narrow screen, then whatever is open. The header holds a muted
 * title, or the record's own buttons.
 */
export function XPanelFrame({
  title,
  header,
  onBack,
  children,
}: {
  title?: string
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
        {header ?? <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{title}</span>}
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
