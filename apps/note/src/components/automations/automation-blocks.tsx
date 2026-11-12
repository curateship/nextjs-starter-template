import * as React from "react"
import { EyeIcon, EyeOffIcon, LayoutDashboardIcon } from "lucide-react"

import { blockView, useBlockMenu } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import type { AutomationSectionCounts } from "@/lib/api/automations/automation-page"
import { AUTOMATION_SECTIONS_NODE } from "@/lib/automations/automation-page"
import { orderSections } from "@/lib/layout/styling-values"
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
  /** The sections hidden in the block's ⋮, with the site's look. */
  hiddenSections: readonly AutomationTab[]
  onHiddenSectionsChange: (hidden: AutomationTab[]) => void
  /** The sections' order, dragged in the block's ⋮. */
  sectionOrder?: readonly string[]
  onSectionOrderChange?: (order: string[]) => void
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

/**
 * Automations and Waiting on you, the one showing picked. Its ⋮ lists each
 * section with an eye that hides or shows it, and the rows drag into a new
 * order (Tyler, 11 Nov 2026: "add this same feature for all apps that has
 * dashboards block"), as Admin's Dashboards block does. The section showing
 * keeps its row until another is picked.
 */
export function AutomationSectionsBlock() {
  const blocks = React.useContext(AutomationBlocksContext)
  const hidden = blocks?.hiddenSections ?? []
  const changeHidden = blocks?.onHiddenSectionsChange
  const ordered = orderSections(AUTOMATION_TABS, blocks?.sectionOrder)
  useBlockMenu(
    changeHidden
      ? ordered.map((tab) => {
          const isHidden = hidden.includes(tab)
          return {
            label: AUTOMATION_TAB_LABELS[tab],
            ariaLabel: `${isHidden ? "Show" : "Hide"} ${AUTOMATION_TAB_LABELS[tab]}`,
            muted: isHidden,
            keepOpen: true,
            end: isHidden ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />,
            sortKey: tab,
            onSelect: () =>
              changeHidden(isHidden ? hidden.filter((other) => other !== tab) : [...hidden, tab]),
          }
        })
      : undefined,
    blocks?.onSectionOrderChange
  )
  if (!blocks) {
    return <p className="p-3 text-xs text-muted-foreground">This block shows on the Automations dashboard.</p>
  }
  return (
    <DashboardsRows
      current={blocks.tab}
      onPick={blocks.onPickTab}
      onRepick={blocks.onRepickTab}
      sections={ordered
        .filter((tab) => tab === blocks.tab || !hidden.includes(tab))
        .map((tab) => ({
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
