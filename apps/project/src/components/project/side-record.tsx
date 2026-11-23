import * as React from "react"

import {
  DashboardCardHeader,
  DashboardCardHeaderIcon,
  DashboardCardTitleHeader,
} from "@/components/shared/dashboard-card-header"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { RightPanelCover, useRightCover } from "@/components/shared/notes/page-cover"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { PANEL_FOOTER_PADDING, PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { showErrorToast } from "@/lib/toast/error-toast"
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
  rename,
  menu,
  hideLabel,
  footer,
  children,
}: {
  /** The record's type, 16px, drawn in the header's square. */
  icon: React.ReactNode
  title: string
  /**
   * Makes the title a box to rename the record in, as the open task's is
   * (Tyler, 16 Nov 2026: "clicking on the title for note and milestone i
   * should able to edit it too like this tasks"). Milestones use it. A note's
   * name is its first line, so the Notes panel leaves it out and the title
   * reads only, as it does wherever this is left out.
   */
  rename?: { label: string; maxLength: number; empty: string; onSave: (next: string) => void }
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
      {rename ? (
        // The title takes the row, as the task's does, so the box is as wide as the header allows.
        <DashboardCardHeader className={cn("gap-2.5", cover && "border-b-transparent")}>
          <DashboardCardHeaderIcon>{icon}</DashboardCardHeaderIcon>
          <div className="min-w-0 flex-1">
            <TitleBox title={title} {...rename} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {menu}
            <SidePanelCollapseButton side="right" label={hideLabel} />
          </div>
        </DashboardCardHeader>
      ) : (
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
      )}
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
 * The title, written in place: the task header's own box (`task-body.tsx`).
 * Enter saves rather than starting a new line, a long title wraps and the
 * header grows with it, and an emptied one goes back with a note saying why.
 */
function TitleBox({
  title,
  label,
  maxLength,
  empty,
  onSave,
}: {
  title: string
  label: string
  maxLength: number
  empty: string
  onSave: (next: string) => void
}) {
  // Follows the saved name, so a rename from elsewhere (the ⋮'s Name) shows here.
  const [draft, setDraft] = useSyncedDraft(title)
  function commit() {
    const next = draft.trim()
    if (next === title) return
    if (!next) {
      setDraft(title)
      showErrorToast(empty)
      return
    }
    onSave(next)
  }
  return (
    <Textarea
      aria-label={label}
      rows={1}
      value={draft}
      maxLength={maxLength}
      onChange={(event) => setDraft(event.target.value.replace(/\n/g, " "))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      // Wraps between words only: beside the type's square a narrow panel leaves the
      // box about 60px, where a box's usual wrapping split "Launch" into "Laun" and "ch".
      // A word wider than the box runs on under its edge instead.
      className="min-h-8 resize-none overflow-x-hidden border-transparent px-2 py-1 text-sm font-semibold [overflow-wrap:normal] shadow-none hover:border-input dark:bg-transparent"
    />
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
