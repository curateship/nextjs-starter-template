import * as React from "react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { RightPanelCover, useRightCover } from "@/components/shared/notes/page-cover"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PANEL_FOOTER_PADDING, PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { cn } from "@/lib/utils"

/**
 * A right panel drawn as the other apps draw theirs, Travel's open activity
 * and Promo's open item (Tyler, 16 Nov 2026: "look at the other apps right
 * panel and do it again"), for the project page's Notes and Milestones
 * dashboards: the title header (`DashboardCardTitleHeader`) with the record's
 * type icon in its square, its name, its ⋮ and the button that hides the
 * panel, the cover carried on behind it, the body in the panel gutter, and a
 * footer pinned to the bottom when the record has one.
 */
export function SideRecord({
  icon,
  title,
  menu,
  hideLabel,
  footer,
  children,
}: {
  /** The record's type, 16px, drawn in the header's square. */
  icon: React.ReactNode
  title: string
  /** The ⋮, `SideRecordMenu`; none where the record reads only. */
  menu?: React.ReactNode
  hideLabel: string
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  const cover = useRightCover()
  return (
    <div className="relative isolate flex min-h-0 flex-1 flex-col" role="region" aria-label={title}>
      <RightPanelCover />
      <DashboardCardTitleHeader
        className={cn(cover && "border-b-transparent")}
        icon={icon}
        title={title}
        action={
          <>
            {menu}
            <SidePanelCollapseButton side="right" label={hideLabel} />
          </>
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div data-side-panel-body="" className={cn("grid grid-cols-[minmax(0,1fr)] gap-3", PANEL_GUTTER)}>
          {children}
        </div>
      </ScrollArea>
      {footer ? (
        <div className={cn("flex shrink-0 flex-wrap items-center gap-2 border-t", PANEL_FOOTER_PADDING)}>{footer}</div>
      ) : null}
    </div>
  )
}

/**
 * The record's ⋮, the task's own menu (`TaskMenu`): a General tab, its
 * grouped rows first (`PickGroup`), then the actions as rows, and the delete
 * last in red under a line.
 */
export function SideRecordMenu({
  label,
  open,
  onOpenChange,
  groups,
  actions,
  remove,
}: {
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `PickGroup`s, or nothing for a menu of actions alone. */
  groups?: React.ReactNode
  actions?: React.ReactNode
  remove?: { label: string; icon: React.ReactNode; onSelect: () => void }
}) {
  const general = (
    <div className="grid [&_[data-slot=select-trigger]]:w-full">
      {groups ? <div className="grid gap-4 px-4 py-3">{groups}</div> : null}
      <div className={cn("grid gap-1 px-2 pb-2 empty:hidden [&_[data-slot=button]]:font-normal", !groups && "pt-2")}>
        {actions}
        {remove ? (
          <>
            {actions ? <div className="-mx-2 my-1 border-t" /> : null}
            <Button type="button" variant="ghost" className="justify-start text-destructive hover:text-destructive" onClick={remove.onSelect}>
              {remove.icon}
              {remove.label}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
  return (
    <TabbedMenu
      label={label}
      align="end"
      // As wide as the task's ⋮.
      width="20.4rem"
      open={open}
      onOpenChange={onOpenChange}
      tabs={[{ value: "general", label: "General", content: general }]}
    />
  )
}

/** One action row in `SideRecordMenu`, drawn as the task menu's rows are. */
export function SideRecordAction({
  icon,
  onSelect,
  children,
}: {
  icon: React.ReactNode
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <Button type="button" variant="ghost" className="w-full justify-start font-normal" onClick={onSelect}>
      {icon}
      {children}
    </Button>
  )
}
