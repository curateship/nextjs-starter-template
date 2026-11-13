import * as React from "react"

import { ActionRow, TextPickRow } from "@/components/crm/crm-record-menu"
import { DashboardCardHeader, DashboardCardHeaderIcon, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import {
  InspectorCollapseAllButton,
  InspectorCollapseAllProvider,
  useInspectorCollapseAll,
} from "@/components/shared/inspector-card"
import { RightPanelCover, useRightCover } from "@/components/shared/notes/page-cover"
import { PickGroup } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PANEL_FOOTER_PADDING, PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { cn } from "@/lib/utils"

/**
 * The parts every Bots record shares on the right panel (the Admin 3 panel
 * design, "Right panel"): the record ⋮, and the column of cards an opened
 * backtest or bot shows.
 */

export type RecordAction = {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  /** Drawn red, under a line of its own, last. */
  destructive?: boolean
}

/**
 * The record ⋮: the tabbed menu, 20.4rem wide, General first. Its
 * grouped rows (the Name, where the record has one), then the actions as
 * ghost rows, Delete in red under a line.
 */
export function RecordMenu({
  label,
  name,
  actions,
  tabs = [],
}: {
  /** "Backtest menu". */
  label: string
  /**
   * Tabs after General, such as a recipe's Saved results. `content` is given
   * the call that shuts the menu, for a row that leaves the page.
   */
  tabs?: { value: string; label: string; content: (close: () => void) => React.ReactNode }[]
  /** `note` says what a name does, under the row. */
  name?: { value: string; placeholder?: string; note?: string; onCommit: (name: string) => void }
  actions: RecordAction[]
}) {
  const [open, setOpen] = React.useState(false)
  const plain = actions.filter((action) => !action.destructive)
  const red = actions.filter((action) => action.destructive)
  const run = (action: RecordAction) => {
    setOpen(false)
    action.onClick()
  }
  return (
    <TabbedMenu
      label={label}
      align="end"
      width="20.4rem"
      open={open}
      onOpenChange={setOpen}
      tabs={[
        {
          value: "general",
          label: "General",
          content: (
            <div className="grid gap-3 p-3">
              {name ? (
                <PickGroup
                  title="Details"
                  after={name.note ? <p className="px-1 text-xs text-muted-foreground">{name.note}</p> : undefined}
                >
                  <TextPickRow label="Name" value={name.value} placeholder={name.placeholder} onCommit={name.onCommit} />
                </PickGroup>
              ) : null}
              {plain.length ? (
                <div className="grid">
                  {plain.map((action) => (
                    <ActionRow key={action.label} icon={action.icon} disabled={action.disabled} onClick={() => run(action)}>
                      {action.label}
                    </ActionRow>
                  ))}
                </div>
              ) : null}
              {red.length ? (
                <div className="-mx-3 grid border-t px-3 pt-3">
                  {red.map((action) => (
                    <ActionRow
                      key={action.label}
                      icon={action.icon}
                      destructive
                      disabled={action.disabled}
                      onClick={() => run(action)}
                    >
                      {action.label}
                    </ActionRow>
                  ))}
                </div>
              ) : null}
            </div>
          ),
        },
        ...tabs.map((tab) => ({ value: tab.value, label: tab.label, content: tab.content(() => setOpen(false)) })),
      ]}
    />
  )
}

/**
 * The icon and title at the start of a Bots right panel's header, one shape
 * for the Recipe, Backtest and Bot panels and a recipe's step (Tyler, 11 Nov
 * 2026: "the overview right panel header and the nodes header alignment is
 * not the same", then "Copy the node header left padding"). It is the step
 * header's: the icon's 16px square at the header's own padding, 10px to the
 * title, in the dashboard heading's type. No grey line under the title
 * ("remove this", of the recipe's name). `note` follows the title, as a step
 * not yet added says so.
 */
export function RightPanelHeading({
  icon,
  title,
  note,
}: {
  /** The drawn icon, such as `<WorkflowIcon />`. */
  icon?: React.ReactNode
  title: React.ReactNode
  note?: React.ReactNode
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5">
      {icon ? <DashboardCardHeaderIcon>{icon}</DashboardCardHeaderIcon> : null}
      <h2 className={cn("min-w-0 truncate", dashboardCardHeadingClassName)}>{title}</h2>
      {note ? <span className="min-w-0 truncate text-xs text-muted-foreground">{note}</span> : null}
    </span>
  )
}

/**
 * An opened backtest or bot on the right: a column of folding cards, Result
 * then Trades, in place of the tabs it had (Tyler, 10 Nov 2026: "remove the
 * tabs and put them into collapsible cards instead"). The header names the
 * record, then the button that folds or opens every card, the record ⋮ and the
 * collapse button at the edge; the footer holds the state and main button. The
 * run's own name is in the middle's header already, so it is not said twice.
 */
export function OpenRunPanel({
  title,
  icon: Icon,
  menu,
  hideLabel,
  footer,
  children,
}: {
  /** What the record is: Backtest or Bot. */
  title: string
  /** Drawn before the title, as the Bots left menu draws the section. */
  icon?: React.ComponentType<{ className?: string }>
  menu: React.ReactNode
  hideLabel: string
  footer?: React.ReactNode
  /** The cards, each a `PanelCard`. */
  children: React.ReactNode
}) {
  const cover = useRightCover()
  const collapseAll = useInspectorCollapseAll()
  return (
    <div className="relative isolate flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <RightPanelCover />
      <div>
        <DashboardCardHeader className={cn("gap-2", cover && "border-b-transparent")}>
          <RightPanelHeading icon={Icon ? <Icon /> : undefined} title={title} />
          <InspectorCollapseAllButton
            noun="card"
            nextOpen={collapseAll.nextOpen}
            onPress={() => collapseAll.setAll(collapseAll.nextOpen)}
          />
          {menu}
          <SidePanelCollapseButton side="right" label={hideLabel} />
        </DashboardCardHeader>
      </div>
      <InspectorCollapseAllProvider signal={collapseAll.signal}>
        {/* The scroll box's own inner element is `display: table`, which sizes
            itself to its contents, so a wide figure or table would push every
            card past the panel's edge. A plain block ties it to the panel. */}
        {/* The panel gutter, as every side panel has: the same 15px as the
            footer, and --panel-gutter so a card set to reach the panel's
            edges (Settings -> Styling -> Panel cards) knows how far to go
            (Tyler, 10 Nov 2026: "the outer padding is not wired to the card
            settings"). */}
        <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:block!">
          {/* Marked as a side panel's body, so its first card follows Settings
              -> Styling -> Panel cards -> Opacity, as every side panel's does
              (Tyler, 13 Nov 2026: "the first block on the right panel ... is
              not wired to the opacity setting"). */}
          <div data-side-panel-body="" className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)]", PANEL_GUTTER)}>{children}</div>
        </ScrollArea>
      </InspectorCollapseAllProvider>
      {footer ? (
        <div className={cn("flex shrink-0 flex-wrap items-center gap-2 border-t", PANEL_FOOTER_PADDING)}>{footer}</div>
      ) : null}
    </div>
  )
}
