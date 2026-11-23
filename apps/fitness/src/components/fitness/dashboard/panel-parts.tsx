import type * as React from "react"
import type { LucideIcon } from "lucide-react"
import { XIcon } from "lucide-react"

import { DashboardCardHeader, DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * The pieces every panel on a program's dashboard is made of, so all three
 * panels and every view line up with the UI standard's three-column rules: a
 * 57px header row, then a body that scrolls on its own.
 */
export function PanelHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <DashboardCardHeader className={className}>{children}</DashboardCardHeader>
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

/**
 * The right panel with something open (UI standard: "its header holds the
 * status or title on the left, the record's action icons, a cog, then an ×
 * that closes it"). `meta` is the muted words after the title, such as
 * "Exercise 1 of 3 · Chest day"; `actions` are the item's own icons and cog.
 */
export function RightHeader({
  title,
  meta,
  actions,
  closeLabel,
  onClose,
}: {
  title: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
  /** "Close this exercise". */
  closeLabel: string
  onClose: () => void
}) {
  return (
    <DashboardCardTitleHeader
      title={title}
      meta={meta}
      action={
        <div className="flex items-center gap-1">
          {actions}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={closeLabel} onClick={onClose}>
                <XIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{closeLabel}</TooltipContent>
          </Tooltip>
        </div>
      }
    />
  )
}

/**
 * The right panel with nothing open (UI standard): a header naming what will
 * show there, then a centred icon and one line saying what to click.
 * `children` follow under it, for a view whose right panel also holds
 * something that isn't about one item, such as History's last four weeks.
 */
export function RightEmpty({
  title,
  icon: Icon,
  line,
  children,
}: {
  title: string
  icon: LucideIcon
  line: string
  children?: React.ReactNode
}) {
  return (
    <>
      <DashboardCardTitleHeader title={title} />
      <PanelBody>
        <div className="grid justify-items-center gap-2 px-3 py-8 text-center">
          <Icon className="size-5 text-muted-foreground" aria-hidden />
          <p className="max-w-60 text-sm text-muted-foreground">{line}</p>
        </div>
        {children}
      </PanelBody>
    </>
  )
}
