import * as React from "react"

import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs, type DashboardTab } from "@/components/shared/dashboard-tabs"
import { cn } from "@/lib/utils"

/**
 * Underlined tabs on the right of a low row under a side panel's header, for
 * what opens in place of the panel's cards: Look back's Month, Year and Search
 * and the inbox's All, Unread, Tasks, Flows and News (Tyler, 30 Oct 2026: "put
 * tabs here using underline styling", "tabs align right and reduce tab
 * height", then "fix the inbox tabs too"). `after` sits right of the tabs,
 * such as the inbox's Mark all read ("put the mark all as read icons on the
 * right of the tabs"). The tabs reach the row's own top and
 * bottom edges, so the line under the tab showing sits on its divider.
 */
export function PanelTabsRow({
  value,
  onValueChange,
  tabs,
  after,
  tight = false,
}: {
  value: string
  onValueChange: (value: string) => void
  tabs: DashboardTab[]
  after?: React.ReactNode
  /**
   * 8px between tabs, for a row with many: the inbox's five and Mark all read
   * only fit a panel at its usual 272px that way. They space out to the usual
   * 20px once the row has 320px.
   */
  tight?: boolean
}) {
  return (
    <DashboardCardHeader className="@container relative h-9 min-h-0 gap-1 px-2 py-0">
      {/* 20px between tabs as in a panel header; a tight row closes up to 8px
          until it has room (Tyler, 30 Oct 2026: "why are the tabs so close together"). */}
      <DashboardTabs
        style="underline"
        className={cn("my-0 justify-end", tight && "[&_[role=tablist]]:gap-2 @xs:[&_[role=tablist]]:gap-5")}
        value={value}
        onValueChange={onValueChange}
        tabs={tabs}
      />
      {after}
    </DashboardCardHeader>
  )
}
