import * as React from "react"
import { LayoutDashboardIcon } from "lucide-react"

import { blockView } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import type { AutomationSectionCounts } from "@/lib/api/automations/automation-page"
import { AUTOMATION_SECTIONS_NODE } from "@/lib/automations/automation-page"
import { AUTOMATION_TAB_LABELS, AUTOMATION_TABS, type AutomationTab } from "@/lib/automations/automations-search"

/**
 * The Automations dashboard's own "/" block: the fixed Dashboards block, a
 * row per section with its count (Tyler, 9 Nov 2026: "The dashboard block can
 * have: Automations, Runs and Waiting on you"). It keeps no values of its own;
 * the dashboard hands them down through `AutomationBlocksProvider`.
 */
export type AutomationBlocks = {
  tab: AutomationTab
  onPickTab: (tab: AutomationTab) => void
  /** A press on the section showing: from an open canvas back to the table. */
  onRepickTab: (tab: AutomationTab) => void
  /** Null while they are read, or when the read failed. */
  counts: AutomationSectionCounts | null
}

const AutomationBlocksContext = React.createContext<AutomationBlocks | null>(null)

export const AutomationBlocksProvider = AutomationBlocksContext.Provider

/**
 * Reads the Dashboards block's counts again. A run started or decided on an
 * open canvas does not send the route's loader round, so the canvas asks for
 * the counts itself; without it the Waiting on you pill stays at its old
 * number until the next section switch.
 */
export const RefreshAutomationCounts = React.createContext<() => void>(() => {})

/** Automations, Runs and Waiting on you, the one showing picked. */
export function AutomationSectionsBlock() {
  const blocks = React.useContext(AutomationBlocksContext)
  if (!blocks) {
    return <p className="p-3 text-xs text-muted-foreground">This block shows on the Automations dashboard.</p>
  }
  return (
    <DashboardsRows
      current={blocks.tab}
      onPick={blocks.onPickTab}
      onRepick={blocks.onRepickTab}
      sections={AUTOMATION_TABS.map((tab) => ({
        key: tab,
        label: AUTOMATION_TAB_LABELS[tab],
        value: blocks.counts ? blocks.counts[tab].toLocaleString() : undefined,
      }))}
    />
  )
}

let made: readonly AppBlock[] | null = null

/** The page's own blocks, made once: the Dashboards block, fixed and never in the "/" list. */
export function automationBlocks(): readonly AppBlock[] {
  made ??= [
    {
      key: "sections",
      label: "Dashboards",
      icon: LayoutDashboardIcon,
      node: AUTOMATION_SECTIONS_NODE,
      extension: keepOnPage(
        blockNode(
          AUTOMATION_SECTIONS_NODE,
          {},
          blockView({
            kind: "automation-sections",
            title: "Dashboards",
            icon: <LayoutDashboardIcon />,
            Draw: AutomationSectionsBlock,
            fixed: true,
          })
        )
      ),
      offered: false,
    },
  ]
  return made
}
