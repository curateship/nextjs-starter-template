import * as React from "react"

import { ActionRow, TextPickRow } from "@/components/crm/crm-record-menu"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { RightPanelCover, useRightCover } from "@/components/shared/notes/page-cover"
import { PickGroup } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { PANEL_FOOTER_PADDING } from "@/lib/layout/panel-gutter"
import { cn } from "@/lib/utils"

/**
 * The parts every Bots record shares on the right panel (the Admin 3 panel
 * design, "Right panel"): the record ⋮, and the tabbed panel an opened
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
 * The record ⋮: the tabbed menu, 20.4rem wide, with one General tab. Its
 * grouped rows (the Name, where the record has one), then the actions as
 * ghost rows, Delete in red under a line.
 */
export function RecordMenu({
  label,
  name,
  actions,
}: {
  /** "Backtest menu". */
  label: string
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
      ]}
    />
  )
}

/**
 * An opened backtest or bot on the right: its tabs in the header (Figures
 * first, then the run's own lists), the record ⋮, the collapse button at the
 * edge, the picked tab's panel, and a footer with the state and main button.
 * The run's name is in the middle's header already, so it is not said twice.
 */
export function OpenRunPanel({
  tabs,
  value,
  onValueChange,
  menu,
  hideLabel,
  footer,
  children,
}: {
  tabs: { value: string; label: string; count?: number }[]
  value: string
  onValueChange: (value: string) => void
  menu: React.ReactNode
  hideLabel: string
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  const cover = useRightCover()
  return (
    <div className="relative isolate flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <RightPanelCover />
      <div>
        <DashboardCardHeader className={cn("gap-1", cover && "border-b-transparent")}>
          <DashboardTabs value={value} onValueChange={onValueChange} tabs={tabs} />
          {menu}
          <SidePanelCollapseButton side="right" label={hideLabel} />
        </DashboardCardHeader>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {footer ? (
        <div className={cn("flex shrink-0 flex-wrap items-center gap-2 border-t", PANEL_FOOTER_PADDING)}>{footer}</div>
      ) : null}
    </div>
  )
}
